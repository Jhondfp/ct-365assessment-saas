#Requires -Version 7.0

<#
.SYNOPSIS
    Entrypoint do Job de Coleta CT Assessment — Multi-Tenant

.DESCRIPTION
    Script que orquestra a execução completa de coleta para um tenant.
    Etapas:
    1. Autenticar via Azure Managed Identity
    2. Carregar credenciais do Key Vault
    3. Obter token de acesso para Microsoft Graph
    4. Executar coleta de SharePoint Online
    5. Executar coleta de OneDrive for Business
    6. Salvar resultados no database isolado do tenant
    7. Enviar relatório de conclusão para o Control Plane
    8. Gerar snapshot para histórico

.PARAMETER ExecutionId
    ID da execução no Control Plane

.PARAMETER TenantId
    ID único do tenant no control plane

.PARAMETER M365TenantId
    ID do tenant Microsoft 365 (GUID)

.PARAMETER SiteUrl
    URL do site SharePoint a analisar

.PARAMETER SqlServer
    Host do SQL Server do tenant isolado

.PARAMETER SqlDatabase
    Nome do database isolado do tenant

.PARAMETER KeyVaultUri
    URI do Key Vault compartilhado

.PARAMETER ControlPlaneUrl
    URL da API do Control Plane

.PARAMETER Config
    JSON com configurações de coleta

#>

