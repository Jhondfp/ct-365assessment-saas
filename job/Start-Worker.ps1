# ==============================================================================
#  CT Assessment 365 SaaS | Worker de coleta (JOB_RUNNER=queue)
# ------------------------------------------------------------------------------
#  Container sempre ligado que pede trabalho ao portal: POST PORTAL_URL/api/jobs/claim
#  com o WORKER_TOKEN. Quando recebe uma coleta, roda Invoke-SaasAssessment.ps1 num
#  processo pwsh separado (isolado: variáveis globais, runspaces e arquivos de status
#  começam limpos a cada coleta) e volta a pedir. Uma coleta por vez por worker;
#  para coletar vários clientes em paralelo, aumente as réplicas do Container App.
#  Não precisa de nenhum papel RBAC no Azure.
# ==============================================================================
#Requires -Version 7.2
param(
    [string] $PortalUrl   = $env:PORTAL_URL,
    [string] $WorkerToken = $env:WORKER_TOKEN,
    [int]    $IdleSeconds = $(if ($env:WORKER_IDLE_SECONDS) { [int]$env:WORKER_IDLE_SECONDS } else { 15 })
)
$ErrorActionPreference = 'Stop'
if (-not $PortalUrl -or -not $WorkerToken) { Write-Host 'Informe PORTAL_URL e WORKER_TOKEN.' -ForegroundColor Red; exit 2 }
$PortalUrl = $PortalUrl.TrimEnd('/')
$worker = "$([Environment]::MachineName)"
$entry  = Join-Path $PSScriptRoot 'Invoke-SaasAssessment.ps1'
Write-Host "[Worker $worker] pedindo coletas em $PortalUrl a cada ${IdleSeconds}s"

while ($true) {
    $job = $null
    try {
        $resp = Invoke-WebRequest -Uri "$PortalUrl/api/jobs/claim" -Method Post -Headers @{ Authorization = "Bearer $WorkerToken" } `
            -ContentType 'application/json' -Body (@{ worker = $worker } | ConvertTo-Json -Compress) -TimeoutSec 60 -SkipHttpErrorCheck
        if ($resp.StatusCode -eq 200) { $job = $resp.Content | ConvertFrom-Json }
        elseif ($resp.StatusCode -ne 204) { Write-Host "[Worker] portal respondeu $($resp.StatusCode): $($resp.Content)" -ForegroundColor Yellow }
    } catch {
        Write-Host "[Worker] portal indisponível: $($_.Exception.Message)" -ForegroundColor Yellow
    }

    if ($job) {
        Write-Host "[Worker] coleta $($job.ASSESSMENT_ID) iniciada"
        $env:ASSESSMENT_ID  = $job.ASSESSMENT_ID
        $env:CALLBACK_URL   = $job.CALLBACK_URL
        $env:CALLBACK_TOKEN = $job.CALLBACK_TOKEN
        # limpa sobras da coleta anterior (o coletor grava logs/ e src/progress/ relativos à raiz)
        Remove-Item (Join-Path $PSScriptRoot 'logs\*'), (Join-Path $PSScriptRoot 'src\progress\*') -Force -ErrorAction SilentlyContinue
        & pwsh -NoLogo -NoProfile -NonInteractive -File $entry
        Write-Host "[Worker] coleta $($job.ASSESSMENT_ID) encerrada (exit $LASTEXITCODE)"
        Remove-Item Env:ASSESSMENT_ID, Env:CALLBACK_URL, Env:CALLBACK_TOKEN -ErrorAction SilentlyContinue
        continue
    }
    Start-Sleep -Seconds $IdleSeconds
}
