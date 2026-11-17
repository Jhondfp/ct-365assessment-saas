# ==============================================================================
#  Teste do job/hygiene/Invoke-VersionCleanup.ps1 com SharePoint e banco simulados
#  (StrictMode). Confere contas da simulação, exclusões reais, lixeira, proteção
#  por retenção, modo JobSharePoint e confirmação.
#  Uso: pwsh -File job/tests/Test-VersionCleanup.ps1   (sai com 1 se algo falhar)
# ==============================================================================
$script = Join-Path (Split-Path -Parent $PSScriptRoot) 'hygiene\Invoke-VersionCleanup.ps1'
$fail = 0
function Check([string]$Name, [bool]$Ok, [string]$Got) {
    if ($Ok) { Write-Host "ok      $Name" -ForegroundColor Green } else { $script:fail++; Write-Host "FALHOU  $Name — $Got" -ForegroundColor Red }
}

function Reset-Mocks {
    $global:auth = @{ client_id = 'c'; tenant_id = 't'; client_secret = ''; auth_mode = 'cert'; connection = 'sql' }
    $global:base64Cert = 'x'
    $global:CALLS = [System.Collections.Generic.List[string]]::new()
    $global:ITEMS = [System.Collections.Generic.List[object]]::new()
    $global:RUN = $null
    # site A: 150 versões históricas (deve apagar 51 mantendo 100 no total); 50 versões (sem excesso); arquivo com retenção na 1ª versão
    # site B: 120 versões (apaga 21)
    $global:FILES = @{
        '/sites/a/Docs/grande.docx' = 150; '/sites/a/Docs/pequeno.docx' = 50; '/sites/a/Docs/retido.docx' = 101; '/sites/b/Docs/x.xlsx' = 120
    }
}
function global:Write-Log { param($Level, $Module, $Message, $SiteUrl, $Exception, $DbConnection) }
function global:New-DbConnection { param($MaxRetries) 'db' }
function global:Close-DbConnection { param($Connection) }
function global:Invoke-DbScalar { param($Query, $Connection, $Parameters) if ($Query -match 'hygiene_runs') { 1 } elseif ($Query -match 'execution_history') { 'exec-1' } }
function global:Invoke-DbReader { param($Query, $Connection, $Parameters, $TimeoutSeconds)
    $rows = @(
        [pscustomobject]@{ site_url = 'https://t.sharepoint.com/sites/a'; relative_url = '/sites/a/Docs/grande.docx'; file_url = 'https://t.sharepoint.com/sites/a/Docs/grande.docx'; file_name = 'grande.docx'; versions_count = 151; file_size = 1000 }
        [pscustomobject]@{ site_url = 'https://t.sharepoint.com/sites/a'; relative_url = '/sites/a/Docs/pequeno.docx'; file_url = 'https://t.sharepoint.com/sites/a/Docs/pequeno.docx'; file_name = 'pequeno.docx'; versions_count = 180; file_size = 1000 }
        [pscustomobject]@{ site_url = 'https://t.sharepoint.com/sites/a'; relative_url = '/sites/a/Docs/retido.docx'; file_url = 'https://t.sharepoint.com/sites/a/Docs/retido.docx'; file_name = 'retido.docx'; versions_count = 102; file_size = 1000 }
        [pscustomobject]@{ site_url = 'https://t.sharepoint.com/sites/b'; relative_url = '/sites/b/Docs/x.xlsx'; file_url = 'https://t.sharepoint.com/sites/b/Docs/x.xlsx'; file_name = 'x.xlsx'; versions_count = 121; file_size = 1000 }
    )
    if ($Parameters.ContainsKey('@s')) { $rows = @($rows | Where-Object { $_.site_url -eq $Parameters['@s'] }) }
    return , $rows
}
function global:Invoke-DbNonQuery { param($Query, $Connection, $Parameters, $TimeoutSeconds, $MaxRetries)
    if ($Query -match 'INSERT INTO dbo.hygiene_version_items') { $global:ITEMS.Add([pscustomobject]$Parameters) }
    if ($Query -match 'UPDATE dbo.hygiene_runs') { $global:RUN = $Parameters }
    1
}
function global:Connect-SPOSite { param($SiteUrl, $ClientId, $CertBase64, $ClientSecret, $Tenant) "ctx:$SiteUrl" }
function global:Disconnect-SPOConnection { param($Connection) }
function global:Get-PnPFileVersion { param($Url, $Connection)
    $n = $global:FILES[$Url]
    1..$n | ForEach-Object { [pscustomobject]@{ ID = $_; VersionLabel = "$_.0"; Created = (Get-Date '2020-01-01').AddDays($_); Size = 10 } }
}
function global:Remove-PnPFileVersion { param($Url, $Identity, [switch]$Recycle, [switch]$Force, $Connection)
    if ($Url -like '*retido*' -and $Identity -eq 1) { throw 'This item cannot be deleted because it is on hold or retention policy.' }
    $global:CALLS.Add("remove|$Url|$Identity|recycle=$([bool]$Recycle)")
}
function global:New-PnPSiteFileVersionBatchDeleteJob { param($MajorVersionLimit, $MajorWithMinorVersionsLimit, [switch]$Force, $Connection) $global:CALLS.Add("batch|$Connection|$MajorVersionLimit") }
function global:Get-PnPSiteFileVersionBatchDeleteJobStatus { param($Connection) [pscustomobject]@{ Status = 'InProgress' } }