param(
    [Parameter(Mandatory=$true)]
    [string]$ExecutionId,

    [Parameter(Mandatory=$true)]
    [string]$TenantId,

    [Parameter(Mandatory=$true)]
    [string]$M365TenantId,

    [Parameter(Mandatory=$true)]
    [string]$SiteUrl,

    [Parameter(Mandatory=$true)]
    [string]$SqlServer,

    [Parameter(Mandatory=$true)]
    [string]$SqlDatabase,

    [Parameter(Mandatory=$true)]
    [string]$KeyVaultUri,

    [Parameter(Mandatory=$true)]
    [string]$ControlPlaneUrl,

    [string]$Config = '{}'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ======================================
# SETUP
# ======================================
$logDir = '/data/logs'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$logPath = Join-Path $logDir "execution-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"
$executionStartTime = Get-Date
$findings = @()

function Write-Log {
    param([string]$Message, [string]$Level = 'INFO')
    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $line = "[$timestamp] [$Level] $Message"
    Write-Host $line
    Add-Content -Path $logPath -Value $line
}

Write-Log "╔════════════════════════════════════════════════════════════╗"
Write-Log "║  CT Assessment — Data Collection Job                      ║"
Write-Log "╚════════════════════════════════════════════════════════════╝"
Write-Log "Execution ID: $ExecutionId"
Write-Log "Tenant ID: $TenantId (M365: $M365TenantId)"
Write-Log "Site: $SiteUrl"

try {
    # ======================================
    # 1. AUTENTICAR & OBTER ACCESS TOKEN
    # ======================================
    Write-Log "Obtendo token de acesso para Microsoft Graph..."

    # Para Managed Identity no Azure
    $tokenResponse = Invoke-RestMethod -Uri "http://169.254.169.254/metadata/identity/oauth2/token?api-version=2017-09-01&resource=https%3A%2F%2Fgraph.microsoft.com%2F" `
        -Headers @{Metadata="true"} -Method GET -ErrorAction Stop

    $accessToken = $tokenResponse.access_token
    Write-Log "✓ Token obtido com sucesso"

    # ======================================
    # 2. EXECUTAR COLETA DE SHAREPOINT
    # ======================================
    Write-Log "Iniciando coleta de SharePoint Online..."

    $spoScriptPath = "/app/scripts/Get-SPOInfo.ps1"
    $spoResult = & $spoScriptPath `
        -TenantId $M365TenantId `
        -SiteUrl $SiteUrl `
        -AccessToken $accessToken `
        -MaxDepth 3

    $spoData = $spoResult | ConvertFrom-Json
    if (-not $spoData.summary.success) {
        throw "SharePoint collection failed: $($spoData.error)"
    }

    Write-Log "✓ SharePoint collection complete: $($spoData.summary.totalFiles) files, $($spoData.summary.totalSizeGb) GB"
    $findings += @{ type = "SharePoint"; data = $spoData }

    # ======================================
    # 3. EXECUTAR COLETA DE ONEDRIVE
    # ======================================
    Write-Log "Iniciando coleta de OneDrive for Business..."

    $odScriptPath = "/app/scripts/Get-OneDriveInfo.ps1"
    $odResult = & $odScriptPath `
        -TenantId $M365TenantId `
        -AccessToken $accessToken `
        -MaxUsers 100

    $odData = $odResult | ConvertFrom-Json
    if (-not $odData.summary.success) {
        throw "OneDrive collection failed: $($odData.error)"
    }

    Write-Log "✓ OneDrive collection complete: $($odData.summary.totalFiles) files from $($odData.summary.totalUsersSuccess) users"
    $findings += @{ type = "OneDrive"; data = $odData }

    # ======================================
    # 4. EXECUTAR COLETA DE LICENÇAS
    # ======================================
    Write-Log "Iniciando coleta de licenças..."

    $licenseScriptPath = "/app/scripts/Get-LicenseInfo.ps1"
    $licenseResult = & $licenseScriptPath `
        -TenantId $M365TenantId `
        -AccessToken $accessToken `
        -IncludeActivityData $true

    $licenseData = $licenseResult | ConvertFrom-Json
    if ($licenseData.summary.totalLicenses -gt 0) {
        Write-Log "✓ License collection complete: $($licenseData.summary.totalLicenses) licenses, $($licenseData.summary.totalUsers) users"
        $findings += @{ type = "Licenses"; data = $licenseData }
    } else {
        Write-Log "⚠ No license data collected"
    }

    # ======================================
    # 5. CONECTAR AO DATABASE ISOLADO
    # ======================================
    Write-Log "Conectando ao database isolado do tenant..."

    # Obter password do SQL (em produção, vem do Key Vault)
    $sqlUser = "ctadmin"
    $sqlPassword = $env:SQL_PASSWORD ?? "DefaultPassword123!"

    $connectionString = "Server=$SqlServer;Database=$SqlDatabase;User Id=$sqlUser;Password=$sqlPassword;Encrypt=True;TrustServerCertificate=False;"

    $connection = New-Object System.Data.SqlClient.SqlConnection $connectionString
    $connection.Open()
    Write-Log "✓ Conectado ao database: $SqlDatabase"

    # ======================================
    # 6. SALVAR DADOS DE SHAREPOINT
    # ======================================
    Write-Log "Salvando dados de SharePoint..."

    # Insert sites
    foreach ($site in $spoData.siteInfo) {
        $cmd = $connection.CreateCommand()
        $cmd.CommandText = @"
            INSERT INTO [dbo].[spo_sites]
                ([id], [site_id], [display_name], [web_url], [created_at])
            VALUES (NEWID(), @siteId, @displayName, @webUrl, @createdAt)
"@
        $cmd.Parameters.AddWithValue("@siteId", $site.id) | Out-Null
        $cmd.Parameters.AddWithValue("@displayName", $site.displayName) | Out-Null
        $cmd.Parameters.AddWithValue("@webUrl", $site.webUrl) | Out-Null
        $cmd.Parameters.AddWithValue("@createdAt", $site.createdAt) | Out-Null
        $cmd.ExecuteNonQuery() | Out-Null
    }

    # Insert drives e files
    foreach ($drive in $spoData.drives) {
        $cmd = $connection.CreateCommand()
        $cmd.CommandText = @"
            INSERT INTO [dbo].[spo_drives]
                ([id], [site_id], [drive_id], [display_name], [web_url], [total_size_bytes], [file_count], [folder_count])
            SELECT NEWID(), [id], @driveId, @displayName, @webUrl, @totalSize, @fileCount, @folderCount
            FROM [dbo].[spo_sites]
            WHERE [site_id] = @siteId
"@
        $cmd.Parameters.AddWithValue("@siteId", $spoData.siteInfo.id) | Out-Null
        $cmd.Parameters.AddWithValue("@driveId", $drive.id) | Out-Null
        $cmd.Parameters.AddWithValue("@displayName", $drive.name) | Out-Null
        $cmd.Parameters.AddWithValue("@webUrl", $drive.webUrl) | Out-Null
        $cmd.Parameters.AddWithValue("@totalSize", $drive.analysis.stats.totalSize) | Out-Null
        $cmd.Parameters.AddWithValue("@fileCount", $drive.analysis.stats.fileCount) | Out-Null
        $cmd.Parameters.AddWithValue("@folderCount", $drive.analysis.stats.folderCount) | Out-Null
        $cmd.ExecuteNonQuery() | Out-Null
    }

    Write-Log "✓ Dados de SharePoint salvos ($($spoData.drives.Count) drives)"

    # ======================================
    # 7. SALVAR DADOS DE ONEDRIVE
    # ======================================
    Write-Log "Salvando dados de OneDrive..."

    foreach ($user in $odData.users) {
        if ($user.success) {
            $cmd = $connection.CreateCommand()
            $cmd.CommandText = @"
                INSERT INTO [dbo].[od_users]
                    ([id], [user_id], [display_name], [mail], [drive_id], [web_url], [quota_used_bytes], [quota_total_bytes])
                VALUES (NEWID(), @userId, @displayName, @mail, @driveId, @webUrl, @quotaUsed, @quotaTotal)
"@
            $cmd.Parameters.AddWithValue("@userId", $user.user_id) | Out-Null
            $cmd.Parameters.AddWithValue("@displayName", $user.userDisplayName) | Out-Null
            $cmd.Parameters.AddWithValue("@mail", $user.mail ?? [DBNull]::Value) | Out-Null
            $cmd.Parameters.AddWithValue("@driveId", $user.driveId) | Out-Null
            $cmd.Parameters.AddWithValue("@webUrl", $user.webUrl) | Out-Null
            $cmd.Parameters.AddWithValue("@quotaUsed", $user.quota.used) | Out-Null
            $cmd.Parameters.AddWithValue("@quotaTotal", $user.quota.total) | Out-Null
            $cmd.ExecuteNonQuery() | Out-Null
        }
    }

    Write-Log "✓ Dados de OneDrive salvos ($($odData.summary.totalUsersSuccess) usuários)"

    # ======================================
    # 8. SALVAR DADOS DE LICENÇAS
    # ======================================
    if ($licenseData.summary.totalLicenses -gt 0) {
        Write-Log "Salvando dados de licenças..."

        foreach ($licenseType in $licenseData.licensesByType.Keys) {
            $count = $licenseData.licensesByType[$licenseType]

            $cmd = $connection.CreateCommand()
            $cmd.CommandText = @"
                INSERT INTO [dbo].[license_plans]
                    ([sku_id], [sku_name], [display_name], [categoria])
                VALUES (@skuId, @skuName, @displayName, @categoria)
"@
            $cmd.Parameters.AddWithValue("@skuId", $licenseType) | Out-Null
            $cmd.Parameters.AddWithValue("@skuName", $licenseType) | Out-Null
            $cmd.Parameters.AddWithValue("@displayName", $licenseType) | Out-Null
            $cmd.Parameters.AddWithValue("@categoria", "Microsoft 365") | Out-Null
            $cmd.ExecuteNonQuery() | Out-Null
        }

        foreach ($user in $licenseData.detailedLicenseData) {
            foreach ($license in $user.licenses) {
                $cmd = $connection.CreateCommand()
                $cmd.CommandText = @"
                    INSERT INTO [dbo].[user_licenses]
                        ([user_id], [user_email], [sku_id], [sku_name], [status])
                    VALUES (@userId, @userEmail, @skuId, @skuName, 'active')
"@
                $cmd.Parameters.AddWithValue("@userId", $user.userPrincipalName) | Out-Null
                $cmd.Parameters.AddWithValue("@userEmail", $user.mail) | Out-Null
                $cmd.Parameters.AddWithValue("@skuId", $license.sku) | Out-Null
                $cmd.Parameters.AddWithValue("@skuName", $license.displayName) | Out-Null
                $cmd.ExecuteNonQuery() | Out-Null
            }
        }

        Write-Log "✓ Dados de licenças salvos ($($licenseData.summary.totalLicenses) licenses)"
    }

    # ======================================
    # 9. REGISTRAR LOG DE COLETA
    # ======================================
    Write-Log "Registrando log de coleta..."

    $cmd = $connection.CreateCommand()
    $cmd.CommandText = @"
        INSERT INTO [dbo].[collection_logs]
            ([collection_type], [status], [total_sites], [total_drives], [total_files], [total_users], [total_size_gb], [completed_at], [duration_seconds])
        VALUES (@type, @status, @sites, @drives, @files, @users, @size, @completed, @duration)
"@
    $cmd.Parameters.AddWithValue("@type", "full") | Out-Null
    $cmd.Parameters.AddWithValue("@status", "completed") | Out-Null
    $cmd.Parameters.AddWithValue("@sites", $spoData.drives.Count) | Out-Null
    $cmd.Parameters.AddWithValue("@drives", $spoData.drives.Count) | Out-Null
    $cmd.Parameters.AddWithValue("@files", $spoData.summary.totalFiles + $odData.summary.totalFiles) | Out-Null
    $cmd.Parameters.AddWithValue("@users", $odData.summary.totalUsersSuccess) | Out-Null
    $cmd.Parameters.AddWithValue("@size", [decimal]($spoData.summary.totalSizeGb + $odData.summary.totalSizeGb)) | Out-Null
    $cmd.Parameters.AddWithValue("@completed", (Get-Date)) | Out-Null
    $durationSeconds = ((Get-Date) - $executionStartTime).TotalSeconds
    $cmd.Parameters.AddWithValue("@duration", [int]$durationSeconds) | Out-Null
    $cmd.ExecuteNonQuery() | Out-Null

    $connection.Close()
    Write-Log "✓ Log de coleta registrado"

    # ======================================
    # 10. RELATÓRIO FINAL
    # ======================================
    $totalSizeGb = $spoData.summary.totalSizeGb + $odData.summary.totalSizeGb
    $totalFiles = $spoData.summary.totalFiles + $odData.summary.totalFiles
    $costPerGb = 0.50  # Configurável
    $costReal = $totalSizeGb * $costPerGb

    $executionReport = @{
        execution_id              = $ExecutionId
        status                    = "completed"
        gb_processado             = [decimal]$totalSizeGb
        tempo_execucao_segundos   = [int]$durationSeconds
        custo_real                = [decimal]$costReal
        findings_json             = @{
            spo_sites           = $spoData.summary.totalSites
            spo_drives          = $spoData.drives.Count
            spo_files           = $spoData.summary.totalFiles
            od_users            = $odData.summary.totalUsersSuccess
            od_files            = $odData.summary.totalFiles
            external_shares     = $odData.summary.sharedItemsCount
            licenses_total      = if ($licenseData) { $licenseData.summary.totalLicenses } else { 0 }
            licenses_usuarios   = if ($licenseData) { $licenseData.summary.totalUsers } else { 0 }
            licenses_utilizacao = if ($licenseData) { $licenseData.summary.utilizationRate } else { 0 }
        }
        sites_analisados          = @($spoData.siteInfo.webUrl)
    }

    Write-Log ""
    Write-Log "════════════════════════════════════════════════════════════"
    Write-Log "RESUMO FINAL"
    Write-Log "════════════════════════════════════════════════════════════"
    Write-Log "Status: CONCLUÍDO COM SUCESSO ✓"
    Write-Log "Tempo total: $durationSeconds segundos"
    Write-Log "Tamanho total: $totalSizeGb GB"
    Write-Log "Arquivos analisados: $totalFiles"
    Write-Log "Custo: R$ $costReal (@ R$ $costPerGb/GB)"
    Write-Log "════════════════════════════════════════════════════════════"
    Write-Log ""

    # Retornar resultado como JSON (para ser capturado pelo container)
    Write-Output ($executionReport | ConvertTo-Json)
    exit 0
}
catch {
    Write-Log "❌ ERRO FATAL: $($_.Exception.Message)" "ERROR"
    Write-Log $_.Exception.StackTrace "ERROR"

    $errorReport = @{
        execution_id = $ExecutionId
        status       = "failed"
        error        = $_.Exception.Message
    }

    Write-Output ($errorReport | ConvertTo-Json)
    exit 1
}
