# ==============================================================================
# REPOSITORIO DE PERSISTENCIA - Mapeia objetos PowerShell -> Tabelas SQL/MySQL
# ------------------------------------------------------------------------------
# Cada funcao Save-XXX usa Save-DbBatch (em Connect-Database.ps1), que
# realiza INSERT parametrizado em chunks para todos os bancos suportados.
# ==============================================================================

. (Join-Path $PSScriptRoot 'Connect-Database.ps1')

# ------------------------------------------------------------------------------
# 1. ARQUIVOS (files_info)
# ------------------------------------------------------------------------------
function Save-FilesInfo {
    param(
        [Parameter(Mandatory)] $Batch,
        [Parameter(Mandatory)] $Connection
    )
    if ($null -eq $Batch -or $Batch.Count -eq 0) { return 0 }

    $map = [ordered]@{
        'execution_id'             = 'ExecutionId'
        'file_id'                  = 'file_id'
        'file_name'                = 'file_name'
        'file_size'                = 'file_size'
        'total_file_size'          = 'total_file_size'
        'versions_count'           = 'versions_count'
        'file_type'                = 'file_type'
        'file_hash'                = 'file_hash'
        'file_compliance_tag'      = 'file_compliance_tag'
        'file_sec_classification'  = 'file_sec_classification'
        'file_url'                 = 'file_url'
        'site_name'                = 'site_name'
        'site_url'                 = 'site_url'
        'relative_url'             = 'relative_url'
        'owner_name'               = 'owner_name'
        'owner_mail'               = 'owner_mail'
        'created_date'             = 'created_date'
        'last_modified_user'       = 'last_modified_user'
        'last_modified_mail'       = 'last_modified_mail'
        'last_modified_date'       = 'last_modified_date'
        'is_subsite'               = 'is_subsite'
        'preservation_hold_library'= 'preservation_hold_library'
        'years_without_changes'    = 'years_without_changes'
    }
    return Save-DbBatch -TableName 'dbo.files_info' -ColumnMap $map -Batch $Batch -Connection $Connection
}

# ------------------------------------------------------------------------------
# 2. LIXEIRA (trash_items)
# ------------------------------------------------------------------------------
function Save-TrashItems {
    param(
        [Parameter(Mandatory)] $Batch,
        [Parameter(Mandatory)] $Connection
    )
    if ($null -eq $Batch -or $Batch.Count -eq 0) { return 0 }

    $map = [ordered]@{
        'execution_id'      = 'ExecutionId'
        'site_id'           = 'SiteId'
        'site_url'          = 'SiteUrl'
        'site_title'        = 'SiteTitle'
        'item_id'           = 'ItemId'
        'item_title'        = 'Title'
        'item_type'         = 'ItemType'
        'deleted_by'        = 'DeletedBy'
        'deleted_date'      = 'DeletedDate'
        'original_location' = 'OriginalLocation'
        'size_bytes'        = 'SizeBytes'
        'item_state'        = 'ItemState'
    }
    return Save-DbBatch -TableName 'dbo.trash_items' -ColumnMap $map -Batch $Batch -Connection $Connection
}

# ------------------------------------------------------------------------------
# 3. SITES (sites_info)
# ------------------------------------------------------------------------------
function Save-SitesInfo {
    param(
        [Parameter(Mandatory)] $Batch,
        [Parameter(Mandatory)] $Connection
    )
    if ($null -eq $Batch -or $Batch.Count -eq 0) { return 0 }

    $map = [ordered]@{
        'execution_id'                = 'ExecutionId'
        'site_id'                     = 'SiteId'
        'site_title'                  = 'Nome'
        'site_url'                    = 'URL'
        'site_type'                   = 'Tipo'
        'web_root_url'                = 'UrlWebRaiz'
        'administrators'              = 'Administrators'
        'created_date'                = 'DataCriacao'
        'last_modified_date'          = 'UltimaModificacao'
        'storage_used'                = 'TamanhoDoSiteMB'
        'storage_quota'               = 'CotaDeArmazenamentoMB'
        'storage_percent_used'        = 'PercentualUsado'
        'site_template'               = 'TipoDeSite'
        'subsites_count'              = 'NumeroDeSubsites'
        'document_library_items_count'= 'ItensBibliotecaDocumentos'
        'sharing_capability'          = 'CapacidadeCompartilhamento'
        'is_external_sharing_enabled' = 'PermiteAcessoExterno'
        'is_teams_connected'          = 'IsTeamsConnected'
        'is_teams_channel_connected'  = 'IsTeamsChannelConnected'
        'status'                      = 'Status'
    }
    return Save-DbBatch -TableName 'dbo.sites_info' -ColumnMap $map -Batch $Batch -Connection $Connection
}

