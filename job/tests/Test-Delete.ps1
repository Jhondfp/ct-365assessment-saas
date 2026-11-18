# ==============================================================================
#  Exclusão de coleta (Invoke-SaasDelete.ps1) com banco simulado: apaga em lotes
#  todas as tabelas da coleta, pula tabela inexistente, execution_history por
#  último, e reporta o total ao portal; falha vira status failed.
#  Uso: pwsh -File job/tests/Test-Delete.ps1   (sai com 1 se algo falhar)
# ==============================================================================
$root = Split-Path -Parent $PSScriptRoot
$fail = 0
function Check([string]$Name, [bool]$Ok, [string]$Got) { if ($Ok) { Write-Host "ok      $Name" -ForegroundColor Green } else { $script:fail++; Write-Host "FALHOU  $Name — $Got" -ForegroundColor Red } }
function global:Write-Log { param($Level, $Module, $Message, $SiteUrl, $Exception, $DbConnection) }
function global:Report-Step { param($StepName, $Status, $Progress, $Info) }
function global:New-DbConnection { param($MaxRetries) 'db' }
function global:Close-DbConnection { param($Connection) }
function global:Invoke-DbScalar { param($Query, $Connection, $Parameters) if ($Parameters['@t'] -eq 'dbo.meetings') { 0 } else { 1 } }
function global:Send-PortalEvent { param([hashtable]$Body) $global:SENT = $Body; $true }
Set-StrictMode -Version 3.0

function Run([string]$Target, [scriptblock]$NonQuery) {
    $global:ORDER = [System.Collections.Generic.List[string]]::new(); $global:SENT = $null
    Set-Item -Path function:global:Invoke-DbNonQuery -Value $NonQuery
    $global:params = @{ delete_execution = $Target }
    $global:auth = @{ database = 'cli' }
    $script:sync = [hashtable]::Synchronized(@{ Stop = $false }); $script:reporter = Start-ThreadJob { 1 }; $script:certTemp = $null
    . (Join-Path $root 'Invoke-SaasDelete.ps1') 6>$null
}

$global:LEFT = @{ files_info = 45000 }
Run 'exec-123456' { param($Query, $Connection, $Parameters, $TimeoutSeconds, $MaxRetries)
    $t = ([regex]::Match($Query, 'dbo\.(\w+)')).Groups[1].Value; $global:ORDER.Add($t)
    if ($Parameters['@e'] -ne 'exec-123456') { throw 'execution_id errado' }
    if (-not $global:LEFT.ContainsKey($t)) { $global:LEFT[$t] = 3 }
    $n = [math]::Min(20000, $global:LEFT[$t]); $global:LEFT[$t] -= $n; $n }
Check 'apaga files_info em lotes de 20 mil (3 comandos para 45 mil)' (@($global:ORDER | Where-Object { $_ -eq 'files_info' }).Count -eq 3) "$(@($global:ORDER | Where-Object { $_ -eq 'files_info' }).Count)"
Check 'pula tabela que não existe (meetings)' ($global:ORDER -notcontains 'meetings') ($global:ORDER -join ',')
Check 'execution_history por último' ($global:ORDER[$global:ORDER.Count - 1] -eq 'execution_history') $global:ORDER[$global:ORDER.Count - 1]
Check 'reporta concluído com o total de linhas' ($global:SENT.status -eq 'completed' -and $global:SENT.result.linhas -eq (45000 + 3 * 21)) "status=$($global:SENT.status) linhas=$($global:SENT.result.linhas)"

Run 'exec-123456' { param($Query, $Connection, $Parameters, $TimeoutSeconds, $MaxRetries) if ($Query -like '*files_info*') { throw 'Timeout expired' }; 0 }
Check 'falha no meio vira status failed com o erro' ($global:SENT.status -eq 'failed' -and $global:SENT.error -like '*Timeout*') "status=$($global:SENT.status)"

Run "x'; DROP TABLE y--" { param($Query, $Connection, $Parameters, $TimeoutSeconds, $MaxRetries) $global:ORDER.Add('chamou'); 0 }
Check 'identificador inválido é recusado sem tocar no banco' ($global:SENT.status -eq 'failed' -and $global:ORDER.Count -eq 0) "status=$($global:SENT.status) chamadas=$($global:ORDER.Count)"

exit [int]($fail -gt 0)
