#Requires -Version 7.0

<#
.SYNOPSIS
    Coleta informações de OneDrive for Business via Microsoft Graph API

.DESCRIPTION
    Coleta dados de OneDrives dos usuários, documentos, permissões, compartilhamentos

.PARAMETER TenantId
    ID do tenant Microsoft 365

.PARAMETER AccessToken
    Token de acesso JWT para Microsoft Graph API

.PARAMETER MaxUsers
    Número máximo de usuários a analisar (default: 100)

.PARAMETER MaxDepth
    Profundidade máxima de pastas a analisar (default: 2)

.EXAMPLE
    .\Get-OneDriveInfo.ps1 -TenantId "xxx" -AccessToken "eyJ0..." -MaxUsers 100
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$TenantId,

    [Parameter(Mandatory=$true)]
    [string]$AccessToken,

    [int]$MaxUsers = 100,
    [int]$MaxDepth = 2
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

function Get-UserOneDriveAnalysis {
    param(
        [string]$UserId,
        [string]$UserDisplayName,
        [hashtable]$Headers,
        [int]$MaxDepth
    )

    Write-Log "Analisando OneDrive de: $UserDisplayName"

    try {
        # Obter o drive do usuário
        $drive = Invoke-GraphApi -Endpoint "/users/$UserId/drive" -Headers $Headers

        # Analisar raiz do OneDrive
        $rootResponse = Invoke-GraphApi -Endpoint "/users/$UserId/drive/root/children?`$top=200" -Headers $Headers

        $items = $rootResponse.value
        $files = @()
        $folders = @()
        $totalSize = 0
        $fileCount = 0
        $folderCount = 0
        $sharedCount = 0

        foreach ($item in $items) {
            if ($item.file) {
                $files += @{
                    id        = $item.id
                    name      = $item.name
                    size      = [long]($item.size ?? 0)
                    extension = ($item.name -split '\.')[-1]
                    created   = $item.createdDateTime
                    modified  = $item.lastModifiedDateTime
                }
                $totalSize += [long]($item.size ?? 0)
                $fileCount++

                # Verificar se está compartilhado
                if ($item.shared -and $item.shared.scope -eq "external") {
                    $sharedCount++
                }
            }
            elseif ($item.folder) {
                $folderCount++
                $folders += @{
                    id        = $item.id
                    name      = $item.name
                    itemCount = [int]($item.folder.childCount ?? 0)
                    created   = $item.createdDateTime
                    modified  = $item.lastModifiedDateTime
                }
            }
        }

        return @{
            userId              = $UserId
            userDisplayName     = $UserDisplayName
            driveId             = $drive.id
            webUrl              = $drive.webUrl
            quota               = @{
                used      = [long]($drive.quota.used ?? 0)
                total     = [long]($drive.quota.total ?? 0)
                remaining = [long](($drive.quota.total - $drive.quota.used) ?? 0)
            }
            analysis            = @{
                files        = $files
                folders      = $folders
                totalSize    = $totalSize
                fileCount    = $fileCount
                folderCount  = $folderCount
                sharedCount  = $sharedCount
            }
            success             = $true
        }
    }
    catch {
        Write-Log "Erro ao analisar OneDrive de $UserDisplayName : $_" "WARN"
        return @{
            userId          = $UserId
            userDisplayName = $UserDisplayName
            success         = $false
            error           = $_.Exception.Message
        }
    }
}

# ======================================
# EXECUÇÃO PRINCIPAL
# ======================================

try {
    Write-Log "Iniciando análise de OneDrive for Business"
    Write-Log "Tenant: $TenantId"
    Write-Log "Limite de usuários: $MaxUsers"

    # Setup headers
    $headers = @{
        "Authorization" = "Bearer $AccessToken"
        "Content-Type"  = "application/json"
    }

    # Listar usuários
    Write-Log "Listando usuários..."
    $usersResponse = Invoke-GraphApi -Endpoint "/users?`$top=$MaxUsers&`$select=id,displayName,mail" -Headers $headers
    $users = $usersResponse.value

    Write-Log "Encontrados $($users.Count) usuário(s)"

    $analysisResults = @{
        tenantId = $TenantId
        users    = @()
    }

    $totalSize = 0
    $totalFiles = 0
    $totalFolders = 0
    $totalShared = 0
    $successCount = 0

    # Analisar cada OneDrive
    foreach ($user in $users) {
        $analysis = Get-UserOneDriveAnalysis `
            -UserId $user.id `
            -UserDisplayName $user.displayName `
            -Headers $headers `
            -MaxDepth $MaxDepth

        $analysisResults.users += $analysis

        if ($analysis.success) {
            $successCount++
            $totalSize += $analysis.analysis.totalSize
            $totalFiles += $analysis.analysis.fileCount
            $totalFolders += $analysis.analysis.folderCount
            $totalShared += $analysis.analysis.sharedCount
        }
    }

    # Gerar resumo
    $analysisResults.summary = @{
        totalSizeGb       = [math]::Round($totalSize / 1GB, 2)
        totalFiles        = $totalFiles
        totalFolders      = $totalFolders
        totalUsersSuccess = $successCount
        totalUsersFailed  = $users.Count - $successCount
        sharedItemsCount  = $totalShared
        collectionTime    = Get-Date -Format "o"
        success           = $true
    }

    Write-Log "Análise Concluída!"
    Write-Log "Tamanho Total: $($analysisResults.summary.totalSizeGb) GB"
    Write-Log "Total de Arquivos: $totalFiles"
    Write-Log "Usuários Analisados com Sucesso: $successCount/$($users.Count)"

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
        tenant  = $TenantId
    }
    Write-Output ($errorResult | ConvertTo-Json)
    exit 1
}
