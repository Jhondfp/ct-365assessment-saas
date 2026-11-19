# ==============================================================================
#  CT Assessment 365 SaaS | Exclusão de uma coleta (execução EXCLUSAO do portal)
# ------------------------------------------------------------------------------
#  Apaga do banco do cliente todos os dados de UMA coleta (params.delete_execution),
#  tabela por tabela, em lotes (files_info pode ter milhões de linhas), e reporta ao
#  portal. Não abre transação longa: se cair no meio, rodar de novo continua de onde
#  parou. execution_history por último, para a coleta só "sumir" no fim.
#  Dot-source no Invoke-SaasAssessment.ps1 (usa Send-PortalEvent, $reporter, $sync).
# ==============================================================================
$target = [string]$global:params['delete_execution']
$deleteTables = @(
    'agg_growth_monthly', 'agg_top_heaviest_files', 'agg_top_versioned_files', 'agg_file_types_by_sitetype', 'agg_version_by_site',
    'agg_stale_by_site_year', 'agg_file_types', 'agg_files_by_owner', 'agg_duplicate_candidates', 'agg_files_by_site',
    'intune_compliance_states', 'intune_devices', 'meetings', 'licensing_info', 'mailbox_info', 'user_activity',
    'trash_items', 'files_info', 'site_owner_status', 'execution_progress', 'sites_info',
    'g_users', 'g_groups', 'g_orgunits', 'g_domains', 'g_licenses', 'g_resources', 'g_devices',
    'execution_logs', 'execution_history'
)

$status = 'failed'; $err = $null; $totalRows = 0L; $perTable = [ordered]@{}
$conn = $null
try {
    if ($target -notmatch '^[\w-]{8,64}$') { throw "Identificador de coleta inválido: '$target'" }
    $conn = New-DbConnection -MaxRetries 3
    Write-Log -Level INFO -Module 'Exclusao' -Message "Excluindo os dados da coleta $target do banco $($global:auth.database)."
    $i = 0
    foreach ($t in $deleteTables) {
        $i++
        Report-Step -StepName 'Exclusão da coleta' -Status 'in progress' -Progress ([math]::Round(($i - 1) / $deleteTables.Count * 100)) -Info "dbo.$t"
        $exists = Invoke-DbScalar -Query "SELECT CASE WHEN OBJECT_ID(@t, 'U') IS NULL THEN 0 ELSE 1 END" -Connection $conn -Parameters @{ '@t' = "dbo.$t" }
        if ([int]$exists -eq 0) { continue }
        $n = 0L
        do {
            $d = Invoke-DbNonQuery -Query "DELETE TOP (20000) FROM dbo.$t WHERE execution_id = @e" -Connection $conn -TimeoutSeconds 900 -MaxRetries 3 -Parameters @{ '@e' = $target }
            $n += $d
        } while ($d -ge 20000)
        if ($n) { $perTable[$t] = $n; $totalRows += $n; Write-Log -Level INFO -Module 'Exclusao' -Message "dbo.${t}: $n linhas removidas." }
    }
    Report-Step -StepName 'Exclusão da coleta' -Status 'completed' -Progress 100 -Info "$totalRows linhas"
    Write-Log -Level SUCCESS -Module 'Exclusao' -Message "Coleta $target excluída: $totalRows linhas removidas."
    $status = 'completed'
} catch {
    $err = $_.Exception.Message
    Write-Log -Level ERROR -Module 'Exclusao' -Message 'Falha ao excluir a coleta; rode a exclusão de novo para continuar.' -Exception $err
} finally {
    if ($conn) { try { Close-DbConnection -Connection $conn } catch { } }
    if ($certTemp) { Remove-Item $certTemp -Force -ErrorAction SilentlyContinue }
    $sync.Stop = $true
    Wait-Job $reporter -Timeout 90 | Out-Null
    Remove-Job $reporter -Force -ErrorAction SilentlyContinue
}
$final = @{ status = $status; result = @{ coleta = $target; linhas = $totalRows; tabelas = $perTable } }
if ($err) { $final.error = $err }
if (-not (Send-PortalEvent -Body $final)) { Write-Host '[Job] Não foi possível reportar o fim da exclusão ao portal.' -ForegroundColor Yellow }
