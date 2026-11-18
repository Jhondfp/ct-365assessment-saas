# ==============================================================================
# MODULO: COLETA DE ITENS DA LIXEIRA (SharePoint Online)
# ------------------------------------------------------------------------------
# Paralelismo seguro - cada thread com sua propria conexao SQL.
#
# Get-PnPRecycleBinItem checa IsSiteAdmin no lado do servidor - a permissao
# Sites.FullControl.All (Entra ID) nao satisfaz essa checagem sozinha, entao o
# app precisa ser Site Collection Admin no site para conseguir ler a lixeira.
# Em vez de elevar TODOS os sites de antemao (inviavel em tenants com milhares
# de sites - martelaria o Admin Center com throttling), a estrategia e:
#   1) Tentar ler a lixeira normalmente em todos os sites (paralelo).
#   2) So elevar Site Collection Admin nos sites que falharam com Unauthorized.
#   3) Reprocessar so esses sites.
# A elevacao e permanente (nao remove o app da lista de admins ao final).
# ==============================================================================

function Get-TrashItems {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] $Sites,
        [Parameter(Mandatory=$false)] $Connection = $null
    )

    Write-Log -Level INFO -Module 'Trash' -Message "Iniciando coleta de lixeiras em $($Sites.Count) sites." -DbConnection $Connection
    Report-Step -StepName 'Coleta de Lixeiras' -Status 'in progress' -Progress 5 -Info 'Varredura iniciada'

    $throttle  = if ($global:params.sites_parallel_size) { [int]$global:params.sites_parallel_size } else { 8 }
    $storeCsv  = $global:params.store_in_csv
    $storeSql  = $global:params.store_in_sql
    $batchSize = if ($global:params.sql_batch_size) { [int]$global:params.sql_batch_size } else { 500 }
    $csvPath   = Get-CsvOutputPath -ModuleName 'trash' -FileName 'trash_items.csv'

    $authData   = $global:auth
    $execId     = $global:executionId
    $base64     = $global:base64Cert
    $paramsCopy = $global:params

    # Resume: pula sites que ja terminaram com sucesso nesta execucao (ver
    # dbo.execution_progress / Complete-SiteProgress) e limpa qualquer linha
    # parcial em trash_items dos sites que serao (re)processados agora - evita
    # duplicar o que ja tinha sido "flushado" antes do processo morrer.
    $isResume = [bool]$global:isResume
    $dirtySites = @()
    if ($storeSql -and $isResume -and $null -ne $Connection) {
        $completedSites = Get-CompletedSiteUrls -Connection $Connection -ModuleName 'trash'
        if ($completedSites.Count -gt 0) {
            $totalAntes = $Sites.Count
            $Sites = @($Sites | Where-Object { -not $completedSites.Contains($_.Url) })
            Write-Log -Level INFO -Module 'Trash' -Message "Resume: $($totalAntes - $Sites.Count) de $totalAntes sites ja concluidos - pulando." -DbConnection $Connection
        }
        $dirtySites = Clear-PartialSiteData -Connection $Connection -TableName 'dbo.trash_items' -Sites $Sites
    }

    $scriptRoot = (Resolve-Path .).Path
    $pathSP    = Join-Path $scriptRoot 'src\connection\Connect-SharePoint.ps1'
    $pathDB    = Join-Path $scriptRoot 'src\connection\Connect-Database.ps1'
    $pathRepo  = Join-Path $scriptRoot 'src\connection\Repository.ps1'
    $pathLog   = Join-Path $scriptRoot 'src\utils\Write-Log.ps1'
    $pathStatus= Join-Path $scriptRoot 'src\utils\Handle-Status.ps1'
    $pathCsv   = Join-Path $scriptRoot 'src\utils\Export-Csv.ps1'

    # Sites que falharem por Unauthorized na 1a passada entram aqui (thread-safe)
    $authFailUrls = [System.Collections.Concurrent.ConcurrentBag[string]]::new()

    $readBody = {
        . $using:pathSP
        . $using:pathDB
        . $using:pathRepo
        . $using:pathLog
        . $using:pathStatus
        . $using:pathCsv

        $global:auth        = $using:authData
        $global:executionId = $using:execId
        $global:params      = $using:paramsCopy

        $site = $_

        $dbConn = $null
        if ($using:storeSql) {
            try { $dbConn = New-DbConnection } catch { }
        }

        # Marca conclusao do site (dbo.execution_progress) so quando $siteOk
        # permanece $true - qualquer saida antecipada abaixo vira $false,
        # deixando o site elegivel para reprocessamento num resume futuro.
        $siteOk = $true

        $ctxSite = $null
        try {
            $ctxSite = Connect-SPOSite -SiteUrl $site.Url `
                            -ClientId     $using:authData.client_id `
                            -CertBase64   $using:base64 `
                            -ClientSecret $using:authData.client_secret `
                            -Tenant       $using:authData.tenant_id
            if (-not $ctxSite) { $siteOk = $false; return }

            $batchLocal = New-Object System.Collections.Generic.List[object]

            $trashItems = @()
            try {
                $trashItems = @(Get-PnPRecycleBinItem -Connection $ctxSite -RowLimit 5000 -ErrorAction Stop)
            } catch {
                $exDetail = "$($_.Exception.GetType().FullName): $($_.Exception.Message)"
                $inner = $_.Exception.InnerException
                while ($inner) {
                    $exDetail += " -> $($inner.GetType().FullName): $($inner.Message)"
                    $inner = $inner.InnerException
                }
                if ($exDetail -match 'Unauthorized') {
                    ($using:authFailUrls).Add($site.Url)
                }
                Write-Log -Level WARNING -Module 'Trash' -SiteUrl $site.Url -Message 'Falha ao ler lixeira.' -Exception $exDetail
                $siteOk = $false
                return
            }

            foreach ($item in $trashItems) {
                $batchLocal.Add([PSCustomObject]@{
                    ExecutionId      = $using:execId
                    SiteId           = $site.Id
                    SiteUrl          = $site.Url
                    SiteTitle        = $site.Title
                    ItemId           = $item.Id
                    Title            = $item.Title
                    ItemType         = if ($item.ItemType) { $item.ItemType.ToString() } else { 'Unknown' }
                    DeletedBy        = $item.DeletedByEmail
                    DeletedDate      = $item.DeletedDate
                    OriginalLocation = $item.DirName
                    SizeBytes        = $item.Size
                    ItemState        = if ($item.ItemState) { $item.ItemState.ToString() } else { 'Unknown' }
                })

                if ($batchLocal.Count -ge $using:batchSize) {
                    $arr = $batchLocal.ToArray()
                    if ($using:storeCsv) { Write-CsvAppend -Data $arr -Path $using:csvPath }
                    if ($using:storeSql -and $null -ne $dbConn) { Save-TrashItems -Batch $arr -Connection $dbConn | Out-Null }
                    $batchLocal.Clear()
                }
            }

            if ($batchLocal.Count -gt 0) {
                $arr = $batchLocal.ToArray()
                if ($using:storeCsv) { Write-CsvAppend -Data $arr -Path $using:csvPath }
                if ($using:storeSql -and $null -ne $dbConn) { Save-TrashItems -Batch $arr -Connection $dbConn | Out-Null }
                $batchLocal.Clear()
            }
        }
        catch {
            Write-Log -Level ERROR -Module 'Trash' -SiteUrl $site.Url -Message 'Falha geral na lixeira.' -Exception $_.Exception.Message
            $siteOk = $false
        }
        finally {
            # Grava o progresso ANTES de fechar a conexao da thread - roda
            # sempre que o site termina com sucesso (resume ativo ou nao).
            # $readBody e reusado nas duas passadas (inicial + retry pos-
            # elevacao), entao um site so concluido na 2a passada e marcado
            # corretamente sem nenhum tratamento extra.
            if ($siteOk -and $using:storeSql -and $null -ne $dbConn) {
                Complete-SiteProgress -Connection $dbConn -ModuleName 'trash' -SiteUrl $site.Url
            }
            if ($ctxSite) { Disconnect-SPOConnection -Connection $ctxSite }
            if ($dbConn) { Close-DbConnection -Connection $dbConn }
        }
    }

    # --------------------------------------------------------------------------
    # 1a passada: le a lixeira em todos os sites
    # --------------------------------------------------------------------------
    $Sites | ForEach-Object -ThrottleLimit $throttle -Parallel $readBody

    # --------------------------------------------------------------------------
    # 2a passada: eleva Site Collection Admin so nos sites que falharam com
    # Unauthorized, depois reprocessa so esses sites.
    # --------------------------------------------------------------------------
    # @() forca semantica de array mesmo com 0 ou 1 resultado - sem isso,
    # quando nenhum site falha com "Unauthorized" (ex: falhas com outra
    # mensagem, como "Access is denied" / E_ACCESSDENIED, que nao bate no
    # -match acima), o pipeline vazio vira $null em vez de array vazio, e
    # "$failedUrls.Count" explode sob Set-StrictMode (herdado de main.ps1),
    # derrubando o pipeline inteiro em vez de so pular o site com warning.
    $failedUrls = @($authFailUrls.ToArray() | Select-Object -Unique)
    if ($failedUrls.Count -gt 0) {
        Write-Log -Level INFO -Module 'Trash' -Message "$($failedUrls.Count) site(s) falharam por falta de permissao. Elevando Site Collection Admin antes de reprocessar."
        Report-Step -StepName 'Coleta de Lixeiras' -Status 'in progress' -Progress 60 -Info "Elevando permissoes em $($failedUrls.Count) sites"

        $adminConn = $null
        try {
            $adminConn = Connect-SPOAdminCenter -TenantName $authData.spo_tenant `
                             -ClientId $authData.client_id -CertBase64 $base64 `
                             -ClientSecret $authData.client_secret -Tenant $authData.tenant_id
        } catch { $adminConn = $null }

        $elevatedUrls = New-Object System.Collections.Generic.List[string]
        if ($adminConn) {
            foreach ($url in $failedUrls) {
                try {
                    Set-PnPTenantSite -Identity $url -Owners $authData.client_id -Connection $adminConn -ErrorAction Stop
                    $elevatedUrls.Add($url)
                } catch {
                    Write-Log -Level WARNING -Module 'Trash' -SiteUrl $url -Message 'Falha ao elevar app a Site Collection Admin - site ficara sem dados de lixeira.' -Exception $_.Exception.Message
                }
            }
            Disconnect-SPOConnection -Connection $adminConn
        } else {
            Write-Log -Level WARNING -Module 'Trash' -Message 'Nao foi possivel conectar ao Admin Center - sites sem permissao ficarao sem dados de lixeira.'
        }

        if ($elevatedUrls.Count -gt 0) {
            $retrySites = $Sites | Where-Object { $elevatedUrls -contains $_.Url }
            Write-Log -Level INFO -Module 'Trash' -Message "Reprocessando $($retrySites.Count) site(s) apos elevacao de permissao."
            Report-Step -StepName 'Coleta de Lixeiras' -Status 'in progress' -Progress 80 -Info "Reprocessando $($retrySites.Count) sites"
            $retrySites | ForEach-Object -ThrottleLimit $throttle -Parallel $readBody
        }
    }

    if (@($dirtySites).Count -gt 0 -and $null -ne $Connection) {
        Write-Log -Level WARNING -Module 'Trash' -Message "Removendo duplicatas de $(@($dirtySites).Count) site(s) cuja limpeza da retomada falhou." -DbConnection $Connection
        Remove-DuplicateSiteRows -Connection $Connection -TableName 'dbo.trash_items' -SiteUrls @($dirtySites) -KeyExpr 'COALESCE(item_id, item_title)'
    }
    Write-Log -Level SUCCESS -Module 'Trash' -Message 'Coleta de lixeiras finalizada.' -DbConnection $Connection
    Report-Step -StepName 'Coleta de Lixeiras' -Status 'completed' -Progress 100 -Info 'OK'
}
