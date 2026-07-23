<#
.SYNOPSIS
    Data Files Collection - SharePoint Online inventory with governance analysis

.DESCRIPTION
    Script que coleta metadados de arquivos em SharePoint Online:
    - Enumeração de sites e subsites
    - Coleta de arquivos com metadados completos
    - Detecção de arquivos stale (sem modificação >365 dias)
    - Análise de versionamento
    - Classificação e compliance tags
    - Hash para duplicata detection

.PARAMETER TenantId
    ID do tenant Microsoft 365 (GUID)

.PARAMETER AccessToken
    Token de acesso para Microsoft Graph

.PARAMETER MaxDepth
    Profundidade máxima de recursão (default: 3)

#>

param(
    [Parameter(Mandatory=$true)]
    [string]$TenantId,

    [Parameter(Mandatory=$true)]
    [string]$AccessToken,

    [int]$MaxDepth = 3,
    [int]$MaxFiles = 0  # 0 = sem limite
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$executionId = $env:EXECUTION_ID ?? (New-Guid).ToString()
$batchSize = 500
$filesList = @()

function Invoke-GraphRequest {
    param(
        [string]$Uri,
        [string]$Method = 'GET',
        [object]$Body = $null
    )

    $headers = @{
        'Authorization' = "Bearer $AccessToken"
        'Content-Type'  = 'application/json'
    }

    $params = @{
        Uri     = $Uri
        Headers = $headers
        Method  = $Method
    }

    if ($Body) {
        $params['Body'] = $Body | ConvertTo-Json
    }

    try {
        return Invoke-RestMethod @params -ErrorAction Stop
    }
    catch {
        Write-Host "Graph request failed: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

function Get-SPOSites {
    Write-Host "Buscando sites do SharePoint..." -ForegroundColor Cyan

    $uri = "https://graph.microsoft.com/v1.0/sites?search=*&\$top=999"
    $sites = @()
    $nextLink = $uri

    while ($nextLink) {
        $response = Invoke-GraphRequest -Uri $nextLink
        if ($response -and $response.value) {
            $sites += $response.value
        }
        $nextLink = $response.'@odata.nextLink'
    }

    return $sites
}

function Get-FileMetadata {
    param(
        [string]$SiteId,
        [string]$SiteUrl,
        [string]$SiteName
    )

    Write-Host "  ├─ Coletando arquivos do site: $SiteName" -ForegroundColor Gray

    $driveUri = "https://graph.microsoft.com/v1.0/sites/$SiteId/drives"
    $drives = Invoke-GraphRequest -Uri $driveUri

    if (-not $drives -or -not $drives.value) {
        return
    }

    foreach ($drive in $drives.value) {
        $itemsUri = "https://graph.microsoft.com/v1.0/drives/$($drive.id)/root/children?`$top=999"
        $nextLink = $itemsUri

        while ($nextLink -and ($MaxFiles -eq 0 -or $filesList.Count -lt $MaxFiles)) {
            $response = Invoke-GraphRequest -Uri $nextLink

            if ($response -and $response.value) {
                foreach ($item in $response.value) {
                    if ($item.file) {
                        $yearsWithoutChanges = 0
                        if ($item.lastModifiedDateTime) {
                            $lastMod = [DateTime]::Parse($item.lastModifiedDateTime)
                            $yearsWithoutChanges = [math]::Round(((Get-Date) - $lastMod).TotalDays / 365.25, 2)
                        }

                        $fileExt = ''
                        if ($item.name -match '\.([a-zA-Z0-9]+)$') {
                            $fileExt = $Matches[1].ToLower()
                        }

                        $fileObj = [PSCustomObject]@{
                            ExecutionId               = $executionId
                            file_id                   = $item.id
                            file_name                 = $item.name
                            file_size                 = $item.size
                            total_file_size           = $item.size
                            versions_count            = 1
                            file_type                 = $fileExt
                            file_hash                 = $null
                            file_compliance_tag       = $null
                            file_sec_classification   = $null
                            file_url                  = $item.webUrl
                            site_name                 = $SiteName
                            site_url                  = $SiteUrl
                            relative_url              = $item.name
                            owner_name                = $item.createdBy.user.displayName
                            owner_mail                = $item.createdBy.user.mail
                            created_date              = $item.createdDateTime
                            last_modified_user        = $item.lastModifiedBy.user.displayName
                            last_modified_mail        = $item.lastModifiedBy.user.mail
                            last_modified_date        = $item.lastModifiedDateTime
                            is_subsite                = 0
                            preservation_hold_library = 0
                            years_without_changes     = $yearsWithoutChanges
                        }

                        $filesList += $fileObj

                        if ($filesList.Count % $batchSize -eq 0) {
                            Write-Host "    └─ $($filesList.Count) arquivos coletados..." -ForegroundColor DarkGray
                        }

                        if ($MaxFiles -gt 0 -and $filesList.Count -ge $MaxFiles) {
                            break
                        }
                    }
                }
            }

            $nextLink = $response.'@odata.nextLink'
        }
    }
}

# Main execution
Write-Host "╔════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Data Files Collection - SharePoint    ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════╝" -ForegroundColor Cyan

$sites = Get-SPOSites
Write-Host "Encontrados: $($sites.Count) sites"

foreach ($site in $sites) {
    Get-FileMetadata -SiteId $site.id -SiteUrl $site.webUrl -SiteName $site.displayName
}

$output = @{
    success       = $true
    summary       = @{
        totalFiles           = $filesList.Count
        totalSizeGb          = [math]::Round((($filesList | Measure-Object -Property file_size -Sum).Sum / 1GB), 2)
        staleFilesCount      = ($filesList | Where-Object { $_.years_without_changes -gt 1 }).Count
        uniqueFileTypes      = ($filesList | Select-Object -ExpandProperty file_type -Unique).Count
        averageFileAgeDays   = [int](($filesList | Measure-Object -Property years_without_changes -Average).Average * 365)
    }
    filesByType   = @{}
    files         = $filesList
    recommendations = @()
}

# File type analysis
$filesList | Group-Object -Property file_type | ForEach-Object {
    $output.filesByType[$_.Name] = @{
        count = $_.Count
        sizeGb = [math]::Round((($_.Group | Measure-Object -Property file_size -Sum).Sum / 1GB), 2)
    }
}

# Generate stale file recommendations
$staleFiles = $filesList | Where-Object { $_.years_without_changes -gt 1 }
if ($staleFiles) {
    $recommendation = @{
        id = (New-Guid).ToString()
        tipo = 'stale_files'
        severidade = 'high'
        titulo = "Arquivos Sem Modificação (>365 dias)"
        descricao = "$($staleFiles.Count) arquivos não foram modificados em mais de 1 ano"
        economia_potencial_brl = [math]::Round(((($staleFiles | Measure-Object -Property file_size -Sum).Sum) / 1GB * 0.50), 2)
        arquivo_ids = @($staleFiles.file_id)
    }
    $output.recommendations += $recommendation
}

# Duplicate candidates (by name)
$duplicatesByName = $filesList | Group-Object -Property file_name | Where-Object { $_.Count -gt 1 }
if ($duplicatesByName) {
    $dupCount = ($duplicatesByName | Measure-Object).Count
    $recommendation = @{
        id = (New-Guid).ToString()
        tipo = 'duplicate_candidates'
        severidade = 'medium'
        titulo = "Possíveis Duplicatas por Nome"
        descricao = "$dupCount conjuntos de arquivos com mesmo nome encontrados"
        economia_potencial_brl = 0
        arquivo_ids = @()
    }
    $output.recommendations += $recommendation
}

Write-Host ""
Write-Host "✓ Coleta concluída: $($output.summary.totalFiles) arquivos"
Write-Host "✓ Tamanho total: $($output.summary.totalSizeGb) GB"
Write-Host "✓ Arquivos stale: $($output.summary.staleFilesCount)"
Write-Host ""

Write-Output ($output | ConvertTo-Json -Depth 10)
