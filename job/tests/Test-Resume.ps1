# ==============================================================================
#  Retomada: limpeza só dos sites com linhas parciais, falha de limpeza vira
#  deduplicação no fim, e criação idempotente dos índices. Banco simulado.
#  Uso: pwsh -File job/tests/Test-Resume.ps1   (sai com 1 se algo falhar)
# ==============================================================================
$root = Split-Path -Parent $PSScriptRoot
$fail = 0
function Check([string]$Name, [bool]$Ok, [string]$Got) { if ($Ok) { Write-Host "ok      $Name" -ForegroundColor Green } else { $script:fail++; Write-Host "FALHOU  $Name — $Got" -ForegroundColor Red } }
. (Join-Path $root 'src\connection\Repository.ps1')
function global:Write-Log { param($Level, $Module, $Message, $SiteUrl, $Exception, $DbConnection) }
Set-StrictMode -Version 3.0
$global:executionId = 'exec-1'

$global:Q = [System.Collections.Generic.List[string]]::new()
function global:Invoke-DbReader { param($Query, $Connection, $Parameters, $TimeoutSeconds) $global:Q.Add("R|$Query"); return , @([pscustomobject]@{ site_url = 'https://t/sites/a' }, [pscustomobject]@{ site_url = 'https://t/sites/b' }, [pscustomobject]@{ site_url = 'https://t/sites/zz-concluido' }) }
function global:Invoke-DbNonQuery { param($Query, $Connection, $Parameters, $TimeoutSeconds, $MaxRetries)
    $u = if ($Parameters) { $Parameters["@url"] } else { "" }; $global:Q.Add("N|$u|$Query")
    if ($Query -like 'DELETE TOP (@batch)*' -and $u -eq "https://t/sites/b") { throw 'Timeout expired' }
    0
}
$sites = @([pscustomobject]@{ Url = 'https://t/sites/a' }, [pscustomobject]@{ Url = 'https://t/sites/b' }, [pscustomobject]@{ Url = 'https://t/sites/c' })
$failed = Clear-PartialSiteData -Connection 'db' -TableName 'dbo.files_info' -Sites $sites 6>$null
$deletes = @($global:Q | Where-Object { $_ -like 'N|*DELETE TOP (@batch)*' } | ForEach-Object { ($_ -split '\|')[1] } | Sort-Object -Unique)
Check 'limpa só sites com linhas e que vão ser processados (a, b; não c nem o concluído)' (($deletes -join ',') -eq 'https://t/sites/a,https://t/sites/b') ($deletes -join ',')
Check 'falha de limpeza devolvida para deduplicar no fim' (@($failed).Count -eq 1 -and $failed[0] -eq 'https://t/sites/b') (@($failed) -join ',')

$global:Q.Clear()
Remove-DuplicateSiteRows -Connection 'db' -TableName 'dbo.files_info' -SiteUrls @('https://t/sites/b') -KeyExpr 'COALESCE(file_id, relative_url)' 6>$null
Check 'deduplicação mantém a gravação mais nova por arquivo' (@($global:Q | Where-Object { $_ -like '*ROW_NUMBER() OVER (PARTITION BY COALESCE(file_id, relative_url) ORDER BY id DESC)*https://t/sites/b*' -or $_ -like 'N|https://t/sites/b|*ROW_NUMBER*' }).Count -ge 1) ($global:Q -join ' ; ')

$global:IDX = @{ 'IX_files_exec_site' = 1 }
function global:Invoke-DbScalar { param($Query, $Connection, $Parameters) if ($global:IDX.ContainsKey($Parameters['@n'])) { 1 } else { 0 } }
$global:Q.Clear()
Initialize-CollectorIndexes -Connection 'db' 6>$null
$creates = @($global:Q | Where-Object { $_ -like '*CREATE NONCLUSTERED INDEX*' })
Check 'índice: cria só o que falta (trash), ONLINE primeiro' ($creates.Count -eq 1 -and $creates[0] -like '*IX_trash_exec_site*ONLINE = ON*') ($creates -join ' ; ')

exit [int]($fail -gt 0)
