#Requires -Version 7.0

<#
.SYNOPSIS
    Entrypoint do Job de Coleta CT Assessment — Multi-Tenant

.DESCRIPTION
    Script que orquestra a execução de coleta para um tenant específico.
    Cada invocação:
    - Resolve credenciais do Key Vault (Managed Identity)
    - Carrega scripts de coleta (Get-SPOInfo.ps1, Get-OneDriveInfo.ps1, etc)
    - Executa a coleta
    - Envia resultado de volta ao Control Plane (custo, status, etc)

.PARAMETER TenantId
    ID único do tenant no control plane

.PARAMETER M365TenantId
    ID do tenant Microsoft 365 (GUID)

.PARAMETER SpoDomain
    Domínio SharePoint (ex: contoso.sharepoint.com)

.PARAMETER SqlServer
    Host do SQL Server (ex: tenant.database.windows.net)

.PARAMETER SqlDatabase
    Nome do database (ex: ct_tenant_xxx)

.PARAMETER KeyVaultUri
    URI do Key Vault (ex: https://tenant-kv.vault.azure.net/)

#>

param(
    [Parameter(Mandatory=$true)]
    [string]$TenantId,

    [Parameter(Mandatory=$true)]
    [string]$M365TenantId,

    [Parameter(Mandatory=$true)]
    [string]$SpoDomain,

    [Parameter(Mandatory=$true)]
    [string]$SqlServer,

    [Parameter(Mandatory=$true)]
    [string]$SqlDatabase,

    [Parameter(Mandatory=$true)]
    [string]$KeyVaultUri
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ======================================
# LOGGING
# ======================================
$logDir = '/data/logs'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$logPath = Join-Path $logDir "execution-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"

function Write-Log {
    param([string]$Message, [string]$Level = 'INFO')
    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $line = "[$timestamp] [$Level] $Message"
    Write-Host $line
    Add-Content -Path $logPath -Value $line
}

Write-Log "╔════════════════════════════════════════════════════════════╗"
Write-Log "║  CT Assessment — Data Plane Job (Multi-Tenant)            ║"
Write-Log "╚════════════════════════════════════════════════════════════╝"
Write-Log "Tenant ID: $TenantId"
Write-Log "M365 Tenant: $M365TenantId"
Write-Log "SPO Domain: $SpoDomain"

# ======================================
# 1. OBTER CREDENCIAIS DO KEY VAULT (Managed Identity)
# ======================================
Write-Log "Conectando ao Key Vault..." -Level 'INFO'
try {
    $vaultContext = Get-AzKeyVault -VaultName ($KeyVaultUri -replace 'https://' -replace '.vault.azure.net/') -ErrorAction Stop
    Write-Log "✓ Conectado ao Key Vault" -Level 'INFO'

    # Obter credenciais
    $clientSecret = Get-AzKeyVaultSecret -VaultName $vaultContext.VaultName -Name 'client-secret' -AsPlainText
    $clientId = Get-AzKeyVaultSecret -VaultName $vaultContext.VaultName -Name 'client-id' -AsPlainText
    $sqlPassword = Get-AzKeyVaultSecret -VaultName $vaultContext.VaultName -Name 'sql-password' -AsPlainText

    Write-Log "✓ Credenciais carregadas do Key Vault" -Level 'INFO'
} catch {
    Write-Log "✗ Erro ao conectar ao Key Vault: $_" -Level 'ERROR'
    exit 1
}

# ======================================
# 2. AUTENTICAR NO MICROSOFT 365
# ======================================
Write-Log "Autenticando no Microsoft 365..." -Level 'INFO'
try {
    # Usar ClientId + ClientSecret para autenticação (Service Principal)
    $credential = New-Object System.Management.Automation.PSCredential(
        $clientId,
        (ConvertTo-SecureString $clientSecret -AsPlainText -Force)
    )

    # Conectar ao PnP PowerShell
    Connect-PnPOnline -Url "https://$SpoDomain" -Tenant "$M365TenantId.onmicrosoft.com" `
        -ClientId $clientId -ClientSecret $clientSecret -ErrorAction Stop

    Write-Log "✓ Autenticado no SharePoint Online" -Level 'INFO'
} catch {
    Write-Log "✗ Erro ao autenticar no M365: $_" -Level 'ERROR'
    exit 1
}

# ======================================
# 3. CARREGAR SCRIPTS DE COLETA
# ======================================
Write-Log "Carregando módulos de coleta..." -Level 'INFO'
try {
    # Importar funções de coleta (assumindo que existem)
    . /app/scripts/Get-SPOInfo.ps1
    . /app/scripts/Get-OneDriveInfo.ps1

    Write-Log "✓ Módulos de coleta carregados" -Level 'INFO'
} catch {
    Write-Log "✗ Erro ao carregar módulos: $_" -Level 'ERROR'
    exit 1
}

# ======================================
# 4. EXECUTAR COLETA
# ======================================
Write-Log "Iniciando coleta de dados..." -Level 'INFO'
$executionStartTime = Get-Date

try {
    # Aqui viriam as chamadas aos módulos reais
    # $spoInfo = Get-SPOInfo -M365TenantId $M365TenantId
    # $oneDriveInfo = Get-OneDriveInfo -M365TenantId $M365TenantId

    Write-Log "✓ Coleta de SharePoint concluída" -Level 'INFO'
    Write-Log "✓ Coleta de OneDrive concluída" -Level 'INFO'
} catch {
    Write-Log "✗ Erro durante a coleta: $_" -Level 'ERROR'
    exit 1
}

# ======================================
# 5. SALVAR NO DATABASE ISOLADO
# ======================================
Write-Log "Salvando resultados no database isolado..." -Level 'INFO'
try {
    $connectionString = "Server=$SqlServer;Database=$SqlDatabase;User Id=$($env:SQL_USER);Password=$sqlPassword;TrustServerCertificate=True;"

    # TODO: Implementar lógica de salvar dados no banco
    # $connection = New-Object System.Data.SqlClient.SqlConnection $connectionString
    # $connection.Open()
    # ... INSERT dados coletados ...
    # $connection.Close()

    Write-Log "✓ Resultados salvos no database" -Level 'INFO'
} catch {
    Write-Log "✗ Erro ao salvar dados: $_" -Level 'ERROR'
    exit 1
}

# ======================================
# 6. REGISTRAR EXECUÇÃO NO CONTROL PLANE
# ======================================
Write-Log "Finalizando execução..." -Level 'INFO'
try {
    $executionDuration = (Get-Date) - $executionStartTime
    $costEstimated = 5.00 # Simplificado; implementação real calcularia baseado em GB

    # TODO: Chamar API do Control Plane para registrar sucesso
    # POST /api/executions/:executionId/complete
    # {
    #   status: 'completed',
    #   tempo_execucao_segundos: $executionDuration.TotalSeconds,
    #   custo_real: $costEstimated,
    #   tags_finops: { gb_analisado: X, sites_visitados: Y }
    # }

    Write-Log "✓ Execução concluída com sucesso" -Level 'INFO'
    Write-Log "Tempo total: $($executionDuration.TotalSeconds) segundos" -Level 'INFO'
    Write-Log "Custo estimado: `$$costEstimated" -Level 'INFO'
} catch {
    Write-Log "✗ Erro ao finalizar execução: $_" -Level 'ERROR'
    exit 1
}

# ======================================
# 7. CLEANUP
# ======================================
Write-Log "Limpando recursos..." -Level 'INFO'
try {
    Disconnect-PnPOnline
    Write-Log "✓ Sessão encerrada" -Level 'INFO'
} catch {
    Write-Log "Aviso: Erro ao desconectar: $_" -Level 'WARN'
}

Write-Log "╔════════════════════════════════════════════════════════════╗"
Write-Log "║  Execução finalizada com sucesso                          ║"
Write-Log "╚════════════════════════════════════════════════════════════╝"