# ------------------------------------------------------------------------------
# 4. LICENCIAMENTO (licensing_info)
# ------------------------------------------------------------------------------
function Save-LicensingInfo {
    param(
        [Parameter(Mandatory)] $Batch,
        [Parameter(Mandatory)] $Connection
    )
    if ($null -eq $Batch -or $Batch.Count -eq 0) { return 0 }

    $map = [ordered]@{
        'execution_id'      = 'ExecutionId'
        'sku_id'            = 'sku_id'
        'sku_part_number'   = 'sku_part_number'
        'friendly_name'     = 'friendly_name'
        'total_licenses'    = 'total_licenses'
        'used_licenses'     = 'used_licenses'
        'collected_at'      = 'timestamp'
    }
    return Save-DbBatch -TableName 'dbo.licensing_info' -ColumnMap $map -Batch $Batch -Connection $Connection
}

# ------------------------------------------------------------------------------
# 4b. ADOCAO / ATIVIDADE DE USUARIOS (user_activity)
# ------------------------------------------------------------------------------
function Save-UserActivity {
    param(
        [Parameter(Mandatory)] $Batch,
        [Parameter(Mandatory)] $Connection
    )
    if ($null -eq $Batch -or $Batch.Count -eq 0) { return 0 }

    $map = [ordered]@{
        'execution_id'        = 'ExecutionId'
        'user_principal_name' = 'UserPrincipalName'
        'service'              = 'Service'
        'last_activity_date'   = 'LastActivityDate'
        'activity_count'       = 'ActivityCount'
        'is_deleted'           = 'IsDeleted'
    }
    return Save-DbBatch -TableName 'dbo.user_activity' -ColumnMap $map -Batch $Batch -Connection $Connection
}

# ------------------------------------------------------------------------------
# 4c. CAIXAS DE EMAIL - EXCHANGE (mailbox_info) - usado por Get-MailboxInfo.ps1
# ------------------------------------------------------------------------------
function Save-MailboxInfo {
    param(
        [Parameter(Mandatory)] $Batch,
        [Parameter(Mandatory)] $Connection
    )
    if ($null -eq $Batch -or $Batch.Count -eq 0) { return 0 }

    $map = [ordered]@{
        'execution_id'                     = 'ExecutionId'
        'user_principal_name'               = 'UserPrincipalName'
        'display_name'                      = 'DisplayName'
        'item_count'                        = 'ItemCount'
        'storage_used_bytes'                = 'StorageUsedBytes'
        'issue_warning_quota_bytes'         = 'IssueWarningQuotaBytes'
        'prohibit_send_quota_bytes'         = 'ProhibitSendQuotaBytes'
        'prohibit_send_receive_quota_bytes' = 'ProhibitSendReceiveQuotaBytes'
        'deleted_item_count'                = 'DeletedItemCount'
        'deleted_item_size_bytes'           = 'DeletedItemSizeBytes'
        'has_archive'                       = 'HasArchive'
        'last_activity_date'                = 'LastActivityDate'
        'is_deleted'                        = 'IsDeleted'
    }
    return Save-DbBatch -TableName 'dbo.mailbox_info' -ColumnMap $map -Batch $Batch -Connection $Connection
}

# ------------------------------------------------------------------------------
# 5. INTUNE (intune_devices)
# ------------------------------------------------------------------------------
function Save-IntuneDevices {
    param(
        [Parameter(Mandatory)] $Batch,
        [Parameter(Mandatory)] $Connection
    )
    if ($null -eq $Batch -or $Batch.Count -eq 0) { return 0 }

    $map = [ordered]@{
        'execution_id'        = 'ExecutionId'
        'device_id'           = 'DeviceId'
        'device_name'         = 'DeviceName'
        'device_type'         = 'DeviceType'
        'os_type'             = 'OperatingSystem'
        'os_version'          = 'OsVersion'
        'owner_email'         = 'UserPrincipalName'
        'owner_name'          = 'OwnerName'
        'compliance_status'   = 'ComplianceState'
        'is_jailbroken'       = 'JailBroken'
        'is_encrypted'        = 'IsEncrypted'
        'antivirus_status'    = 'AntivirusStatus'
        'has_compliance_risk' = 'ComplianceRisk'
        'management_agent'    = 'ManagementAgent'
        'enrollment_date'     = 'EnrollmentDate'
        'last_checkin_date'   = 'LastSyncDateTime'
        'bitlocker_status'    = 'BitlockerStatus'
        'overall_risk_flag'   = 'RiskFlag'
        'model'               = 'Model'
        'manufacturer'        = 'Manufacturer'
        'serial_number'       = 'SerialNumber'
        'owner_type'          = 'OwnerType'
        'enrollment_type'     = 'EnrollmentType'
        'is_azure_ad_joined'  = 'AzureAdRegistered'
    }
    return Save-DbBatch -TableName 'dbo.intune_devices' -ColumnMap $map -Batch $Batch -Connection $Connection
}

