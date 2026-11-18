# ==============================================================================
#  CT Assessment 365 SaaS | Correção de duplicatas de uma coleta (execução MANUTENCAO)
# ------------------------------------------------------------------------------
#  Mantém só a gravação mais nova de cada site, arquivo e item da lixeira da coleta
#  params.repair_execution (retomadas antigas regravavam os sites sem apagar) e
#  remonta as agregações do relatório. Seguro rodar de novo: sem duplicatas, não apaga nada.
#  Dot-source no Invoke-SaasAssessment.ps1 (usa Send-PortalEvent, $reporter, $sync).
# ==============================================================================
$target = [string]$global:params['repair_execution']
$status = 'failed'; $err = $null; $removed = 0L; $conn = $null
try {
    if ($target -notmatch '^[\w-]{8,64}$') { throw "Identificador de coleta inválido: '$target'" }
    $conn = New-DbConnection -MaxRetries 3
    Write-Log -Level INFO -Module 'Reparo' -Message "Procurando duplicatas da coleta $target no banco $($global:auth.database)."
    Report-Step -StepName 'Correção de duplicatas' -Status 'in progress' -Progress 10 -Info 'Removendo duplicatas'
    $removed = Repair-ExecutionDuplicates -Connection $conn -ExecutionId $target
    Write-Log -Level SUCCESS -Module 'Reparo' -Message "$removed linhas duplicadas removidas. Remontando as agregações do relatório (pode levar alguns minutos)..."
    Report-Step -StepName 'Correção de duplicatas' -Status 'in progress' -Progress 50 -Info 'Remontando agregações'
    if (-not (Invoke-DashboardRefresh -Connection $conn -ExecutionId $target)) { throw 'Falha ao remontar as agregações do relatório (sp_RefreshDashboardAggregates).' }
    Report-Step -StepName 'Correção de duplicatas' -Status 'completed' -Progress 100 -Info "$removed linhas"
    Write-Log -Level SUCCESS -Module 'Reparo' -Message 'Agregações do relatório atualizadas.'
    $status = 'completed'
} catch {
    $err = $_.Exception.Message
    Write-Log -Level ERROR -Module 'Reparo' -Message 'Falha ao corrigir a coleta; rode de novo para continuar.' -Exception $err
} finally {
    if ($conn) { try { Close-DbConnection -Connection $conn } catch { } }
    if ($certTemp) { Remove-Item $certTemp -Force -ErrorAction SilentlyContinue }
    $sync.Stop = $true
    Wait-Job $reporter -Timeout 90 | Out-Null
    Remove-Job $reporter -Force -ErrorAction SilentlyContinue
}
$final = @{ status = $status; result = @{ coleta = $target; linhas = $removed } }
if ($err) { $final.error = $err }
if (-not (Send-PortalEvent -Body $final)) { Write-Host '[Job] Não foi possível reportar o fim da correção ao portal.' -ForegroundColor Yellow }