Set-StrictMode -Version 3.0

# 1) Simulação: conta exata, nada apagado
Reset-Mocks
$s = & $script -ManterVersoes 100 -Acao Simular 6>$null
$g = $global:ITEMS | Where-Object { $_.'@f' -like '*grande*' }
Check 'simulação: grande.docx apagaria 51 versões (150 históricas, mantém 99 + atual)' ($g.'@d' -eq 51 -and $g.'@y' -eq 510 -and $g.'@st' -eq 'simulado') "d=$($g.'@d') y=$($g.'@y') st=$($g.'@st')"
$p = $global:ITEMS | Where-Object { $_.'@f' -like '*pequeno*' }
Check 'simulação: pequeno.docx sem excesso (rótulo 180, mas só 50 versões reais)' ($p.'@st' -eq 'sem_excesso') "st=$($p.'@st')"
Check 'simulação: nenhuma exclusão no SharePoint' ($global:CALLS.Count -eq 0) "$($global:CALLS.Count) chamadas"
Check 'simulação: resumo (51+2+21 versões, 3 arquivos)' ($s.versoes -eq 74 -and $s.arquivos_alterados -eq 3 -and $s.status -eq 'completed') "versoes=$($s.versoes) alterados=$($s.arquivos_alterados) status=$($s.status)"

# 2) Execução por arquivo (lixeira), com retenção bloqueando uma versão
Reset-Mocks
$s = & $script -ManterVersoes 100 -Acao Executar -Confirm:$false 6>$null
$removes = @($global:CALLS | Where-Object { $_ -like 'remove|*' })
Check 'execução: 73 versões removidas (74 menos a retida)' ($removes.Count -eq 73) "$($removes.Count) remoções"
Check 'execução: vai para a lixeira por padrão' (@($removes | Where-Object { $_ -notlike '*recycle=True' }).Count -eq 0) ($removes | Select-Object -First 1)
Check 'execução: apaga as mais antigas (IDs 1..51 do grande.docx)' (@($removes | Where-Object { $_ -like '*grande*' } | ForEach-Object { [int]($_ -split '\|')[2] } | Where-Object { $_ -gt 51 }).Count -eq 0) 'apagou versão recente'
$r = $global:ITEMS | Where-Object { $_.'@f' -like '*retido*' }
Check 'execução: arquivo com retenção marcado como erro parcial, sem derrubar o resto' ($r.'@st' -eq 'erro' -and $r.'@d' -eq 1 -and $s.status -eq 'partial') "st=$($r.'@st') d=$($r.'@d') status=$($s.status)"