# ------------------------------------------------------------------------------
# 5b. INTUNE - estado de compliance por politica (intune_compliance_states)
# ------------------------------------------------------------------------------
function Save-IntuneComplianceStates {
    param(
        [Parameter(Mandatory)] $Batch,
        [Parameter(Mandatory)] $Connection
    )
    if ($null -eq $Batch -or $Batch.Count -eq 0) { return 0 }

    $map = [ordered]@{
        'execution_id'  = 'ExecutionId'
        'device_id'     = 'DeviceId'
        'device_name'   = 'DeviceName'
        'policy_name'   = 'PolicyName'
        'platform_type' = 'PlatformType'
        'state'         = 'State'
        'setting_count' = 'SettingCount'
    }
    return Save-DbBatch -TableName 'dbo.intune_compliance_states' -ColumnMap $map -Batch $Batch -Connection $Connection
}

# ------------------------------------------------------------------------------
# 6. REUNIOES TEAMS (meetings)
# ------------------------------------------------------------------------------
function Save-MeetingsInfo {
    param(
        [Parameter(Mandatory)] $Batch,
        [Parameter(Mandatory)] $Connection
    )
    if ($null -eq $Batch -or $Batch.Count -eq 0) { return 0 }

    $map = [ordered]@{
        'execution_id'        = 'ExecutionId'
        'user_email'          = 'Usuario'
        'event_title'         = 'Assunto'
        'start_time'          = 'Inicio'
        'end_time'            = 'Fim'
        'duration_minutes'    = 'DuracaoMin'
        'categories'          = 'Categorias'
        'meeting_type'        = 'Tipo'
        'attendance_status'   = 'Presenca'
    }
    return Save-DbBatch -TableName 'dbo.meetings' -ColumnMap $map -Batch $Batch -Connection $Connection
}

