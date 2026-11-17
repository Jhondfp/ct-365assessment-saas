# ==============================================================================
#  CT Assessment 365 SaaS | Higienização disparada pelo portal
# ------------------------------------------------------------------------------
#  Carregado (dot-source) pelo Invoke-SaasAssessment.ps1 quando params.hygiene
#  existe: aproveita a configuração já recebida do portal ($global:auth, cert,
#  $config), a thread de reporte ($reporter/$sync) e Send-PortalEvent.
#  Roda a ação pedida (hoje: limpeza de versões — hygiene/Invoke-VersionCleanup.ps1),
#  mostra o progresso por site e, no fim, envia ao portal o resumo (result) e o
#  log completo. O id da execução no portal é o run_id em dbo.hygiene_runs.
# ==============================================================================
$h = $global:params['hygiene']
$finalStatus = 'failed'
$finalError = $null
$summary = $null
try {
    $action = [string]$h['action']
    if ($action -ne 'version_cleanup') { throw "Ação de higienização desconhecida: $action" }
    $dry = [bool]$h['dryRun']
    $sites = @($h['sites'] | Where-Object { $_ })
    $mode = if ($h['mode'] -eq 'JobSharePoint') { 'JobSharePoint' } else { 'PorArquivo' }
    Write-Log -Level INFO -Module 'Main' -Message ("Higienização: limpeza de versões | {0} | manter={1} | {2} | {3} | escopo={4}" -f $(if ($dry) { 'SIMULAÇÃO' } else { 'EXECUÇÃO' }), $h['keep'], $mode, $(if ($h['recycle']) { 'lixeira' } else { 'PERMANENTE' }), $(if ($sites.Count) { "$($sites.Count) site(s)" } else { 'tenant inteiro' }))

    $global:TokenGraph = Get-GraphToken   # valida a credencial antes de mexer em qualquer site
    Report-Step -StepName 'Limpeza de versões' -Status 'in progress' -Progress 2 -Info 'Selecionando arquivos candidatos'

    $cleanupArgs = @{
        ManterVersoes = [int]$h['keep']
        Acao          = $(if ($dry) { 'Simular' } else { 'Executar' })
        Modo          = $mode
        SemLixeira    = -not [bool]$h['recycle']
        RunId         = $global:executionId
        MaxArquivos   = $(if ($h['maxFiles']) { [int]$h['maxFiles'] } else { 0 })
        OnProgress    = {
            param($p)
            $pct = [math]::Min(98, [int](100 * $p.index / [math]::Max(1, $p.total)))
            $v = ($p.results | Measure-Object versions_deleted -Sum).Sum
            $b = ($p.results | Measure-Object bytes -Sum).Sum
            Report-Step -StepName 'Limpeza de versões' -Status 'in progress' -Progress $pct -Info ("{0} de {1} sites · {2} versões · {3:N1} GB" -f $p.index, $p.total, $v, ($b / 1GB))
        }
        Confirm       = $false
    }
    if ($sites.Count) { $cleanupArgs.SiteUrl = $sites }
    if ($h['sourceExecutionId']) { $cleanupArgs.ExecutionId = [string]$h['sourceExecutionId'] }
    if ($h['includeLabeled']) { $cleanupArgs.IncluirRotulados = $true }

    $summary = & (Join-Path $projectRoot 'hygiene\Invoke-VersionCleanup.ps1') @cleanupArgs | Select-Object -Last 1
    Report-Step -StepName 'Limpeza de versões' -Status 'completed' -Progress 100 -Info ("{0} versões · {1:N1} GB" -f $summary.versoes, ($summary.bytes / 1GB))
    $finalStatus = $summary.status
    if ($finalStatus -ne 'completed') { $finalError = "$($summary.erros) arquivo(s) com erro — veja a lista de itens." }
}
catch {
    $finalError = "$($_.Exception.Message)"
    Write-Log -Level CRITICAL -Module 'Main' -Message 'Falha na higienização.' -Exception $finalError
    Write-Host $_.ScriptStackTrace -ForegroundColor DarkGray
}
finally {
    if ($certTemp) { Remove-Item $certTemp -Force -ErrorAction SilentlyContinue }
    Write-Log -Level INFO -Module 'Main' -Message "=== Higienização finalizada | $($global:executionId) | $finalStatus ==="
    $sync.Stop = $true
    Wait-Job $reporter -Timeout 90 | Out-Null
    Remove-Job $reporter -Force -ErrorAction SilentlyContinue
    try {
        $files = @(Get-ChildItem $logDir -Filter '*.log' -ErrorAction SilentlyContinue | Sort-Object Name)
        if ($files.Count) {
            $ms = [IO.MemoryStream]::new()
            $gz = [IO.Compression.GZipStream]::new($ms, [IO.Compression.CompressionLevel]::Optimal, $true)
            foreach ($f in $files) { $b = [IO.File]::ReadAllBytes($f.FullName); $gz.Write($b, 0, $b.Length) }
            $gz.Dispose()
            Invoke-RestMethod -Uri "$CallbackUrl/log" -Method Post -Headers $headers -ContentType 'application/gzip' -Body $ms.ToArray() -TimeoutSec 300 | Out-Null
        }
    } catch { Write-Host "[Job] Não foi possível enviar o log completo: $($_.Exception.Message)" -ForegroundColor Yellow }
    $final = @{ status = $finalStatus }
    if ($summary) { $final.result = $summary; $final.totalSites = [int]$summary.sites }
    if ($finalError) { $final.error = $finalError }
    if (-not (Send-PortalEvent -Body $final)) { Write-Host '[Job] Não foi possível reportar o resultado final ao portal.' -ForegroundColor Yellow }
}