# 3) Sem lixeira
Reset-Mocks
$null = & $script -ManterVersoes 100 -Acao Executar -SemLixeira -Confirm:$false 6>$null
Check '-SemLixeira: exclusão permanente' (@($global:CALLS | Where-Object { $_ -like '*recycle=True' }).Count -eq 0 -and $global:CALLS.Count -gt 0) ($global:CALLS | Select-Object -First 1)

# 4) Modo JobSharePoint: um job por site, nenhuma exclusão por arquivo
Reset-Mocks
$null = & $script -ManterVersoes 100 -Acao Executar -Modo JobSharePoint -Confirm:$false 6>$null
Check 'JobSharePoint: 2 jobs enfileirados (sites a e b), sem exclusão por arquivo' (@($global:CALLS | Where-Object { $_ -like 'batch|*' }).Count -eq 2 -and @($global:CALLS | Where-Object { $_ -like 'remove|*' }).Count -eq 0) ($global:CALLS -join ', ')

# 5) Execução sem confirmação (-WhatIf): nada apagado
Reset-Mocks
$null = & $script -ManterVersoes 100 -Acao Executar -WhatIf 6>$null
Check '-WhatIf: nada apagado' ($global:CALLS.Count -eq 0) "$($global:CALLS.Count) chamadas"

# 6) Filtro por site
Reset-Mocks
$s = & $script -ManterVersoes 100 -SiteUrl 'https://t.sharepoint.com/sites/b' 6>$null
Check 'filtro de site: só o site b' ($s.sites -eq 1 -and $s.versoes -eq 21) "sites=$($s.sites) versoes=$($s.versoes)"

# 7) Fluxo do worker (Invoke-SaasHygiene.ps1): simulação de ponta a ponta, progresso e resultado ao portal
Reset-Mocks
$global:STEPS = [System.Collections.Generic.List[string]]::new()
$global:SENT = $null
function global:Get-GraphToken { 'tok' }
function global:Report-Step { param($StepName, $Status, $Progress, $Info) $global:STEPS.Add("$Progress|$Info") }
function global:Send-PortalEvent { param([hashtable]$Body) $global:SENT = $Body; $true }
$projectRoot = Split-Path -Parent $PSScriptRoot
$global:executionId = 'run-portal-1'
$global:params = @{ hygiene = @{ action = 'version_cleanup'; keep = 100; dryRun = $true; recycle = $true; mode = 'PorArquivo'; sites = @() } }
$sync = [hashtable]::Synchronized(@{ Stop = $false }); $reporter = Start-ThreadJob { 1 }; $certTemp = $null
$logDir = Join-Path ([IO.Path]::GetTempPath()) "hyg-$([guid]::NewGuid())"; New-Item -ItemType Directory $logDir | Out-Null
$CallbackUrl = 'http://localhost:9/x'; $headers = @{}
. (Join-Path $projectRoot 'Invoke-SaasHygiene.ps1') 6>$null
Check 'worker: resultado enviado ao portal (completed, 74 versões, run_id = id da execução)' ($global:SENT.status -eq 'completed' -and $global:SENT.result.versoes -eq 74 -and $global:SENT.result.run_id -eq 'run-portal-1') ("status=$($global:SENT.status) versoes=$($global:SENT.result.versoes) run=$($global:SENT.result.run_id)")
Check 'worker: progresso por site reportado' ($global:STEPS.Count -ge 3 -and ($global:STEPS -join ' ') -match '2 de 2 sites') ($global:STEPS -join ' ; ')
Check 'worker: simulação não apaga nada' ($global:CALLS.Count -eq 0) "$($global:CALLS.Count) chamadas"

exit [int]($fail -gt 0)