# ------------------------------------------------------------------------------
# 7. HISTORICO DE EXECUCAO (execution_history)
#    Start-ExecutionHistory grava a linha 'running' assim que a conexao DB
#    esta pronta; Complete-ExecutionHistory fecha com 'completed'/'failed'.
#    Sem isso, dbo.sp_RefreshDashboardAggregates e as views vw_latest_execution
#    nunca encontram uma execucao "completed" e o dashboard fica sempre vazio.
# ------------------------------------------------------------------------------
function Start-ExecutionHistory {
    param(
        [Parameter(Mandatory)] $Connection
    )
    $sql = @"
INSERT INTO dbo.execution_history (execution_id, start_time, status, machine_name, user_name)
VALUES (@exec, SYSUTCDATETIME(), 'running', @machine, @user)
"@
    $params = @{
        '@exec'    = $global:executionId
        '@machine' = $env:COMPUTERNAME
        '@user'    = $env:USERNAME
    }
    try {
        Invoke-DbNonQuery -Query $sql -Connection $Connection -Parameters $params -MaxRetries 2 | Out-Null
    } catch {
        Write-Host "[DB] Falha ao gravar execution_history (start): $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

function Complete-ExecutionHistory {
    param(
        [Parameter(Mandatory)] [ValidateSet('completed','failed')] [string] $Status,
        [Parameter(Mandatory)] $Connection,
        [Parameter(Mandatory=$false)] [int] $TotalSites = 0,
        [Parameter(Mandatory=$false)] [int] $TotalFiles = 0
    )
    $sql = @"
UPDATE dbo.execution_history
SET end_time = SYSUTCDATETIME(), status = @status,
    total_sites_processed = @sites, total_files_processed = @files
WHERE execution_id = @exec
"@
    $params = @{
        '@exec'   = $global:executionId
        '@status' = $Status
        '@sites'  = $TotalSites
        '@files'  = $TotalFiles
    }
    try {
        Invoke-DbNonQuery -Query $sql -Connection $Connection -Parameters $params -MaxRetries 2 | Out-Null
    } catch {
        Write-Host "[DB] Falha ao gravar execution_history (end): $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# ------------------------------------------------------------------------------
# 7a. COTA REAL DE ARMAZENAMENTO DO TENANT (Get-SitesInfo.ps1)
#     Get-PnPTenantSite.StorageQuota (por site) NAO e a capacidade total
#     contratada - sob gestao automatica de cota e so um teto de
#     provisionamento por site. A cota real vem de Get-PnPTenant, 1 chamada
#     unica por execucao (nao por site).
# ------------------------------------------------------------------------------
function Update-ExecutionTenantQuota {
    param(
        [Parameter(Mandatory)] $Connection,
        [Parameter(Mandatory)] [int64] $QuotaMb
    )
    $sql = 'UPDATE dbo.execution_history SET tenant_storage_quota_mb = @quota WHERE execution_id = @exec'
    $params = @{ '@exec' = $global:executionId; '@quota' = $QuotaMb }
    try {
        Invoke-DbNonQuery -Query $sql -Connection $Connection -Parameters $params -MaxRetries 2 | Out-Null
    } catch {
        Write-Host "[DB] Falha ao gravar tenant_storage_quota_mb: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# ------------------------------------------------------------------------------
# 7b. REFRESH DAS AGREGACOES DO DASHBOARD (dbo.sp_RefreshDashboardAggregates)
#     Chamada ao final de um assessment 'completed' para que o dashboard nao
#     precise cair em varredura direta de files_info (o que causa timeout).
# ------------------------------------------------------------------------------
function Invoke-DashboardRefresh {
    param(
        [Parameter(Mandatory)] $Connection,
        [Parameter(Mandatory=$false)] [string] $ExecutionId = $null
    )
    $eid = if ($ExecutionId) { $ExecutionId } else { $global:executionId }
    try {
        # Sem timeout (0): e o ultimo passo da execucao e, em Azure SQL S0, ~1,5
        # milhao de arquivos ja passa de 1h (CT, 29/10/2026) - cancelar no meio
        # deixava so parte das agg_* populadas e o dashboard incompleto.
        Invoke-DbNonQuery -Query 'EXEC dbo.sp_RefreshDashboardAggregates @execution_id = @eid' `
            -Connection $Connection -Parameters @{ '@eid' = $eid } -TimeoutSeconds 0 -MaxRetries 1 | Out-Null
        return $true
    } catch {
        # Vai pro arquivo de log tambem - antes so o console tinha o motivo e o
        # log mostrava apenas "Falha ao atualizar agregacoes" sem causa.
        $msg = "Falha ao rodar sp_RefreshDashboardAggregates: $($_.Exception.Message)"
        if (Get-Command Write-Log -ErrorAction SilentlyContinue) {
            Write-Log -Level ERROR -Module 'DB' -Message $msg
        } else {
            Write-Host "[DB] $msg" -ForegroundColor Yellow
        }
        return $false
    }
}

# ------------------------------------------------------------------------------
# 8. LOG DE EXECUCAO (execution_logs) - usado por Write-ExecutionLog
# ------------------------------------------------------------------------------
function Save-ExecutionLog {
    param(
        [Parameter(Mandatory)] [string] $Level,
        [Parameter(Mandatory)] [string] $Module,
        [Parameter(Mandatory)] [string] $Message,
        [Parameter(Mandatory=$false)] [string] $SiteUrl   = $null,
        [Parameter(Mandatory=$false)] [string] $Exception = $null,
        [Parameter(Mandatory)] $Connection
    )

    if (-not (Test-DbConnection -Connection $Connection)) { return }

    $sql = @"
INSERT INTO dbo.execution_logs
    (execution_id, log_time, log_level, module_name, site_url, message, exception_details, thread_id)
VALUES
    (@exec, GETDATE(), @lvl, @mod, @url, @msg, @exc, @tid)
"@
    $params = @{
        '@exec' = $global:executionId
        '@lvl'  = $Level
        '@mod'  = $Module
        '@url'  = $SiteUrl
        '@msg'  = $Message
        '@exc'  = $Exception
        '@tid'  = [System.Threading.Thread]::CurrentThread.ManagedThreadId
    }
    try {
        Invoke-DbNonQuery -Query $sql -Connection $Connection -Parameters $params -MaxRetries 2 | Out-Null
    } catch {
        # log nao deve interromper execucao
    }
}

# ------------------------------------------------------------------------------
# 9. STATUS DE DONOS DE SITE (site_owner_status) - usado por Get-OwnerStatus.ps1
# ------------------------------------------------------------------------------
function Save-SiteOwnerStatus {
    param(
        [Parameter(Mandatory)] $Batch,
        [Parameter(Mandatory)] $Connection
    )
    if ($null -eq $Batch -or $Batch.Count -eq 0) { return 0 }

    $map = [ordered]@{
        'execution_id'    = 'ExecutionId'
        'owner_mail'      = 'OwnerMail'
        'account_exists'  = 'AccountExists'
        'account_enabled' = 'AccountEnabled'
    }
    return Save-DbBatch -TableName 'dbo.site_owner_status' -ColumnMap $map -Batch $Batch -Connection $Connection
}

# ------------------------------------------------------------------------------
# 10. PROGRESSO POR SITE / RESUME (execution_progress)
#     Usado por src\main.ps1 para achar uma execucao 'running' interrompida, e
#     por Get-DataFiles.ps1/Get-TrashItems.ps1/Get-SitesInfo.ps1 para pular
#     sites ja concluidos e limpar dados parciais dos sites que serao
#     reprocessados. Ver docs/SCHEMA.sql (tabela dbo.execution_progress).
#
#     "SiteUrl" abaixo e generico - e so a chave usada para dividir o
#     trabalho em unidades por modulo, nao literalmente uma URL sempre.
#     Get-DataFiles.ps1/Get-TrashItems.ps1 usam o site_url de verdade;
#     Get-SitesInfo.ps1 usa o site_id (porque em dbo.sites_info o site_url
#     muda entre o site pai e cada subsite, mas o site_id e o mesmo).
# ------------------------------------------------------------------------------
function Get-ResumableExecution {
    param(
        [Parameter(Mandatory)] $Connection,
        [Parameter(Mandatory=$false)] [string] $MachineName = $env:COMPUTERNAME,
        [Parameter(Mandatory=$false)] [int]    $MaxAgeHours  = 72
    )
    $sql = @"
SELECT TOP 1 execution_id, start_time
FROM dbo.execution_history
WHERE status = 'running'
  AND machine_name = @machine
  AND start_time >= DATEADD(HOUR, -@hours, SYSUTCDATETIME())
ORDER BY start_time DESC
"@
    try {
        $rows = Invoke-DbReader -Query $sql -Connection $Connection `
                    -Parameters @{ '@machine' = $MachineName; '@hours' = $MaxAgeHours }
        if ($rows.Count -gt 0) { return $rows[0] }
    } catch {
        Write-Host "[DB] Falha ao buscar execucao resumivel: $($_.Exception.Message)" -ForegroundColor Yellow
    }
    return $null
}

function Get-CompletedSiteUrls {
    param(
        [Parameter(Mandatory)] $Connection,
        [Parameter(Mandatory)] [string] $ModuleName
    )
    $set = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    $sql = "SELECT site_url FROM dbo.execution_progress WHERE execution_id = @exec AND module_name = @mod AND status = 'completed'"
    try {
        $rows = Invoke-DbReader -Query $sql -Connection $Connection `
                    -Parameters @{ '@exec' = $global:executionId; '@mod' = $ModuleName }
        foreach ($r in $rows) { [void]$set.Add($r.site_url) }
    } catch {
        Write-Host "[DB] Falha ao buscar sites concluidos ($ModuleName): $($_.Exception.Message)" -ForegroundColor Yellow
    }
    # Virgula unaria pelo mesmo motivo de Invoke-DbReader (Connect-Database.ps1):
    # sem ela, um HashSet vazio (0 sites concluidos) vira $null e um com
    # exatamente 1 site vira uma string solta no retorno da funcao - os dois
    # quebram o ".Count"/".Contains(...)" no chamador (confirmado: foi
    # exatamente isso que travou Get-SitesInfo.ps1 no primeiro resume real).
    return ,$set
}

function Complete-SiteProgress {
    param(
        [Parameter(Mandatory)] $Connection,
        [Parameter(Mandatory)] [string] $ModuleName,
        [Parameter(Mandatory)] [string] $SiteUrl
    )
    $sql = @"
MERGE dbo.execution_progress AS tgt
USING (SELECT @exec AS execution_id, @mod AS module_name, @url AS site_url) AS src
ON  tgt.execution_id = src.execution_id
AND tgt.module_name  = src.module_name
AND tgt.site_url     = src.site_url
WHEN MATCHED THEN
    UPDATE SET status = 'completed', updated_at = SYSUTCDATETIME()
WHEN NOT MATCHED THEN
    INSERT (execution_id, module_name, site_url, status, updated_at)
    VALUES (src.execution_id, src.module_name, src.site_url, 'completed', SYSUTCDATETIME());
"@
    try {
        Invoke-DbNonQuery -Query $sql -Connection $Connection -MaxRetries 2 `
            -Parameters @{ '@exec' = $global:executionId; '@mod' = $ModuleName; '@url' = $SiteUrl } | Out-Null
    } catch {
        Write-Host "[DB] Falha ao gravar progresso ($ModuleName) do site ${SiteUrl}: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# ------------------------------------------------------------------------------
# 10a. PROGRESSO DE MODULOS "ATOMICOS" (licensing/adoption/intune/meetings/
#      owner_status) - ao contrario de files/trash/sites, esses modulos nao
#      processam por site (1 chamada ao Graph cobre o tenant inteiro), entao
#      nao tem granularidade de Complete-SiteProgress por item. Reaproveita a
#      MESMA tabela/chave (execution_progress) com SiteUrl fixo '__all__'
#      como sentinela: o modulo inteiro e "1 unidade de trabalho" (completou
#      ou nao) - sem isso, main.ps1 limpava e recoletava licenciamento, SKUs,
#      adocao, Intune e reunioes do zero em TODO resume, mesmo quando ja
#      tinham terminado com sucesso antes do processo cair.
# ------------------------------------------------------------------------------
function Test-ModuleCompleted {
    param(
        [Parameter(Mandatory)] $Connection,
        [Parameter(Mandatory)] [string] $ModuleName
    )
    $done = Get-CompletedSiteUrls -Connection $Connection -ModuleName $ModuleName
    return $done.Contains('__all__')
}

function Complete-ModuleProgress {
    param(
        [Parameter(Mandatory)] $Connection,
        [Parameter(Mandatory)] [string] $ModuleName
    )
    Complete-SiteProgress -Connection $Connection -ModuleName $ModuleName -SiteUrl '__all__'
}

function Clear-SiteData {
    param(
        [Parameter(Mandatory)] $Connection,
        [Parameter(Mandatory)] [string] $TableName,
        [Parameter(Mandatory)] [string] $SiteUrl,
        # dbo.sites_info grava 1 linha por site OU subsite, cada uma com seu
        # proprio site_url - a chave que identifica "todas as linhas de um
        # mesmo site" ali e site_id (compartilhado entre o pai e seus
        # subsites), nao site_url. Get-SitesInfo.ps1 passa -Column 'site_id'
        # por isso; Get-DataFiles.ps1/Get-TrashItems.ps1 usam o default.
        [Parameter(Mandatory=$false)] [string] $Column    = 'site_url',
        # Deleta em lotes (DELETE TOP) em vez de uma unica transacao gigante.
        # dbo.files_info chega a centenas de milhoes de linhas (ver
        # docs/SCHEMA.sql) - um site com muitas linhas parciais ja flushadas
        # antes do processo cair pode gerar um DELETE que nao termina dentro
        # de nenhum timeout razoavel. Em lotes, cada instrucao e pequena e
        # rapida mesmo com throughput de log limitado (ex: Azure SQL em tier
        # baixa), e uma falha no meio perde so o lote atual, nao o progresso
        # dos lotes ja commitados.
        [Parameter(Mandatory=$false)] [int]    $BatchSize = 5000
    )
    $sql = "DELETE TOP (@batch) FROM $TableName WHERE execution_id = @exec AND $Column = @url"
    $totalDeleted = 0
    try {
        do {
            $deleted = Invoke-DbNonQuery -Query $sql -Connection $Connection -MaxRetries 3 -TimeoutSeconds 600 `
                -Parameters @{ '@exec' = $global:executionId; '@url' = $SiteUrl; '@batch' = $BatchSize }
            $totalDeleted += $deleted
        } while ($deleted -eq $BatchSize)
    } catch {
        Write-Host "[DB] Falha ao limpar dados parciais de $TableName para ${SiteUrl} (removidas $totalDeleted linhas antes da falha): $($_.Exception.Message)" -ForegroundColor Yellow
        return $false
    }
    return $true
}

# Linhas de um site e dos subsites dele (site_url igual ou abaixo da URL), quando não há site_id para agrupar.
function Clear-SiteTreeData {
    param([Parameter(Mandatory)] $Connection, [Parameter(Mandatory)] [string] $TableName, [Parameter(Mandatory)] [string] $SiteUrl)
    $base = $SiteUrl.TrimEnd('/')
    $like = ($base -replace '([\[\]%_])', '[$1]') + '/%'
    $sql = "DELETE TOP (5000) FROM $TableName WHERE execution_id = @exec AND (site_url = @url OR site_url LIKE @like)"
    try {
        do { $n = Invoke-DbNonQuery -Query $sql -Connection $Connection -MaxRetries 3 -TimeoutSeconds 600 -Parameters @{ '@exec' = $global:executionId; '@url' = $base; '@like' = $like } } while ($n -ge 5000)
    } catch {
        Write-Host "[DB] Falha ao limpar dados parciais de $TableName para ${SiteUrl}: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# ------------------------------------------------------------------------------
# Duplicatas de uma coleta (retomadas antigas regravavam sites sem apagar): mantém a
# gravação mais nova de cada site, arquivo e item da lixeira. Seguro rodar sempre:
# numa coleta sem duplicatas não apaga nada. Devolve o total de linhas removidas.
# ------------------------------------------------------------------------------
function Repair-ExecutionDuplicates {
    param([Parameter(Mandatory)] $Connection, [string] $ExecutionId = $global:executionId)
    $defs = @(
        @{ T = 'dbo.sites_info';  K = "site_url, ISNULL(site_type, '')" },
        @{ T = 'dbo.files_info';  K = 'COALESCE(file_id, site_url + relative_url)' },
        @{ T = 'dbo.trash_items'; K = 'COALESCE(item_id, site_url + item_title + CONVERT(NVARCHAR(30), deleted_date, 126))' }
    )
    $total = 0L
    foreach ($d in $defs) {
        $sql = ";WITH d AS (SELECT id, ROW_NUMBER() OVER (PARTITION BY $($d.K) ORDER BY id DESC) AS rn FROM $($d.T) WHERE execution_id = @exec) DELETE TOP (20000) t FROM $($d.T) t JOIN d ON d.id = t.id WHERE d.rn > 1;"
        $n = 0L
        do { $x = Invoke-DbNonQuery -Query $sql -Connection $Connection -TimeoutSeconds 1800 -MaxRetries 2 -Parameters @{ '@exec' = $ExecutionId }; $n += $x } while ($x -ge 20000)
        if ($n) { Write-Log -Level WARNING -Module 'Main' -Message "Duplicatas removidas em $($d.T): $n linhas." }
        $total += $n
    }
    return $total
}

# ------------------------------------------------------------------------------
# Retomada: limpa as linhas parciais SO dos sites que tem linhas desta execucao
# (1 consulta pelo indice execution_id/site_url em vez de 1 DELETE por site).
# Devolve os sites cuja limpeza falhou: o modulo coleta assim mesmo e, no fim,
# Remove-DuplicateSiteRows mantem so a gravacao mais nova de cada arquivo.
# ------------------------------------------------------------------------------
function Clear-PartialSiteData {
    param(
        [Parameter(Mandatory)] $Connection,
        [Parameter(Mandatory)] [string] $TableName,
        [Parameter(Mandatory)] $Sites
    )
    $failed = [System.Collections.Generic.List[string]]::new()
    $want = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($s in $Sites) { if ($s.Url) { [void]$want.Add([string]$s.Url) } }
    # Pergunta só pelos sites que vão ser processados (em blocos, pelo índice execution_id + site_url): listar
    # todos os sites com linhas da coleta varria a tabela inteira e, em bancos grandes, estourava o tempo.
    $withRows = [System.Collections.Generic.List[object]]::new()
    $urls = @($want)
    for ($i = 0; $i -lt $urls.Count; $i += 50) {
        $chunk = $urls[$i..([math]::Min($i + 49, $urls.Count - 1))]
        $p = @{ '@exec' = $global:executionId }
        $names = for ($j = 0; $j -lt $chunk.Count; $j++) { $p["@u$j"] = $chunk[$j]; "@u$j" }
        try {
            $rows = Invoke-DbReader -Query "SELECT DISTINCT site_url FROM $TableName WITH (NOLOCK) WHERE execution_id = @exec AND site_url IN ($($names -join ','))" -Connection $Connection -TimeoutSeconds 120 -Parameters $p
            foreach ($r in $rows) { $withRows.Add($r) }
        } catch {
            Write-Host "[DB] Falha ao listar dados parciais de ${TableName}: $($_.Exception.Message)" -ForegroundColor Yellow
            foreach ($u in $chunk) { $failed.Add($u) }   # sem saber quem tem linha: deduplica esses no fim
        }
    }
    foreach ($r in $withRows) {
        $u = [string]$r.site_url
        if (-not $want.Contains($u)) { continue }
        if (-not (Clear-SiteData -Connection $Connection -TableName $TableName -SiteUrl $u)) { $failed.Add($u) }
    }
    return ,$failed
}

# Mantem so a gravacao mais nova de cada item (por file_id/relative_url) nos sites indicados.
function Remove-DuplicateSiteRows {
    param(
        [Parameter(Mandatory)] $Connection,
        [Parameter(Mandatory)] [string] $TableName,
        [Parameter(Mandatory)] [string[]] $SiteUrls,
        [Parameter(Mandatory)] [string] $KeyExpr
    )
    foreach ($u in $SiteUrls) {
        $sql = @"
;WITH d AS (SELECT id, ROW_NUMBER() OVER (PARTITION BY $KeyExpr ORDER BY id DESC) AS rn
            FROM $TableName WHERE execution_id = @exec AND site_url = @url)
DELETE TOP (5000) t FROM $TableName t JOIN d ON d.id = t.id WHERE d.rn > 1;
"@
        try {
            do { $n = Invoke-DbNonQuery -Query $sql -Connection $Connection -MaxRetries 3 -TimeoutSeconds 900 -Parameters @{ '@exec' = $global:executionId; '@url' = $u } } while ($n -ge 5000)
        } catch {
            Write-Host "[DB] Falha ao remover duplicatas de $TableName para ${u}: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
}

# ------------------------------------------------------------------------------
# Indices que a retomada e a limpeza usam (execution_id + site_url). Bancos
# criados antes nao tem: cria aqui, no job (pode levar minutos em bancos grandes),
# com ONLINE quando a edicao suporta. Idempotente.
# ------------------------------------------------------------------------------
function Initialize-CollectorIndexes {
    param([Parameter(Mandatory)] $Connection)
    $defs = @(
        @{ Name = 'IX_files_exec_site'; Table = 'dbo.files_info';  Cols = '(execution_id, site_url)' },
        @{ Name = 'IX_trash_exec_site'; Table = 'dbo.trash_items'; Cols = '(execution_id, site_url)' }
    )
    foreach ($d in $defs) {
        $exists = Invoke-DbScalar -Query "SELECT COUNT(*) FROM sys.indexes WHERE name = @n AND object_id = OBJECT_ID(@t)" -Connection $Connection -Parameters @{ '@n' = $d.Name; '@t' = $d.Table }
        if ([int]$exists -gt 0) { continue }
        Write-Log -Level INFO -Module 'Main' -Message "Criando indice $($d.Name) em $($d.Table) (uma vez por banco; pode levar alguns minutos)..." -DbConnection $Connection
        $base = "CREATE NONCLUSTERED INDEX $($d.Name) ON $($d.Table) $($d.Cols)"
        try {
            Invoke-DbNonQuery -Query "$base WITH (ONLINE = ON)" -Connection $Connection -MaxRetries 1 -TimeoutSeconds 3600 | Out-Null
        } catch {
            try { Invoke-DbNonQuery -Query $base -Connection $Connection -MaxRetries 1 -TimeoutSeconds 3600 | Out-Null }
            catch { Write-Log -Level WARNING -Module 'Main' -Message "Nao foi possivel criar $($d.Name): a retomada fica mais lenta." -Exception $_.Exception.Message -DbConnection $Connection }
        }
    }
}

function Clear-ExecutionModuleData {
    param(
        [Parameter(Mandatory)] $Connection,
        [Parameter(Mandatory)] [string] $TableName
    )
    $sql = "DELETE FROM $TableName WHERE execution_id = @exec"
    try {
        Invoke-DbNonQuery -Query $sql -Connection $Connection -MaxRetries 2 -TimeoutSeconds 300 `
            -Parameters @{ '@exec' = $global:executionId } | Out-Null
    } catch {
        Write-Host "[DB] Falha ao limpar dados previos (resume) de ${TableName}: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}
