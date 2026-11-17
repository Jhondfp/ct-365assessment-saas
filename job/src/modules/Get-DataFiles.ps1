# ==============================================================================
# MODULO: COLETA DE METADADOS DE ARQUIVOS (SharePoint Online)
# ------------------------------------------------------------------------------
# Paralelismo por site, cada thread com sua propria conexao SQL.
# Versionamento detectado via _UIVersionString quando possivel; chamadas
# CSOM por arquivo sao caras - usadas apenas se versions_count nao puder ser
# inferido. Lotes gravados incrementalmente via Save-FilesInfo.
# ==============================================================================

function Get-DataFiles {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] $Sites,
        [Parameter(Mandatory=$false)] $Connection = $null
    )

    Write-Log -Level INFO -Module 'Files' -Message "Iniciando coleta de arquivos em $($Sites.Count) sites." -DbConnection $Connection
    Report-Step -StepName 'Coleta de Arquivos' -Status 'in progress' -Progress 5 -Info 'Varredura iniciada'

    $throttle = if ($global:params.sites_parallel_size) { [int]$global:params.sites_parallel_size } else { 8 }
    $storeCsv = $global:params.store_in_csv
    $storeSql = $global:params.store_in_sql
    $processSub = $global:params.process_subsites
    $batchSize = if ($global:params.sql_batch_size) { [int]$global:params.sql_batch_size } else { 500 }
    $csvPath  = Get-CsvOutputPath -ModuleName 'files' -FileName 'files_metadados.csv'

    $authData   = $global:auth
    $execId     = $global:executionId
    $base64     = $global:base64Cert
    $paramsCopy = $global:params

    # Resume: pula sites que ja terminaram com sucesso nesta execucao (ver
    # dbo.execution_progress / Complete-SiteProgress) e limpa qualquer linha
    # parcial em files_info dos sites que serao (re)processados agora - evita
    # duplicar o que ja tinha sido "flushado" antes do processo morrer.
    $isResume = [bool]$global:isResume
    if ($storeSql -and $isResume -and $null -ne $Connection) {
        $completedSites = Get-CompletedSiteUrls -Connection $Connection -ModuleName 'files'
        if ($completedSites.Count -gt 0) {
            $totalAntes = $Sites.Count
            $Sites = @($Sites | Where-Object { -not $completedSites.Contains($_.Url) })
            Write-Log -Level INFO -Module 'Files' -Message "Resume: $($totalAntes - $Sites.Count) de $totalAntes sites ja concluidos - pulando." -DbConnection $Connection
        }
        foreach ($s in $Sites) {
            Clear-SiteData -Connection $Connection -TableName 'dbo.files_info' -SiteUrl $s.Url
        }
    }

    $scriptRoot    = (Resolve-Path .).Path
    $pathSP        = Join-Path $scriptRoot 'src\connection\Connect-SharePoint.ps1'
    $pathDB        = Join-Path $scriptRoot 'src\connection\Connect-Database.ps1'
    $pathRepo      = Join-Path $scriptRoot 'src\connection\Repository.ps1'
    $pathLog       = Join-Path $scriptRoot 'src\utils\Write-Log.ps1'
    $pathStatus    = Join-Path $scriptRoot 'src\utils\Handle-Status.ps1'
    $pathCsv       = Join-Path $scriptRoot 'src\utils\Export-Csv.ps1'
    $pathDataFiles = Join-Path $scriptRoot 'src\modules\Get-DataFiles.ps1'

    # Contador compartilhado entre runspaces (hashtable sincronizado = mesmo
    # objeto .NET em todas as threads, ao contrario de variaveis $global: comuns
    # que cada runspace paralelo enxerga isoladas). Usado para progresso real
    # (5% -> 99%) enquanto os sites vao sendo concluidos, em vez de ficar preso
    # em 5% ate a ultima thread terminar.
    $progressSync = [hashtable]::Synchronized(@{ Done = 0 })
    $totalSites   = [Math]::Max($Sites.Count, 1)

    # Mapeia o ManagedThreadId (numero grande e arbitrario do .NET) para um
    # "slot" sequencial pequeno (1, 2, 3...) reaproveitado sempre que o mesmo
    # runspace do pool pega um novo site - fica legivel no log (Thread 1, 2...)
    # em vez do id bruto da thread.
    $threadSlots  = [hashtable]::Synchronized(@{})
    $slotCounter  = [hashtable]::Synchronized(@{ Next = 0 })

    $Sites | ForEach-Object -ThrottleLimit $throttle -Parallel {
        . $using:pathSP
        . $using:pathDB
        . $using:pathRepo
        . $using:pathLog
        . $using:pathStatus
        . $using:pathCsv
        . $using:pathDataFiles  # necessario para Process-Site estar disponivel no runspace

        $global:auth        = $using:authData
        $global:executionId = $using:execId
        $global:params      = $using:paramsCopy

        $site = $_

        # Resolve o slot sequencial desta thread (atribui na primeira vez que
        # este runspace/ManagedThreadId aparece; depois so reutiliza)
        $tid   = [System.Threading.Thread]::CurrentThread.ManagedThreadId
        $slots = $using:threadSlots
        $ctr   = $using:slotCounter
        $threadSlot = 0
        [System.Threading.Monitor]::Enter($slots)
        try {
            if (-not $slots.ContainsKey($tid)) {
                $ctr.Next++
                $slots[$tid] = $ctr.Next
            }
            $threadSlot = $slots[$tid]
        } finally { [System.Threading.Monitor]::Exit($slots) }

        $dbConn = $null
        try {
            if ($using:storeSql) { $dbConn = New-DbConnection }
        } catch {
            Write-Log -Level WARNING -Module 'Files' -SiteUrl $site.Url -Message "Sem DB nesta thread." -Exception $_.Exception.Message
        }

        # Marca conclusao do site (dbo.execution_progress) so quando $siteOk
        # permanece $true - qualquer saida por erro abaixo vira $false, o que
        # deixa o site elegivel para reprocessamento num resume futuro. So
        # cobre o site principal: falha isolada numa subsite (catch dentro do
        # loop de subsites abaixo) nao derruba $siteOk do site pai.
        $siteOk = $true

        Write-Log -Level INFO -Module 'Files' -SiteUrl $site.Url -Message "Thread $threadSlot - Iniciando coleta do site: $($site.Title) | URL: $($site.Url)" -DbConnection $dbConn

        $batchLocal = New-Object System.Collections.Generic.List[object]
        $campos = @('Id','FileRef','Created','Modified','Author','Editor','File_x0020_Size','UniqueId',
                    '_ComplianceTag','_UIVersionString','_DisplayName','StreamHash','FileLeafRef',
                    'OData__UIVersionString','FileSystemObjectType')

        $ctxSite = $null
        try {
            $ctxSite = Connect-SPOSite -SiteUrl $site.Url `
                            -ClientId     $using:authData.client_id `
                            -CertBase64   $using:base64 `
                            -ClientSecret $using:authData.client_secret `
                            -Tenant       $using:authData.tenant_id
            if (-not $ctxSite) {
                Write-Log -Level ERROR -Module 'Files' -SiteUrl $site.Url -Message 'Falha ao conectar no site - pulado sem coletar arquivos.' -DbConnection $dbConn
                $siteOk = $false
                return
            }
            if ($ctxSite.PSObject.Properties['Context'] -and $null -ne $ctxSite.Context) {
                $ctxSite.Context.RequestTimeout = -1
            }

            # Coleta no site pai
            Process-Site -Site $site -Web $null -CtxSite $ctxSite -Campos $campos `
                         -IsSubsite $false -BatchLocal $batchLocal -BatchSize $using:batchSize `
                         -DbConn $dbConn -StoreSql $using:storeSql -StoreCsv $using:storeCsv -CsvPath $using:csvPath

            # Coleta em subsites
            if ($using:processSub) {
                $subsites = Get-SPOSubsites -SiteConnection $ctxSite
                foreach ($sub in $subsites) {
                    $ctxSub = $null
                    try {
                        $ctxSub = Connect-SPOSite -SiteUrl $sub.Url `
                                        -ClientId     $using:authData.client_id `
                                        -CertBase64   $using:base64 `
                                        -ClientSecret $using:authData.client_secret `
                                        -Tenant       $using:authData.tenant_id
                        if (-not $ctxSub) { continue }
                        Process-Site -Site $sub -Web $sub -CtxSite $ctxSub -Campos $campos `
                                     -IsSubsite $true -BatchLocal $batchLocal -BatchSize $using:batchSize `
                                     -DbConn $dbConn -StoreSql $using:storeSql -StoreCsv $using:storeCsv -CsvPath $using:csvPath
                    } catch {
                        Write-Log -Level WARNING -Module 'Files' -SiteUrl $sub.Url -Message 'Falha em subsite.' -Exception $_.Exception.Message
                    } finally {
                        if ($ctxSub) { Disconnect-SPOConnection -Connection $ctxSub }
                    }
                }
            }

            # Flush final
            if ($batchLocal.Count -gt 0) {
                $arr = $batchLocal.ToArray()
                if ($using:storeCsv) { Write-CsvAppend -Data $arr -Path $using:csvPath }
                if ($using:storeSql -and $null -ne $dbConn) { Save-FilesInfo -Batch $arr -Connection $dbConn | Out-Null }
                $batchLocal.Clear()
            }
        }
        catch {
            Write-Log -Level ERROR -Module 'Files' -SiteUrl $site.Url -Message 'Falha geral no site.' -Exception $_.Exception.Message
            $siteOk = $false
        }
        finally {
            # Grava o progresso ANTES de fechar a conexao da thread - roda
            # sempre que o site termina com sucesso (resume ativo ou nao),
            # pois e o que permite retomar mesmo se o crash acontecer na
            # primeira tentativa.
            if ($siteOk -and $using:storeSql -and $null -ne $dbConn) {
                Complete-SiteProgress -Connection $dbConn -ModuleName 'files' -SiteUrl $site.Url
            }
            if ($ctxSite) { Disconnect-SPOConnection -Connection $ctxSite }
            if ($dbConn) { Close-DbConnection -Connection $dbConn }

            # Progresso incremental real (site concluido com sucesso ou nao -
            # conta para nao travar o percentual num site problematico)
            $sync = $using:progressSync
            $done = 0
            [System.Threading.Monitor]::Enter($sync)
            try { $sync.Done++; $done = $sync.Done } finally { [System.Threading.Monitor]::Exit($sync) }
            $total = $using:totalSites
            $pct = [Math]::Min(99, 5 + [Math]::Round(($done / $total) * 94))
            Report-Step -StepName 'Coleta de Arquivos' -Status 'in progress' -Progress $pct -Info "$done de $total sites processados"
        }
    }

    Write-Log -Level SUCCESS -Module 'Files' -Message 'Coleta de arquivos finalizada.' -DbConnection $Connection
    Report-Step -StepName 'Coleta de Arquivos' -Status 'completed' -Progress 100 -Info 'OK'
}

