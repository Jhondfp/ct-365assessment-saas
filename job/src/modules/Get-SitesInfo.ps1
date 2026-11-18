# ==============================================================================
# MODULO: COLETA DE SITES (e subsites) DO SHAREPOINT ONLINE
# ------------------------------------------------------------------------------
# Paralelismo seguro: cada thread abre sua propria conexao SQL (SqlConnection
# NAO eh thread-safe). A conexao da main fica reservada para o coordenador.
# ==============================================================================

# ------------------------------------------------------------------------------
# Helper: identificador estavel do site, independente da origem dos dados.
# Get-PnPTenantSite (Admin Center) expoe o GUID do site como SiteId - o
# objeto NAO tem propriedade "Id". Ja o fallback via Microsoft Graph
# (getAllSites, usado quando o PnP nao enumera sites) monta um objeto com
# propriedade "Id" (ver bloco Graph abaixo). Usa PSObject.Properties[...] em
# vez de acesso direto porque, sob Set-StrictMode -Version 3.0 (main.ps1),
# ler uma propriedade que nao existe no objeto lanca excecao em vez de
# retornar $null - confirmado. Bug pre-existente descoberto por causa disso:
# "SiteId = $site.Id" (mais abaixo) sempre gravou site_id vazio em
# dbo.sites_info, porque roda dentro do bloco -Parallel, que NAO herda o
# Set-StrictMode do script principal (cada runspace paralelo tem sua propria
# sessao) - por isso nunca lancou erro, so gravou silenciosamente errado.
# Chave do progresso/retomada: o id do site quando existe; senão a URL. A lista do PnP Admin pode vir sem id
# (SiteId/Id vazios): sem esta alternativa nenhum site era marcado como concluído e a retomada regravava todos os
# sites sem apagar os anteriores (sites_info duplicado).
function Get-SiteProgressKey {
    param($Site)
    $k = Get-SiteKey -Site $Site
    if ($k) { return $k }
    if ($Site.PSObject.Properties['Url'] -and $Site.Url) { return "$($Site.Url)" }
    return $null
}

function Get-SiteKey {
    param($Site)
    if ($Site.PSObject.Properties['SiteId'] -and $Site.SiteId -and "$($Site.SiteId)" -ne [Guid]::Empty.ToString()) {
        return "$($Site.SiteId)"
    }
    if ($Site.PSObject.Properties['Id'] -and $Site.Id) {
        return "$($Site.Id)"
    }
    return $null
}

