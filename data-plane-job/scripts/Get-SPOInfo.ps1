#Requires -Version 7.0

<#
.SYNOPSIS
    Coleta informações de SharePoint Online via Microsoft Graph API

.DESCRIPTION
    Coleta dados de sites SharePoint, documentos, permissões, compartilhamentos

.PARAMETER TenantId
    ID do tenant Microsoft 365

.PARAMETER SiteUrl
    URL do site SharePoint a analisar (ex: https://contoso.sharepoint.com/sites/marketing)

.PARAMETER AccessToken
    Token de acesso JWT para Microsoft Graph API

.PARAMETER MaxDepth
    Profundidade máxima de pastas a analisar (default: 3)

.EXAMPLE
    .\Get-SPOInfo.ps1 -TenantId "xxx" -SiteUrl "https://..." -AccessToken "eyJ0..."
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$TenantId,

    [Parameter(Mandatory=$true)]
    [string]$SiteUrl,

    [Parameter(Mandatory=$true)]
    [string]$AccessToken,

    [int]$MaxDepth = 3
)

$ErrorActionPreference = "Stop"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$timestamp] [$Level] $Message"
}

function Invoke-GraphApi {
    param(
        [string]$Endpoint,
        [string]$Method = "GET",
        [hashtable]$Headers,
        [object]$Body
    )

    try {
        $params = @{
            Uri     = "https://graph.microsoft.com/v1.0$Endpoint"
            Method  = $Method
            Headers = $Headers
        }

        if ($Body) {
            $params['Body'] = $Body | ConvertTo-Json -Depth 10
        }

        $response = Invoke-RestMethod @params
        return $response
    }
    catch {
        Write-Log "Graph API Error: $($_.Exception.Message)" "ERROR"
        throw
    }
}

function Get-SiteInfo {
    param([string]$SiteId, [hashtable]$Headers)

    Write-Log "Coletando informações do site: $SiteId"

    try {
        $site = Invoke-GraphApi -Endpoint "/sites/$SiteId" -Headers $Headers

        return @{
            id           = $site.id
            displayName  = $site.displayName
            webUrl       = $site.webUrl
            createdAt    = $site.createdDateTime
            description  = $site.description
            lastModified = $site.lastModifiedDateTime
        }
    }
    catch {
        Write-Log "Falha ao coletar info do site: $_" "ERROR"
        throw
    }
}

function Get-DriveAnalysis {
    param(
        [string]$SiteId,
        [string]$DriveId,
        [hashtable]$Headers,
        [int]$CurrentDepth = 0,
        [int]$MaxDepth = 3
    )

    if ($CurrentDepth -gt $MaxDepth) {
        return @{
            files      = @()
            folders    = @()
            stats      = @{
                totalSize   = 0
                fileCount   = 0
                folderCount = 0
            }
        }
    }

    Write-Log "Analisando drive $DriveId (profundidade: $CurrentDepth)"

    try {
        $endpoint = "/sites/$SiteId/drives/$DriveId/root/children?`$top=200"
        $response = Invoke-GraphApi -Endpoint $endpoint -Headers $Headers

        $items = $response.value
        $files = @()
        $folders = @()
        $totalSize = 0
        $fileCount = 0
        $folderCount = 0

        foreach ($item in $items) {
            if ($item.file) {
                $files += @{
                    id        = $item.id
                    name      = $item.name
                    size      = [long]($item.size ?? 0)
                    extension = ($item.name -split '\.')[-1]
                    created   = $item.createdDateTime
                    modified  = $item.lastModifiedDateTime
                    createdBy = $item.createdBy.user.displayName ?? "Unknown"
                    webUrl    = $item.webUrl
                }
                $totalSize += [long]($item.size ?? 0)
                $fileCount++
            }
            elseif ($item.folder) {
                $folderCount++
                $folders += @{
                    id        = $item.id
                    name      = $item.name
                    itemCount = [int]($item.folder.childCount ?? 0)
                    created   = $item.createdDateTime
                    modified  = $item.lastModifiedDateTime
                    webUrl    = $item.webUrl
                }
            }
        }

        return @{
            files      = $files
            folders    = $folders
            stats      = @{
                totalSize   = $totalSize
                fileCount   = $fileCount
                folderCount = $folderCount
            }
        }
    }
    catch {
        Write-Log "Erro ao analisar drive: $_" "WARN"
        return @{
            files      = @()
            folders    = @()
            stats      = @{
                totalSize   = 0
                fileCount   = 0
                folderCount = 0
            }
        }
    }
}

# ======================================
# EXECUÇÃO PRINCIPAL
# ======================================

try {
    Write-Log "Iniciando análise de SharePoint para: $SiteUrl"
    Write-Log "Tenant: $TenantId"

    # Setup headers
    $headers = @{
        "Authorization" = "Bearer $AccessToken"
        "Content-Type"  = "application/json"
    }

    # Resolver site ID da URL
    Write-Log "Resolvendo site da URL: $SiteUrl"
    $siteResponse = Invoke-GraphApi -Endpoint "/sites?`$filter=webUrl eq '$SiteUrl'" -Headers $headers

    if ($siteResponse.value.Count -eq 0) {
        throw "Site não encontrado: $SiteUrl"
    }

    $siteId = $siteResponse.value[0].id
    Write-Log "ID do site resolvido: $siteId"

    # Coletar informações do site
    $siteInfo = Get-SiteInfo -SiteId $siteId -Headers $headers

    # Listar drives (bibliotecas de documentos)
    Write-Log "Listando drives do site..."
    $drivesResponse = Invoke-GraphApi -Endpoint "/sites/$siteId/drives" -Headers $headers
    $drives = $drivesResponse.value

    Write-Log "Encontrados $($drives.Count) drive(s)"

    $analysisResults = @{
        siteInfo = $siteInfo
        drives   = @()
    }

    $totalSize = 0
    $totalFiles = 0
    $totalFolders = 0

    # Analisar cada drive
    foreach ($drive in $drives) {
        Write-Log "Processando drive: $($drive.name)"

        $driveAnalysis = Get-DriveAnalysis -SiteId $siteId -DriveId $drive.id -Headers $headers -CurrentDepth 0 -MaxDepth $MaxDepth

        $totalSize += $driveAnalysis.stats.totalSize
        $totalFiles += $driveAnalysis.stats.fileCount
        $totalFolders += $driveAnalysis.stats.folderCount

        $analysisResults.drives += @{
            id       = $drive.id
            name     = $drive.name
            webUrl   = $drive.webUrl
            analysis = $driveAnalysis
        }
    }

    # Gerar resumo
    $analysisResults.summary = @{
        totalSizeGb    = [math]::Round($totalSize / 1GB, 2)
        totalFiles     = $totalFiles
        totalFolders   = $totalFolders
        totalDrives    = $drives.Count
        collectionTime = Get-Date -Format "o"
        success        = $true
    }

    Write-Log "Análise Concluída!"
    Write-Log "Tamanho Total: $($analysisResults.summary.totalSizeGb) GB"
    Write-Log "Total de Arquivos: $totalFiles"
    Write-Log "Total de Pastas: $totalFolders"

    # Output como JSON
    $json = $analysisResults | ConvertTo-Json -Depth 10
    Write-Output $json

    exit 0
}
catch {
    Write-Log "ERRO FATAL: $($_.Exception.Message)" "ERROR"
    $errorResult = @{
        success = $false
        error   = $_.Exception.Message
        site    = $SiteUrl
    }
    Write-Output ($errorResult | ConvertTo-Json)
    exit 1
}
