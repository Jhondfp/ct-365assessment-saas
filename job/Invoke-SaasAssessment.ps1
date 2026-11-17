# ==============================================================================
#  CT Assessment 365 SaaS | Entrypoint do job de coleta
# ------------------------------------------------------------------------------
#  Roda o coletor do ct-assessmentspo (src/, copiado sem alterações por
#  scripts/sync-collector.sh) para UMA execução disparada pelo portal.
#
#  Diferenças para o src/main.ps1 do ct-assessmentspo:
#   - auth.json / params.json vêm do portal (GET CALLBACK_URL), não de arquivos;
#     a credencial do M365 e a senha do banco nunca ficam no disco nem na imagem
#     (o certificado PFX vai para um arquivo temporário apagado no fim).
#   - o execution_id é o id da execução no portal. Se o container reiniciar
#     (retry do Container Apps Job), a execução continua de onde parou usando o
#     mesmo mecanismo de resume do coletor (dbo.execution_progress).
#   - em vez do monitor local (Start-Monitor.ps1), uma thread envia ao portal o
#     global_status.json e as linhas novas do log a cada 10 s.
#  O bloco "7. EXECUCAO DOS MODULOS" espelha o main.ps1: ao sincronizar uma
#  versão nova do coletor, confira se a ordem/condições dos módulos mudou lá.
#
#  Uso: variáveis ASSESSMENT_ID, CALLBACK_URL e CALLBACK_TOKEN (ou parâmetros).
# ==============================================================================