function Get-SitesInfo {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$false)] $Connection = $null
    )

    Write-Log -Level INFO -Module 'Sites' -Message 'Iniciando coleta de sites.' -DbConnection $Connection
    Report-Step -StepName 'Coleta de Sites' -Status 'in progress' -Progress 0 -Info 'Conectando ao Admin Center'

    # process_onedrive=true inclui os sites pessoais (OneDrive) na mesma coleta -
    # eles sao tecnicamente site collections do SharePoint (https://tenant-my.sharepoint.com/personal/usuario)
    # e reaproveitam sem alteracao o pipeline de sites_info/files_info/trash_items.
    $includeOneDrive = [bool]$global:params.process_onedrive

    # Tentativa 1: PnP Admin Center (funciona com autenticacao por certificado)
    $ctxAdmin = Connect-SPOAdminCenter `
                    -TenantName    $global:auth.spo_tenant `
                    -ClientId      $global:auth.client_id `
                    -CertBase64    $global:base64Cert `
                    -ClientSecret  $global:auth.client_secret `
                    -Tenant        $global:auth.tenant_id

    $sites = @()
    if ($ctxAdmin) {
        $pnpErr = $null
        $pnpParams = @{ Connection = $ctxAdmin; ErrorAction = 'SilentlyContinue'; ErrorVariable = 'pnpErr' }
        if ($includeOneDrive) { $pnpParams.IncludeOneDriveSites = $true }
        $sites = @(Get-PnPTenantSite @pnpParams)
        Write-Log -Level INFO -Module 'Sites' -Message "$($sites.Count) sites via PnP Admin." -DbConnection $Connection
        if ($sites.Count -eq 0 -and $pnpErr) {
            Write-Log -Level WARNING -Module 'Sites' -Message 'Get-PnPTenantSite retornou 0 sites - motivo real:' -Exception ($pnpErr | ForEach-Object { $_.ToString() } | Select-Object -First 1) -DbConnection $Connection
        }
    } else {
        Write-Log -Level WARNING -Module 'Sites' -Message 'Falha ao conectar ao Admin Center via PnP.' -DbConnection $Connection
    }

    # Tentativa 2: Microsoft Graph getAllSites (funciona com App Registration + client secret)
    # Necessario quando auth_mode=client_secret, pois PnP usa ACS e nao consegue enumerar sites
    if ($sites.Count -eq 0) {
        Write-Log -Level WARNING -Module 'Sites' -Message 'Nenhum site via PnP. Tentando Microsoft Graph getAllSites...' -DbConnection $Connection
        try {
            $graphUri  = 'https://graph.microsoft.com/v1.0/sites/getAllSites?$select=id,displayName,webUrl,createdDateTime,lastModifiedDateTime,isPersonalSite'
            $resp      = Invoke-GraphRequest -Uri $graphUri -All
            $graphSites = @($resp.value | Where-Object {
                $includeOneDrive -or -not ($_.PSObject.Properties['isPersonalSite'] -and $_.isPersonalSite)
            })

            $sites = $graphSites | ForEach-Object {
                $g = $_
                # ID do Graph: "tenant.sharepoint.com,siteCollectionGuid,webGuid"
                $rawId = if ($g.PSObject.Properties['id']) { $g.id } else { '' }
                $parts = $rawId -split ','
                $lastMod = if ($g.PSObject.Properties['lastModifiedDateTime'] -and $g.lastModifiedDateTime) {
                    [datetime]$g.lastModifiedDateTime
                } else { $null }
                $created = if ($g.PSObject.Properties['createdDateTime'] -and $g.createdDateTime) {
                    [datetime]$g.createdDateTime
                } else { $null }
                [PSCustomObject]@{
                    GraphId                 = $rawId   # ID composto completo para chamadas Graph subsequentes
                    Id                      = if ($parts.Count -ge 2) { $parts[1] } else { $rawId }
                    Title                   = if ($g.PSObject.Properties['displayName']) { $g.displayName } else { '' }
                    Url                     = if ($g.PSObject.Properties['webUrl'])       { $g.webUrl }      else { '' }
                    Created                 = $created
                    LastContentModifiedDate = $lastMod
                    StorageUsageCurrent     = 0
                    StorageQuota            = 0
                    SharingCapability       = $null
                    IsTeamsConnected        = $false
                    IsTeamsChannelConnected = $false
                    Status                  = 'Active'
                }
            }
            Write-Log -Level INFO -Module 'Sites' -Message "$($sites.Count) sites via Graph getAllSites." -DbConnection $Connection
        } catch {
            Write-Log -Level ERROR -Module 'Sites' -Message 'Falha ao buscar sites via Graph.' -Exception $_.Exception.Message -DbConnection $Connection
        }
    }

    if ($sites.Count -eq 0) {
        Write-Log -Level ERROR -Module 'Sites' -Message 'Nenhum site encontrado (PnP e Graph falharam).' -DbConnection $Connection
        Report-Step -StepName 'Coleta de Sites' -Status 'failed' -Progress 0 -Info 'Sem sites'
        if ($null -ne $ctxAdmin) { Disconnect-SPOConnection -Connection $ctxAdmin }
        return @()
    }

    # Marca sites pessoais (OneDrive) pelo padrao de URL - funciona tanto para
    # objetos retornados pelo PnP (SPOSite) quanto pelo fallback via Graph.
    foreach ($s in $sites) {
        $isPersonal = [bool]($s.Url -match '-my\.sharepoint\.com/personal/')
        if ($s.PSObject.Properties['IsPersonalSite']) {
            $s.IsPersonalSite = $isPersonal
        } else {
            $s | Add-Member -NotePropertyName IsPersonalSite -NotePropertyValue $isPersonal -Force
        }
    }
    if ($includeOneDrive) {
        $odCount = @($sites | Where-Object { $_.IsPersonalSite }).Count
        Write-Log -Level INFO -Module 'Sites' -Message "$odCount sites pessoais (OneDrive) incluidos na coleta." -DbConnection $Connection
    }

    # Filtra pela lista informada em params.sites, se houver
    if ($global:params.sites -and $global:params.sites.Count -gt 0) {
        $alvo = @($global:params.sites)
        $sites = $sites | Where-Object { $_.Url -in $alvo }
        Write-Log -Level INFO -Module 'Sites' -Message "Apos filtro: $($sites.Count) sites." -DbConnection $Connection
    }

    if ($sites.Count -eq 0) {
        if ($null -ne $ctxAdmin) { Disconnect-SPOConnection -Connection $ctxAdmin }
        Report-Step -StepName 'Coleta de Sites' -Status 'completed' -Progress 100 -Info 'Nenhum site'
        return @()
    }

    $throttle = if ($global:params.sites_parallel_size) { [int]$global:params.sites_parallel_size } else { 8 }
    $storeCsv = $global:params.store_in_csv
    $storeSql = $global:params.store_in_sql
    $csvPath  = Get-CsvOutputPath -ModuleName 'sites' -FileName 'sites_info.csv'
    $sitesArr = @($sites)

    # Resume: pula sites que ja terminaram com sucesso nesta execucao (ver
    # dbo.execution_progress / Complete-SiteProgress) e limpa qualquer linha
    # parcial (site pai + subsites) dos que serao reprocessados. A chave usada
    # aqui e site_id, nao site_url - Get-SitesInfo grava 1 linha por subsite,
    # cada uma com sua propria URL, mas todas compartilham o site_id do pai.
    # IMPORTANTE: filtra so a lista usada no ForEach-Object -Parallel abaixo
    # ($sitesToProcess) - o retorno da funcao ($sitesArr, usado por
    # Get-DataFiles/Get-TrashItems/Get-OwnerStatus) precisa continuar com a
    # lista COMPLETA de sites, senao os sites ja concluidos aqui desaparecem
    # tambem dos modulos seguintes.
    $isResume = [bool]$global:isResume
    $sitesToProcess = $sitesArr
    if ($storeSql -and $isResume -and $null -ne $Connection) {
        $completedSiteIds = Get-CompletedSiteUrls -Connection $Connection -ModuleName 'sites'
        if ($completedSiteIds.Count -gt 0) {
            $totalAntes = $sitesToProcess.Count
            $sitesToProcess = @($sitesToProcess | Where-Object { -not $completedSiteIds.Contains([string](Get-SiteProgressKey -Site $_)) })
            Write-Log -Level INFO -Module 'Sites' -Message "Resume: $($totalAntes - $sitesToProcess.Count) de $totalAntes sites ja concluidos - pulando." -DbConnection $Connection
        }
        foreach ($s in $sitesToProcess) {
            $key = Get-SiteKey -Site $s
            if ($key) { [void](Clear-SiteData -Connection $Connection -TableName 'dbo.sites_info' -SiteUrl $key -Column 'site_id') }
            elseif ($s.PSObject.Properties['Url'] -and $s.Url) { Clear-SiteTreeData -Connection $Connection -TableName 'dbo.sites_info' -SiteUrl ([string]$s.Url) }
        }
    }
    # Total "de verdade" (todos os sites, nao so os reprocessados agora) - so
    # usado no log final abaixo; nao ha calculo de progresso % por site nesta
    # etapa (diferente de Get-DataFiles/Get-TrashItems).
    $totalSites = $sitesArr.Count

    Write-Log -Level INFO -Module 'Sites' -Message "Processando em paralelo (Threads: $throttle) | $($sitesToProcess.Count) de $totalSites a processar agora." -DbConnection $Connection

    # Variaveis capturadas pelo bloco paralelo
    $authData    = $global:auth
    $execId      = $global:executionId
    $base64      = $global:base64Cert
    $processSub  = $global:params.process_subsites
    $paramsCopy  = $global:params
    $logFilePath = $global:LogFilePath

    # Caminhos absolutos para 'dot-sourcing' dentro de runspaces paralelos
    $scriptRoot   = (Resolve-Path .).Path
    $pathSP       = Join-Path $scriptRoot 'src\connection\Connect-SharePoint.ps1'
    $pathDB       = Join-Path $scriptRoot 'src\connection\Connect-Database.ps1'
    $pathRepo     = Join-Path $scriptRoot 'src\connection\Repository.ps1'
    $pathLog      = Join-Path $scriptRoot 'src\utils\Write-Log.ps1'
    $pathStatus   = Join-Path $scriptRoot 'src\utils\Handle-Status.ps1'
    $pathCsv      = Join-Path $scriptRoot 'src\utils\Export-Csv.ps1'
    $pathGraph    = Join-Path $scriptRoot 'src\connection\Connect-Graph.ps1'
    $pathSitesInfo = Join-Path $scriptRoot 'src\modules\Get-SitesInfo.ps1'

    $sitesToProcess | ForEach-Object -ThrottleLimit $throttle -Parallel {
        # Re-importa dependencias no runspace
        . $using:pathSP
        . $using:pathDB
        . $using:pathRepo
        . $using:pathLog
        . $using:pathStatus
        . $using:pathCsv
        . $using:pathSitesInfo  # necessario para Get-SiteKey estar disponivel no runspace

        $global:auth        = $using:authData
        $global:executionId = $using:execId
        $global:params      = $using:paramsCopy

        # Write-Log.ps1 foi re-executado do zero neste runspace (dot-source acima),
        # entao $script:LogFile comecou nulo de novo - sem isto, todo log emitido
        # dentro do bloco paralelo (sucessos, falhas de conexao por site) ia so pro
        # console e se perdia, nunca aparecendo no arquivo nem no dashboard.
        $script:LogFile = $using:logFilePath

        $site = $_

        # CONEXAO PROPRIA POR THREAD - NUNCA reutilizar a conexao da main
        $dbConn = $null
        try {
            if ($using:storeSql) { $dbConn = New-DbConnection }
        } catch {
            Write-Log -Level WARNING -Module 'Sites' -Message "Sem DB nesta thread: $($_.Exception.Message)"
        }

        # Marca conclusao do site (dbo.execution_progress, chave = site_id)
        # so quando $siteOk permanece $true - qualquer excecao abaixo vira
        # $false, deixando o site elegivel para reprocessamento num resume.
        $siteOk = $true

        try {
            $isOneDrive = [bool]($site.PSObject.Properties['IsPersonalSite'] -and $site.IsPersonalSite)
            $sharingCap = if ($site.SharingCapability) { $site.SharingCapability.ToString() } else { 'Disabled' }
            $sharing    = Get-SPOSharingSettings -SharingCapability $sharingCap
            $percUsed   = if ($site.StorageQuota -gt 0) { [decimal]::Round(($site.StorageUsageCurrent / $site.StorageQuota) * 100, 2) } else { 0 }
            $siteKey    = Get-SiteKey -Site $site

            # Registro base: preenchido com dados do Graph (garantia de gravacao mesmo sem PnP)
            $registros = New-Object System.Collections.Generic.List[object]
            $baseRec = [PSCustomObject]@{
                ExecutionId               = $using:execId
                Tipo                      = if ($isOneDrive) { 'OneDrive' } else { 'Site' }
                SiteId                    = $siteKey
                Nome                      = $site.Title
                URL                       = $site.Url
                UrlWebRaiz                = $null
                DataCriacao               = if ($site.PSObject.Properties['Created']) { $site.Created } else { $null }
                UltimaModificacao         = $site.LastContentModifiedDate
                Administrators            = ''
                NumeroDeAdministradores   = 0
                TipoDeSite                = if ($isOneDrive) { 'OneDrive' } else { 'SharePoint Site' }
                IsTeamsConnected          = [bool]$site.IsTeamsConnected
                IsTeamsChannelConnected   = [bool]$site.IsTeamsChannelConnected
                NumeroDeSubsites          = 0
                TamanhoDoSiteMB           = $site.StorageUsageCurrent
                CotaDeArmazenamentoMB     = $site.StorageQuota
                PercentualUsado           = $percUsed
                ItensBibliotecaDocumentos = 0
                CapacidadeCompartilhamento= $sharingCap
                PermiteAcessoExterno      = $sharing.Enabled
                Status                    = if ($site.Status) { $site.Status } else { 'Active' }
            }
            $registros.Add($baseRec)

            # Enriquecimento via PnP (funciona com autenticacao por certificado)
            $ctxSite = Connect-SPOSite `
                        -SiteUrl      $site.Url `
                        -ClientId     $using:authData.client_id `
                        -CertBase64   $using:base64 `
                        -ClientSecret $using:authData.client_secret `
                        -Tenant       $using:authData.tenant_id

            if ($ctxSite) {
                $web = Get-SPOWebProperties -SiteConnection $ctxSite
                if ($web) {
                    $subsites = Get-SPOSubsites -SiteConnection $ctxSite
                    $admsRaw  = Get-SPOAdministrators -SiteConnection $ctxSite
                    $admins   = @()
                    if ($admsRaw) {
                        $admins = $admsRaw.ToString() -split ';' |
                                  ForEach-Object { $_.Trim() } |
                                  Where-Object   { -not [string]::IsNullOrWhiteSpace($_) }
                    }
                    $libs = @()
                    try {
                        $libs = Get-PnPList -Connection $ctxSite -ErrorAction SilentlyContinue |
                                Where-Object { $_.BaseType -eq 'DocumentLibrary' -and $_.Hidden -eq $false }
                    } catch { }
                    $totalLibItems = 0
                    foreach ($l in $libs) { $totalLibItems += [int]$l.ItemCount }

                    # Atualiza o registro base com dados mais ricos do PnP
                    $baseRec.Nome                      = $web.Title
                    $baseRec.URL                       = $web.Url
                    $baseRec.DataCriacao               = $web.Created
                    $baseRec.Administrators            = ($admins -join '; ')
                    $baseRec.NumeroDeAdministradores   = $admins.Count
                    $baseRec.TipoDeSite                = if ($isOneDrive) { 'OneDrive' } elseif ($web.WebTemplate) { $web.WebTemplate } else { 'SharePoint Site' }
                    $baseRec.NumeroDeSubsites          = $subsites.Count
                    $baseRec.ItensBibliotecaDocumentos = $totalLibItems

                    # Processa subsites (OneDrive nao tem subsites)
                    if ((-not $isOneDrive) -and $using:processSub -and $subsites.Count -gt 0) {
                        foreach ($sub in $subsites) {
                            try {
                                $ctxSub = Connect-SPOSite -SiteUrl $sub.Url `
                                                -ClientId $using:authData.client_id `
                                                -CertBase64 $using:base64 `
                                                -ClientSecret $using:authData.client_secret `
                                                -Tenant $using:authData.tenant_id
                                if (-not $ctxSub) { continue }
                                $webSub = Get-SPOWebProperties -SiteConnection $ctxSub
                                if (-not $webSub) { Disconnect-SPOConnection -Connection $ctxSub; continue }
                                $libsSub = @()
                                try {
                                    $libsSub = Get-PnPList -Connection $ctxSub -ErrorAction SilentlyContinue |
                                               Where-Object { $_.BaseType -eq 'DocumentLibrary' -and $_.Hidden -eq $false }
                                } catch { }
                                $libSubCount = 0
                                foreach ($l in $libsSub) { $libSubCount += [int]$l.ItemCount }
                                $registros.Add([PSCustomObject]@{
                                    ExecutionId               = $using:execId
                                    Tipo                      = 'Subsite'
                                    SiteId                    = $siteKey
                                    Nome                      = $webSub.Title
                                    URL                       = $webSub.Url
                                    UrlWebRaiz                = $web.Url
                                    DataCriacao               = $webSub.Created
                                    UltimaModificacao         = $sub.LastItemModifiedDate
                                    Administrators            = ($admins -join '; ')
                                    NumeroDeAdministradores   = $admins.Count
                                    TipoDeSite                = if ($webSub.WebTemplate) { $webSub.WebTemplate } else { 'SharePoint Subsite' }
                                    IsTeamsConnected          = [bool]$site.IsTeamsConnected
                                    IsTeamsChannelConnected   = [bool]$site.IsTeamsChannelConnected
                                    NumeroDeSubsites          = 0
                                    TamanhoDoSiteMB           = $site.StorageUsageCurrent
                                    CotaDeArmazenamentoMB     = $site.StorageQuota
                                    PercentualUsado           = $percUsed
                                    ItensBibliotecaDocumentos = $libSubCount
                                    CapacidadeCompartilhamento= $sharingCap
                                    PermiteAcessoExterno      = $sharing.Enabled
                                    Status                    = $site.Status
                                })
                                Disconnect-SPOConnection -Connection $ctxSub
                            } catch {
                                Write-Log -Level WARNING -Module 'Sites' -SiteUrl $sub.Url -Message 'Falha em subsite.' -Exception $_.Exception.Message -DbConnection $dbConn
                            }
                        }
                    }
                }
                Disconnect-SPOConnection -Connection $ctxSite
            } else {
                Write-Log -Level WARNING -Module 'Sites' -SiteUrl $site.Url -Message 'PnP indisponivel. Enriquecendo via Graph (storage + subsites).' -DbConnection $dbConn

                $gId = if ($site.PSObject.Properties['GraphId'] -and $site.GraphId) { $site.GraphId } else { $null }
                if ($gId) {
                    try {
                        . $using:pathGraph

                        # Storage do site principal via /drive
                        try {
                            $driveResp = Invoke-GraphRequest -Uri "https://graph.microsoft.com/v1.0/sites/$gId/drive?`$select=quota"
                            $q = $driveResp.quota
                            if ($q) {
                                $usedMB  = if ($q.PSObject.Properties['used']  -and [int64]$q.used  -gt 0) { [math]::Round([int64]$q.used  / 1MB, 2) } else { 0 }
                                $totalMB = if ($q.PSObject.Properties['total'] -and [int64]$q.total -gt 0) { [math]::Round([int64]$q.total / 1MB, 2) } else { 0 }
                                $baseRec.TamanhoDoSiteMB       = $usedMB
                                $baseRec.CotaDeArmazenamentoMB = $totalMB
                                if ($totalMB -gt 0) {
                                    $baseRec.PercentualUsado = [decimal]::Round(($usedMB / $totalMB) * 100, 2)
                                }
                            }
                        } catch { }

                        # Subsites via /sites — conta e processa registros se process_subsites = true
                        try {
                            $subResp = Invoke-GraphRequest -Uri "https://graph.microsoft.com/v1.0/sites/$gId/sites?`$select=id,displayName,webUrl,createdDateTime,lastModifiedDateTime"
                            if ($subResp.PSObject.Properties['value']) {
                                $graphSubsites = @($subResp.value)
                                $baseRec.NumeroDeSubsites = $graphSubsites.Count

                                if ($using:processSub -and $graphSubsites.Count -gt 0) {
                                    foreach ($sub in $graphSubsites) {
                                        $subCreated = if ($sub.PSObject.Properties['createdDateTime']    -and $sub.createdDateTime)    { [datetime]$sub.createdDateTime    } else { $null }
                                        $subLastMod = if ($sub.PSObject.Properties['lastModifiedDateTime'] -and $sub.lastModifiedDateTime) { [datetime]$sub.lastModifiedDateTime } else { $null }
                                        $registros.Add([PSCustomObject]@{
                                            ExecutionId               = $using:execId
                                            Tipo                      = 'Subsite'
                                            SiteId                    = $baseRec.SiteId
                                            Nome                      = if ($sub.PSObject.Properties['displayName']) { $sub.displayName } else { '' }
                                            URL                       = if ($sub.PSObject.Properties['webUrl'])       { $sub.webUrl }       else { '' }
                                            UrlWebRaiz                = $baseRec.URL
                                            DataCriacao               = $subCreated
                                            UltimaModificacao         = $subLastMod
                                            Administrators            = ''
                                            NumeroDeAdministradores   = 0
                                            TipoDeSite                = 'SharePoint Subsite'
                                            IsTeamsConnected          = $false
                                            IsTeamsChannelConnected   = $false
                                            NumeroDeSubsites          = 0
                                            TamanhoDoSiteMB           = 0
                                            CotaDeArmazenamentoMB     = 0
                                            PercentualUsado           = 0
                                            ItensBibliotecaDocumentos = 0
                                            CapacidadeCompartilhamento= 'Disabled'
                                            PermiteAcessoExterno      = $false
                                            Status                    = 'Active'
                                        })
                                    }
                                }
                            }
                        } catch { }

                        # Contagem de itens de bibliotecas via /drives
                        try {
                            $drivesResp = Invoke-GraphRequest -Uri "https://graph.microsoft.com/v1.0/sites/$gId/drives?`$select=id,name,quota"
                            if ($drivesResp.PSObject.Properties['value']) {
                                $totalItems = 0
                                foreach ($drv in @($drivesResp.value)) {
                                    $dRoot = Invoke-GraphRequest -Uri "https://graph.microsoft.com/v1.0/drives/$($drv.id)/root?`$select=folder"
                                    if ($dRoot.PSObject.Properties['folder'] -and $dRoot.folder.PSObject.Properties['childCount']) {
                                        $totalItems += [int]$dRoot.folder.childCount
                                    }
                                }
                                $baseRec.ItensBibliotecaDocumentos = $totalItems
                            }
                        } catch { }

                    } catch {
                        Write-Log -Level WARNING -Module 'Sites' -SiteUrl $site.Url -Message 'Falha no enriquecimento via Graph.' -Exception $_.Exception.Message -DbConnection $dbConn
                    }
                }
            }

            # Sem administrador coletado (PnP indisponivel ou Get-PnPUser sem
            # e-mail - comum em OneDrive: 275 de 459 no tenant CT), usa o Owner
            # do Admin Center (Get-PnPTenantSite) - sem isso o site entra como
            # orfao no dashboard (sp_dash_orphaned_sites) so por falta de dado.
            if ([string]::IsNullOrWhiteSpace($baseRec.Administrators) -and
                $site.PSObject.Properties['Owner'] -and "$($site.Owner)" -match '@') {
                $baseRec.Administrators          = "$($site.Owner)".Trim()
                $baseRec.NumeroDeAdministradores = 1
            }

            # Persiste sempre (dados basicos do Graph ou enriquecidos pelo PnP)
            $arr = $registros.ToArray()
            if ($using:storeCsv) { Write-CsvAppend -Data $arr -Path $using:csvPath }
            if ($using:storeSql -and $null -ne $dbConn) {
                Save-SitesInfo -Batch $arr -Connection $dbConn | Out-Null
            }
        }
        catch {
            Write-Log -Level ERROR -Module 'Sites' -SiteUrl $site.Url -Message 'Falha geral no site.' -Exception $_.Exception.Message -DbConnection $dbConn
            $siteOk = $false
        }
        finally {
            $progressKey = Get-SiteProgressKey -Site $site
            if ($siteOk -and $progressKey -and $using:storeSql -and $null -ne $dbConn) {
                Complete-SiteProgress -Connection $dbConn -ModuleName 'sites' -SiteUrl $progressKey
            }
            if ($null -ne $dbConn) { Close-DbConnection -Connection $dbConn }
        }
    }

    # Cota real de armazenamento do tenant - NAO confundir com o StorageQuota
    # por site (Get-PnPTenantSite), que sob gestao automatica de cota reflete
    # um teto de provisionamento por site, nao a capacidade total contratada.
    # Get-PnPTenant e 1 chamada unica (nao por site) que retorna o total real.
    if ($null -ne $ctxAdmin) {
        try {
            $tenantInfo = Get-PnPTenant -Connection $ctxAdmin -ErrorAction Stop
            if ($tenantInfo) {
                # Log defensivo: se o nome/formato da propriedade mudar (ou
                # PnP renomear em versao futura), fica registrado aqui pra
                # ajustar sem precisar adivinhar de novo.
                Write-Log -Level INFO -Module 'Sites' -Message "Tenant StorageQuota=$($tenantInfo.StorageQuota) MB | StorageQuotaAllocated=$($tenantInfo.StorageQuotaAllocated) MB" -DbConnection $Connection
                if ($Connection -and $tenantInfo.StorageQuota) {
                    Update-ExecutionTenantQuota -Connection $Connection -QuotaMb ([int64]$tenantInfo.StorageQuota) | Out-Null
                }
            }
        } catch {
            Write-Log -Level WARNING -Module 'Sites' -Message 'Falha ao obter cota real do tenant (Get-PnPTenant) - dashboard usara fallback.' -Exception $_.Exception.Message -DbConnection $Connection
        }
    }

    if ($null -ne $ctxAdmin) { Disconnect-SPOConnection -Connection $ctxAdmin }
    Write-Log -Level SUCCESS -Module 'Sites' -Message "Coleta de sites finalizada. Total: $totalSites" -DbConnection $Connection
    Report-Step -StepName 'Coleta de Sites' -Status 'completed' -Progress 100 -Info "$totalSites sites"

    # Retorna lista para reutilizacao por outros modulos
    return $sitesArr
}
