# ==============================================================================
#  Teste do pipeline do Invoke-SaasAssessment.ps1 (checagem prévia + workloads)
#  sob StrictMode, com Graph/PnP/banco/módulos simulados. Extrai do entrypoint o
#  trecho entre "$dbConn = $null" e o "finally" e roda cenários com asserções.
#  Uso: pwsh -File job/tests/Test-Pipeline.ps1   (sai com 1 se algum cenário falhar)
# ==============================================================================
$root = Split-Path -Parent $PSScriptRoot
$src  = Get-Content -Raw (Join-Path $root 'Invoke-SaasAssessment.ps1')
$a = $src.IndexOf("`$dbConn = `$null`n`$sitesColetados"); $b = $src.IndexOf("finally {`n    if (`$null -ne `$dbConn)")
if ($a -lt 0 -or $b -lt 0) { throw 'Marcadores do pipeline não encontrados no entrypoint.' }
$pipeline = $src.Substring($a, $b - $a)
$mocks = Get-Content -Raw (Join-Path $PSScriptRoot 'pipeline.mocks.ps1')

$all = @{ process_licensing_info=$true; process_adoption_info=$true; process_mailbox_info=$true; process_intune_info=$true; process_sites_info=$true; process_owner_status=$true; process_sites=$true; process_subsites=$true; process_recycle_bin=$true; diagnostic_only=$false }
$cases = @(
    @{ name='permissões parciais (Intune sem permissão)'; scenario='ok';        diag=$false; final='partial'; expect=@{ licensing='ok'; intune='skipped'; sites='ok'; files='ok'; trash='ok' } }
    @{ name='arquivos falham';                            scenario='filesfail'; diag=$false; final='partial'; expect=@{ sites='ok'; files='failed'; trash='ok' } }
    @{ name='SharePoint indisponível';                    scenario='spofail';   diag=$false; final='partial'; expect=@{ licensing='ok'; sites='skipped'; files='skipped' } }
    @{ name='nenhum site retornado';                      scenario='nosites';   diag=$false; final='partial'; expect=@{ sites='failed'; files='skipped'; trash='skipped' } }
    @{ name='diagnóstico';                                scenario='ok';        diag=$true;  final='completed'; expect=@{} }
)
$fail = 0
foreach ($c in $cases) {
    $p = $all.Clone(); $p.diagnostic_only = $c.diag
    $script = "Set-StrictMode -Version 3.0`n`$ErrorActionPreference='Stop'`n`$global:SCENARIO='$($c.scenario)'`n" + $mocks + "`n" + $pipeline +
        "`n@{ final = `$finalStatus; workloads = @{} + (`$workloads.Keys | ForEach-Object -Begin { `$h=@{} } -Process { `$h[`$_] = `$workloads[`$_].status } -End { `$h }) } | ConvertTo-Json -Compress"
    $global:params = $p
    $out = & ([scriptblock]::Create($script)) 6>$null | Select-Object -Last 1 | ConvertFrom-Json -AsHashtable
    $errs = @()
    if ($out.final -ne $c.final) { $errs += "final=$($out.final) (esperado $($c.final))" }
    foreach ($k in $c.expect.Keys) { if ($out.workloads[$k] -ne $c.expect[$k]) { $errs += "$k=$($out.workloads[$k]) (esperado $($c.expect[$k]))" } }
    if ($errs) { $fail++; Write-Host "FALHOU  $($c.name): $($errs -join '; ')" -ForegroundColor Red } else { Write-Host "ok      $($c.name)" -ForegroundColor Green }
}
exit [int]($fail -gt 0)