#Requires -Version 7.2
param(
    [string] $AssessmentId  = $env:ASSESSMENT_ID,
    [string] $CallbackUrl   = $env:CALLBACK_URL,
    [string] $CallbackToken = $env:CALLBACK_TOKEN
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 3.0

$projectRoot = $PSScriptRoot
Set-Location $projectRoot

if (-not $AssessmentId -or -not $CallbackUrl -or -not $CallbackToken) {
    Write-Host 'Informe ASSESSMENT_ID, CALLBACK_URL e CALLBACK_TOKEN (variáveis de ambiente ou parâmetros).' -ForegroundColor Red
    exit 2
}

$headers = @{ Authorization = "Bearer $CallbackToken" }

function Send-PortalEvent {
    param([hashtable] $Body)
    $json = $Body | ConvertTo-Json -Depth 8 -Compress
    for ($i = 1; $i -le 5; $i++) {
        try {
            Invoke-RestMethod -Uri $CallbackUrl -Method Post -Headers $headers -ContentType 'application/json; charset=utf-8' `
                -Body ([System.Text.Encoding]::UTF8.GetBytes($json)) -TimeoutSec 60 | Out-Null
            return $true
        } catch {
            $code = try { [int]$_.Exception.Response.StatusCode } catch { 0 }
            if ($code -eq 409 -or $code -eq 401) { return $false }
            Start-Sleep -Seconds (3 * $i)
        }
    }
    return $false
}

# ------------------------------------------------------------------------------
# 1. CONFIGURAÇÃO DA EXECUÇÃO (portal)
# ------------------------------------------------------------------------------
Write-Host "[Job] Execução $AssessmentId — buscando configuração no portal..."
$config = $null
for ($i = 1; $i -le 8; $i++) {
    try {
        $config = Invoke-RestMethod -Uri $CallbackUrl -Method Get -Headers $headers -TimeoutSec 60
        break
    } catch {
        $code = try { [int]$_.Exception.Response.StatusCode } catch { 0 }
        if ($code -in 401, 404, 409) {
            # Execução cancelada/concluída/inexistente: nada a fazer, e um retry também não ajudaria.
            Write-Host "[Job] Portal recusou a execução (HTTP $code): $($_.ErrorDetails.Message). Encerrando." -ForegroundColor Yellow
            exit 0
        }
        Write-Host "[Job] Portal indisponível (tentativa $i/8): $($_.Exception.Message)" -ForegroundColor Yellow
        Start-Sleep -Seconds ([math]::Min(10 * $i, 60))
    }
}
if (-not $config) { Write-Host '[Job] Sem configuração do portal.' -ForegroundColor Red; exit 1 }

# ------------------------------------------------------------------------------
# 2. CARREGAMENTO DO COLETOR (mesma ordem do main.ps1)
# ------------------------------------------------------------------------------
. (Join-Path $projectRoot 'src\connection\Connect-Database.ps1')
. (Join-Path $projectRoot 'src\connection\Repository.ps1')
. (Join-Path $projectRoot 'src\connection\Connect-Graph.ps1')
. (Join-Path $projectRoot 'src\connection\Connect-SharePoint.ps1')
. (Join-Path $projectRoot 'src\utils\Write-Log.ps1')
. (Join-Path $projectRoot 'src\utils\Handle-Status.ps1')
. (Join-Path $projectRoot 'src\utils\Export-Csv.ps1')
. (Join-Path $projectRoot 'src\modules\Get-LicensingInfo.ps1')
. (Join-Path $projectRoot 'src\modules\Get-ActivityInfo.ps1')
. (Join-Path $projectRoot 'src\modules\Get-MailboxInfo.ps1')
. (Join-Path $projectRoot 'src\modules\Get-IntuneInfo.ps1')
. (Join-Path $projectRoot 'src\modules\Get-MeetingsInfo.ps1')
. (Join-Path $projectRoot 'src\modules\Get-SitesInfo.ps1')
. (Join-Path $projectRoot 'src\modules\Get-OwnerStatus.ps1')
. (Join-Path $projectRoot 'src\modules\Get-DataFiles.ps1')
. (Join-Path $projectRoot 'src\modules\Get-TrashItems.ps1')

$global:executionId = [string]$config.executionId
# Start-ExecutionHistory grava machine_name/user_name (no Linux essas variáveis não existem)
if (-not $env:COMPUTERNAME) { $env:COMPUTERNAME = "saas-$([Environment]::MachineName)" }
if (-not $env:USERNAME)     { $env:USERNAME = 'ct-assessment-saas' }

$logDir      = Join-Path $projectRoot 'logs'
$progressDir = Join-Path $projectRoot 'src\progress'
Initialize-Logger -LogDir $logDir
Initialize-Status -ProgressDir $progressDir

$global:auth   = $config.auth   | ConvertTo-Json -Depth 5 | ConvertFrom-Json -AsHashtable
$global:params = $config.params | ConvertTo-Json -Depth 5 | ConvertFrom-Json -AsHashtable
foreach ($k in 'tenant_id','client_id') { if ($global:auth[$k] -is [string]) { $global:auth[$k] = $global:auth[$k].Trim() } }

# Certificado: Get-GraphToken lê auth.cert_path; o PnP usa $global:base64Cert
$global:base64Cert = $null
$certTemp = $null
if ($global:auth.auth_mode -eq 'cert') {
    $global:base64Cert = [string]$config.certBase64
    $certTemp = Join-Path ([System.IO.Path]::GetTempPath()) "ct-$([guid]::NewGuid()).pfx"
    [System.IO.File]::WriteAllBytes($certTemp, [Convert]::FromBase64String($global:base64Cert))
    $global:auth.cert_path = $certTemp
}

# ------------------------------------------------------------------------------
# 3. THREAD DE REPORTE AO PORTAL (status + log a cada 10 s)
# ------------------------------------------------------------------------------
$sync = [hashtable]::Synchronized(@{ Stop = $false })
$reporter = Start-ThreadJob -Name 'portal-reporter' -ArgumentList $CallbackUrl, $CallbackToken, (Join-Path $progressDir 'global_status.json'), $logDir, $sync -ScriptBlock {
    param($url, $token, $statusFile, $logDir, $sync)
    $offsets = @{}
    $re = '^\[(?<ts>[^\]]+)\]\s+\[(?<lvl>[^\]]+)\]\s+\[(?<mod>[^\]]+)\]\s+(?<msg>.+)$'
    while ($true) {
        $last = $sync.Stop
        $body = @{}
        try {
            if (Test-Path $statusFile) {
                $raw = [System.IO.File]::ReadAllText($statusFile, [System.Text.Encoding]::UTF8)
                if ($raw) { $body.progress = $raw | ConvertFrom-Json -AsHashtable }
            }
        } catch { }
        $lines = [System.Collections.Generic.List[hashtable]]::new()
        try {
            foreach ($f in (Get-ChildItem $logDir -Filter '*.log' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime)) {
                $off = if ($offsets.ContainsKey($f.FullName)) { $offsets[$f.FullName] } else { 0L }
                if ($f.Length -le $off) { continue }
                $fs = [System.IO.File]::Open($f.FullName, 'Open', 'Read', 'ReadWrite')
                try {
                    [void]$fs.Seek($off, 'Begin')
                    $sr = [System.IO.StreamReader]::new($fs, [System.Text.Encoding]::UTF8)
                    $text = $sr.ReadToEnd()
                    # só consome até a última quebra de linha (linha incompleta fica para o próximo ciclo)
                    $cut = $text.LastIndexOf("`n")
                    if ($cut -lt 0) { continue }
                    $offsets[$f.FullName] = $off + [System.Text.Encoding]::UTF8.GetByteCount($text.Substring(0, $cut + 1))
                    foreach ($line in ($text.Substring(0, $cut) -split "`r?`n")) {
                        if ([string]::IsNullOrWhiteSpace($line)) { continue }
                        $e = @{ ts = ''; level = 'INFO'; module = ''; message = $line }
                        if ($line -match $re) { $e.ts = $Matches.ts; $e.level = $Matches.lvl.Trim(); $e.module = $Matches.mod.Trim(); $e.message = $Matches.msg.Trim() }
                        $lines.Add($e)
                    }
                } finally { $fs.Dispose() }
            }
        } catch { }
        if ($lines.Count -gt 0) { $body.log = @($lines | Select-Object -Last 300) }
        if ($body.Count -gt 0) {
            try {
                $json = $body | ConvertTo-Json -Depth 8 -Compress
                Invoke-RestMethod -Uri $url -Method Post -Headers @{ Authorization = "Bearer $token" } -ContentType 'application/json; charset=utf-8' `
                    -Body ([System.Text.Encoding]::UTF8.GetBytes($json)) -TimeoutSec 60 | Out-Null
            } catch {
                $code = try { [int]$_.Exception.Response.StatusCode } catch { 0 }
                if ($code -eq 409) {
                    # Cancelada no portal (no Container Apps o portal já para o container; aqui cobre execução manual/docker)
                    Write-Host '[Job] Execução cancelada no portal — encerrando o processo.' -ForegroundColor Yellow
                    [Environment]::Exit(0)
                }
            }
        }
        if ($last) { break }
        for ($i = 0; $i -lt 10 -and -not $sync.Stop; $i++) { Start-Sleep -Seconds 1 }
    }
}

# ------------------------------------------------------------------------------
# 4..8. PIPELINE (espelha o main.ps1)
# ------------------------------------------------------------------------------
$dbConn = $null
$sitesColetados = @()
$finalStatus = 'failed'
$finalError = $null
try {
    Write-Log -Level INFO -Module 'Main' -Message "Config recebida do portal | cliente=$($config.clientName) | mode=$($global:auth.auth_mode) | tentativa=$($config.attempt)"

    Write-Log -Level INFO -Module 'Main' -Message 'Adquirindo token Microsoft Graph...'
    $global:TokenGraph = Get-GraphToken
    if (-not $global:TokenGraph) { throw 'Token Graph nao adquirido.' }
    Write-Log -Level SUCCESS -Module 'Main' -Message 'Token Graph adquirido (cache local ativo).'

    Write-Log -Level INFO -Module 'Main' -Message "Conectando ao banco do cliente ($($global:auth.database))..."
    $dbConn = New-DbConnection
    Write-Log -Level SUCCESS -Module 'Main' -Message "Conexao DB ativa em $($global:auth.server)/$($global:auth.database)"

    # Retomada: a mesma execução já tem linha em execution_history (o container anterior caiu no meio)
    $isResume = $false
    # Invoke-DbReader ja devolve array (virgula unaria): NAO envolver em @(), senao 0 linhas vira [ [] ] (Count=1)
    $prev = Invoke-DbReader -Connection $dbConn -Query 'SELECT status FROM dbo.execution_history WHERE execution_id = @exec' -Parameters @{ '@exec' = $global:executionId }
    if ($null -ne $prev -and $prev.Count -gt 0) {
        $isResume = $true
        Invoke-DbNonQuery -Connection $dbConn -Query "UPDATE dbo.execution_history SET status = 'running', end_time = NULL WHERE execution_id = @exec" -Parameters @{ '@exec' = $global:executionId } | Out-Null
        Write-Log -Level WARNING -Module 'Main' -Message "Retomando execucao $($global:executionId) (status anterior: $($prev[0].status))." -DbConnection $dbConn
    } else {
        Start-ExecutionHistory -Connection $dbConn
    }
    $global:isResume = $isResume
    Write-Log -Level INFO -Module 'Main' -Message "=== CT Assessment iniciado | ExecutionId=$($global:executionId) | Resume=$isResume ==="

    function Invoke-ResumableModule {
        param(
            [Parameter(Mandatory)] [string]      $ModuleName,
            [Parameter(Mandatory)] [string[]]    $ClearTables,
            [Parameter(Mandatory)] [scriptblock] $ScriptBlock
        )
        if ($isResume -and (Test-ModuleCompleted -Connection $dbConn -ModuleName $ModuleName)) {
            Write-Log -Level INFO -Module 'Main' -Message "Resume: modulo '$ModuleName' ja concluido nesta execucao - pulando." -DbConnection $dbConn
            return
        }
        if ($isResume) { foreach ($t in $ClearTables) { Clear-ExecutionModuleData -Connection $dbConn -TableName $t } }
        $ok = & $ScriptBlock
        if ($ok) { Complete-ModuleProgress -Connection $dbConn -ModuleName $ModuleName }
    }

    # 7. EXECUCAO DOS MODULOS HABILITADOS — mesma ordem e condições do main.ps1
    if ($global:params.process_licensing_info) {
        Invoke-ResumableModule -ModuleName 'licensing' -ClearTables @('dbo.licensing_info') -ScriptBlock { Get-LicensingData -Connection $dbConn }
    }
    if ($global:params.process_adoption_info) {
        Invoke-ResumableModule -ModuleName 'adoption' -ClearTables @('dbo.user_activity') -ScriptBlock { Get-ActivityInfo -Connection $dbConn }
    }
    if ($global:params.process_mailbox_info) {
        Invoke-ResumableModule -ModuleName 'mailbox' -ClearTables @('dbo.mailbox_info') -ScriptBlock { Get-MailboxInfo -Connection $dbConn }
    }
    if ($global:params.process_intune_info) {
        Invoke-ResumableModule -ModuleName 'intune' -ClearTables @('dbo.intune_devices','dbo.intune_compliance_states') -ScriptBlock { Get-IntuneInfo -Connection $dbConn }
    }
    if ($global:params.process_calendar) {
        Invoke-ResumableModule -ModuleName 'meetings' -ClearTables @('dbo.meetings') -ScriptBlock { Get-MeetingsInfo -Connection $dbConn }
    }
    if ($global:params.process_sites_info) {
        $sitesColetados = @(Get-SitesInfo -Connection $dbConn)
    }
    if ($global:params.process_owner_status -and $sitesColetados.Count -gt 0) {
        Invoke-ResumableModule -ModuleName 'owner_status' -ClearTables @('dbo.site_owner_status') -ScriptBlock { Get-OwnerStatus -Connection $dbConn }
    }
    if ($global:params.process_sites -or $global:params.process_subsites) {
        Get-DataFiles -Sites $sitesColetados -Connection $dbConn
    }
    if ($global:params.process_recycle_bin -and $sitesColetados.Count -gt 0) {
        Get-TrashItems -Sites $sitesColetados -Connection $dbConn
    }

    Write-Log -Level SUCCESS -Module 'Main' -Message 'Pipeline executado com sucesso.' -DbConnection $dbConn
    Complete-ExecutionHistory -Status 'completed' -Connection $dbConn -TotalSites $sitesColetados.Count
    Write-Log -Level INFO -Module 'Main' -Message 'Atualizando agregacoes do dashboard (sp_RefreshDashboardAggregates)...'
    if (Invoke-DashboardRefresh -Connection $dbConn) {
        Write-Log -Level SUCCESS -Module 'Main' -Message 'Agregacoes do dashboard atualizadas.'
    } else {
        Write-Log -Level WARNING -Module 'Main' -Message 'Falha ao atualizar agregacoes do dashboard - rode dbo.sp_RefreshDashboardAggregates manualmente.'
    }
    $finalStatus = 'completed'
}
catch {
    $finalError = "$($_.Exception.Message)"
    Write-Log -Level CRITICAL -Module 'Main' -Message 'Falha critica no pipeline.' -Exception $finalError -DbConnection $dbConn
    Write-Host $_.ScriptStackTrace -ForegroundColor DarkGray
    if ($null -ne $dbConn) { Complete-ExecutionHistory -Status 'failed' -Connection $dbConn -TotalSites $sitesColetados.Count }
}
finally {
    if ($null -ne $dbConn) { try { Close-DbConnection -Connection $dbConn } catch { } }
    if ($certTemp) { Remove-Item $certTemp -Force -ErrorAction SilentlyContinue }
    Write-Log -Level INFO -Module 'Main' -Message "=== CT Assessment finalizado | ExecutionId=$($global:executionId) | $finalStatus ==="

    # último envio de log/progresso e o resultado final
    $sync.Stop = $true
    Wait-Job $reporter -Timeout 90 | Out-Null
    Remove-Job $reporter -Force -ErrorAction SilentlyContinue
    $final = @{ status = $finalStatus; totalSites = $sitesColetados.Count }
    if ($finalError) { $final.error = $finalError }
    if (-not (Send-PortalEvent -Body $final)) { Write-Host '[Job] Não foi possível reportar o resultado final ao portal.' -ForegroundColor Yellow }
}
# Falha já registrada no portal: sai com 0 para o Container Apps não repetir uma execução encerrada.
exit 0
