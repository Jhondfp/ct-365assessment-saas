# ==============================================================================
#  CT Assessment 365 SaaS | Worker de coleta (JOB_RUNNER=queue)
# ------------------------------------------------------------------------------
#  Container sempre ligado que pede trabalho ao portal: POST PORTAL_URL/api/jobs/claim
#  com o WORKER_TOKEN. Cada coleta roda Invoke-SaasAssessment.ps1 num processo pwsh
#  separado e numa CÓPIA da pasta do job (o coletor grava logs\ e src\progress\
#  relativos à raiz), então coletas simultâneas não se misturam.
#  WORKER_CONCURRENCY = quantas coletas ao mesmo tempo neste worker (padrão 1).
#  O portal entrega no máximo uma coleta por cliente de cada vez.
#  Se o container cair (reinício, nova versão), o portal devolve a coleta para a
#  fila depois de 10 min sem sinal e ela é retomada de onde parou.
#  Não precisa de nenhum papel RBAC no Azure.
# ==============================================================================
#Requires -Version 7.2
param(
    [string] $PortalUrl   = $env:PORTAL_URL,
    [string] $WorkerToken = $env:WORKER_TOKEN,
    [int]    $IdleSeconds = $(if ($env:WORKER_IDLE_SECONDS) { [int]$env:WORKER_IDLE_SECONDS } else { 15 }),
    [int]    $Concurrency = $(if ($env:WORKER_CONCURRENCY) { [int]$env:WORKER_CONCURRENCY } else { 1 }),
    [string] $WorkRoot    = $(Join-Path ([IO.Path]::GetTempPath()) 'ct-runs')
)
$ErrorActionPreference = 'Stop'
if (-not $PortalUrl -or -not $WorkerToken) { Write-Host 'Informe PORTAL_URL e WORKER_TOKEN.' -ForegroundColor Red; exit 2 }
$PortalUrl = $PortalUrl.TrimEnd('/')
$Concurrency = [Math]::Max(1, $Concurrency)
$worker = "$([Environment]::MachineName)"
New-Item -ItemType Directory -Path $WorkRoot -Force | Out-Null
Write-Host "[Worker $worker] pedindo coletas em $PortalUrl a cada ${IdleSeconds}s (até $Concurrency simultâneas)"

# Pasta própria para a coleta: cópia do job sem as sobras de execuções anteriores.
function New-RunFolder([string]$Id) {
    $dir = Join-Path $WorkRoot $Id
    if (Test-Path $dir) { Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue }
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    Get-ChildItem -LiteralPath $PSScriptRoot -Force |
        Where-Object { $_.Name -notin @('logs', 'tests') } |
        Copy-Item -Destination $dir -Recurse -Force
    Remove-Item (Join-Path $dir 'src/progress/*') -Force -Recurse -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Path (Join-Path $dir 'logs') -Force | Out-Null
    $dir
}

$running = @{}   # ASSESSMENT_ID -> @{ Process; Dir }
while ($true) {
    foreach ($id in @($running.Keys)) {
        $r = $running[$id]
        if ($r.Process.HasExited) {
            Write-Host "[Worker] coleta $id encerrada (exit $($r.Process.ExitCode))"
            Remove-Item $r.Dir -Recurse -Force -ErrorAction SilentlyContinue
            $running.Remove($id)
        }
    }

    $job = $null
    if ($running.Count -lt $Concurrency) {
        try {
            $resp = Invoke-WebRequest -Uri "$PortalUrl/api/jobs/claim" -Method Post -Headers @{ Authorization = "Bearer $WorkerToken" } `
                -ContentType 'application/json' -Body (@{ worker = $worker } | ConvertTo-Json -Compress) -TimeoutSec 60 -SkipHttpErrorCheck
            if ($resp.StatusCode -eq 200) { $job = $resp.Content | ConvertFrom-Json }
            elseif ($resp.StatusCode -ne 204) { Write-Host "[Worker] portal respondeu $($resp.StatusCode): $($resp.Content)" -ForegroundColor Yellow }
        } catch {
            Write-Host "[Worker] portal indisponível: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }

    if ($job) {
        $id = [string]$job.ASSESSMENT_ID
        if ($id -notmatch '^[\w-]+$') { Write-Host "[Worker] resposta inválida do portal" -ForegroundColor Yellow; Start-Sleep -Seconds $IdleSeconds; continue }
        if ($running.ContainsKey($id)) { Start-Sleep -Seconds 1; continue }   # já está rodando aqui
        try {
            $dir = New-RunFolder $id
            # o processo filho herda o ambiente no início; as variáveis são trocadas a cada coleta
            $env:ASSESSMENT_ID  = $id
            $env:CALLBACK_URL   = $job.CALLBACK_URL
            $env:CALLBACK_TOKEN = $job.CALLBACK_TOKEN
            $p = Start-Process -FilePath 'pwsh' -WorkingDirectory $dir -NoNewWindow -PassThru `
                -ArgumentList @('-NoLogo', '-NoProfile', '-NonInteractive', '-File', (Join-Path $dir 'Invoke-SaasAssessment.ps1'))
            $running[$id] = @{ Process = $p; Dir = $dir }
            Write-Host "[Worker] coleta $id iniciada (pid $($p.Id); $($running.Count) de $Concurrency)"
        } catch {
            Write-Host "[Worker] não consegui iniciar a coleta ${id}: $($_.Exception.Message)" -ForegroundColor Red
        } finally {
            Remove-Item Env:ASSESSMENT_ID, Env:CALLBACK_URL, Env:CALLBACK_TOKEN -ErrorAction SilentlyContinue
        }
        continue   # tenta pegar outra logo em seguida, se houver vaga
    }
    Start-Sleep -Seconds $IdleSeconds
}