# ------------------------------------------------------------------------------
# Helper interno: percorre todas as bibliotecas e gera lote por arquivo
# ------------------------------------------------------------------------------
function Process-Site {
    param(
        $Site,
        $Web,
        $CtxSite,
        [string[]] $Campos,
        [bool] $IsSubsite,
        $BatchLocal,
        [int] $BatchSize,
        $DbConn,
        [bool] $StoreSql,
        [bool] $StoreCsv,
        [string] $CsvPath
    )

    $lists = @()
    try {
        $lists = Get-PnPList -Connection $CtxSite -ErrorAction SilentlyContinue |
                 Where-Object { $_.BaseType -eq 'DocumentLibrary' -and $_.ItemCount -gt 0 }
    } catch {
        Write-Log -Level WARNING -Module 'Files' -SiteUrl $Site.Url -Message 'Falha ao listar bibliotecas do site.' -Exception $_.Exception.Message -DbConnection $DbConn
        return
    }

    foreach ($list in $lists) {
        $isPreservation = if ($list.Title -eq 'Preservation Hold Library' -or
                              $list.RootFolder.ServerRelativeUrl -like '*/PreservationHoldLibrary*') { $true } else { $false }

        try {
            $items = Get-PnPListItem -Connection $CtxSite -List $list -PageSize 5000 -Fields $Campos -ErrorAction SilentlyContinue
        } catch {
            Write-Log -Level WARNING -Module 'Files' -SiteUrl $Site.Url -Message "Falha lista $($list.Title)" -Exception $_.Exception.Message
            continue
        }

        foreach ($file in $items) {
            if ($file.FileSystemObjectType -ne 'File') { continue }
            $fv = $file.FieldValues

            $ownerName = if ($fv.Author) { $fv.Author.LookupValue } else { $null }
            $ownerMail = if ($fv.Author) { $fv.Author.Email } else { $null }
            $modName   = if ($fv.Editor) { $fv.Editor.LookupValue } else { $null }
            $modMail   = if ($fv.Editor) { $fv.Editor.Email } else { $null }

            $fileSize = if ($fv.File_x0020_Size) { [int64]$fv.File_x0020_Size } else { [int64]0 }
            $vCount = 1
            $totalSize = $fileSize

            # Inferencia rapida de versoes via _UIVersionString (sem chamada CSOM extra)
            $versaoTexto = if ($fv._UIVersionString) { $fv._UIVersionString } else { $fv.OData__UIVersionString }
            if ($versaoTexto -and $versaoTexto -match '^(\d+)') {
                $major = [int]$Matches[1]
                if ($major -gt 1) {
                    $vCount = $major
                    $totalSize = $fileSize * $major
                }
            }

            $yearsWithoutChanges = 0
            if ($fv.Modified -is [datetime]) {
                $yearsWithoutChanges = [math]::Round(((Get-Date) - $fv.Modified).TotalDays / 365.25, 2)
            }

            $fileType = $null
            if ($fv.FileLeafRef -match '\.([a-zA-Z0-9]+)$') { $fileType = $Matches[1].ToLower() }

            $obj = [PSCustomObject]@{
                ExecutionId               = $global:executionId
                file_id                   = $fv.UniqueId
                file_name                 = $fv.FileLeafRef
                file_size                 = $fileSize
                total_file_size           = $totalSize
                versions_count            = $vCount
                file_type                 = $fileType
                file_hash                 = $fv.StreamHash
                file_compliance_tag       = $fv._ComplianceTag
                file_sec_classification   = $null
                file_url                  = ($Site.Url + $fv.FileRef)
                site_name                 = if ($Web) { $Web.Title } else { $Site.Title }
                site_url                  = $Site.Url
                relative_url              = $fv.FileRef
                owner_name                = $ownerName
                owner_mail                = $ownerMail
                created_date              = $fv.Created
                last_modified_user        = $modName
                last_modified_mail        = $modMail
                last_modified_date        = $fv.Modified
                is_subsite                = [int]$IsSubsite
                preservation_hold_library = [int]$isPreservation
                years_without_changes     = $yearsWithoutChanges
            }
            $BatchLocal.Add($obj)

            if ($BatchLocal.Count -ge $BatchSize) {
                $arr = $BatchLocal.ToArray()
                if ($StoreCsv) { Write-CsvAppend -Data $arr -Path $CsvPath }
                if ($StoreSql -and $null -ne $DbConn) { Save-FilesInfo -Batch $arr -Connection $DbConn | Out-Null }
                $BatchLocal.Clear()
            }
        }
    }
}
