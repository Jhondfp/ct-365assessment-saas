# ==============================================================================
#  Levantamento Google Workspace (job/google) com APIs e banco simulados: assinatura
#  do JWT da conta de serviço, módulos isolados (escopo faltando derruba só o módulo),
#  dados gravados nas tabelas g_* e resultado reportado ao portal.
#  Uso: pwsh -File job/tests/Test-Google.ps1   (sai com 1 se algo falhar)
# ==============================================================================
$root = Split-Path -Parent $PSScriptRoot
$fail = 0
function Check([string]$Name, [bool]$Ok, [string]$Got) { if ($Ok) { Write-Host "ok      $Name" -ForegroundColor Green } else { $script:fail++; Write-Host "FALHOU  $Name — $Got" -ForegroundColor Red } }
Set-StrictMode -Version 3.0

# 1) JWT: assinatura RS256 verificável com a chave pública
. (Join-Path $root 'google\Google.ps1')
$rsa = [System.Security.Cryptography.RSA]::Create(2048)
$sa = @{ client_email = 'sa@proj.iam.gserviceaccount.com'; private_key = $rsa.ExportPkcs8PrivateKeyPem(); private_key_id = 'k1'; token_uri = 'https://oauth2.googleapis.com/token' }
$jwt = New-GoogleAssertion -ServiceAccount $sa -Subject 'admin@contoso.com' -Scopes @('https://www.googleapis.com/auth/admin.directory.user.readonly')
$parts = $jwt.Split('.')
$b64 = { param($s) $s = $s.Replace('-', '+').Replace('_', '/'); while ($s.Length % 4) { $s += '=' }; [Convert]::FromBase64String($s) }
$claims = [Text.Encoding]::UTF8.GetString((& $b64 $parts[1])) | ConvertFrom-Json
$valid = $rsa.VerifyData([Text.Encoding]::ASCII.GetBytes("$($parts[0]).$($parts[1])"), (& $b64 $parts[2]), [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
Check 'JWT assinado com a chave da conta de serviço (RS256) e em nome do administrador' ($valid -and $claims.sub -eq 'admin@contoso.com' -and $claims.iss -eq 'sa@proj.iam.gserviceaccount.com' -and ($claims.exp - $claims.iat) -eq 3600) "valid=$valid sub=$($claims.sub)"

# 2) Levantamento completo com APIs simuladas (licenças sem escopo)
function global:Write-Log { param($Level, $Module, $Message, $SiteUrl, $Exception, $DbConnection) }
function global:Report-Step { param($StepName, $Status, $Progress, $Info) }
function global:New-DbConnection { param($MaxRetries) 'db' }
function global:Close-DbConnection { param($Connection) }
function global:Start-ExecutionHistory { param($Connection) $global:HIST = 'start' }
function global:Complete-ExecutionHistory { param($Status, $Connection, $TotalSites) $global:HIST = "$Status/$TotalSites" }
function global:Invoke-DbReader { param($Query, $Connection, $Parameters) return , @() }
function global:Invoke-DbNonQuery { param($Query, $Connection, $Parameters, $TimeoutSeconds) $global:SQL.Add($Query); 1 }
function global:Invoke-DbBulkInsert { param($Connection, $DestinationTable, $DataTable) $global:BULK[$DestinationTable] = $DataTable.Rows.Count; $global:LAST[$DestinationTable] = $DataTable; $DataTable.Rows.Count }
function global:Send-PortalEvent { param([hashtable]$Body) $global:SENT = $Body; $true }

$users = @(
    [pscustomobject]@{ id = '1'; primaryEmail = 'ana@contoso.com'; name = [pscustomobject]@{ fullName = 'Ana' }; orgUnitPath = '/Vendas'; suspended = $false; isAdmin = $true; isEnrolledIn2Sv = $true; creationTime = '2020-01-01T00:00:00.000Z'; lastLoginTime = '2026-11-10T10:00:00.000Z'; aliases = @('a@contoso.com') }
    [pscustomobject]@{ id = '2'; primaryEmail = 'bia@contoso.com'; orgUnitPath = '/'; suspended = $true; lastLoginTime = '1970-01-01T00:00:00.000Z' }
)
$usage = @(
    [pscustomobject]@{ entity = [pscustomobject]@{ userEmail = 'ana@contoso.com' }; parameters = @([pscustomobject]@{ name = 'accounts:gmail_used_quota_in_mb'; intValue = '51200' }, [pscustomobject]@{ name = 'accounts:drive_used_quota_in_mb'; intValue = '2048' }, [pscustomobject]@{ name = 'drive:num_owned_items_with_visibility_shared_externally'; intValue = '7' }, [pscustomobject]@{ name = 'gmail:last_interaction_time'; datetimeValue = '2026-11-15T12:00:00.000Z' }) }
)
function Get-GoogleToken { param($Area) if ($Area -eq 'licensing') { throw 'unauthorized_client' }; 'tok' }
function Invoke-GoogleApi { param($Area, $Uri, $Items, [switch]$Single, $MaxPages)
    $global:CALLS.Add("$Area|$Uri")
    if ($Area -eq 'licensing') { throw 'Google API (licensing) respondeu 403' }
    if ($Uri -like '*/usage/users/all/dates/*') { if ($global:USAGE_EMPTY_FIRST -and -not $global:USAGE_SEEN) { $global:USAGE_SEEN = $true; return , @() }; return , $usage }
    if ($Uri -like '*/domains*') { return , @([pscustomobject]@{ domainName = 'contoso.com'; isPrimary = $true; verified = $true; domainAliases = @([pscustomobject]@{ domainAliasName = 'contoso.net'; verified = $true }) }) }
    if ($Uri -like '*/orgunits*') { return , @([pscustomobject]@{ orgUnitPath = '/Vendas'; name = 'Vendas'; parentOrgUnitPath = '/' }) }
    if ($Uri -like '*/users?*') { return , $users }
    if ($Uri -like '*/groups?*') { return , @([pscustomobject]@{ email = 'time@contoso.com'; name = 'Time'; directMembersCount = '12' }) }
    if ($Uri -like '*/resources/calendars*') { return , @([pscustomobject]@{ resourceEmail = 'sala1@contoso.com'; resourceName = 'Sala 1'; resourceCategory = 'CONFERENCE_ROOM'; capacity = 8 }) }
    return , @()
}
$global:CALLS = [System.Collections.Generic.List[string]]::new(); $global:SQL = [System.Collections.Generic.List[string]]::new(); $global:BULK = @{}; $global:LAST = @{}; $global:USAGE_EMPTY_FIRST = $true; $global:USAGE_SEEN = $false
$global:executionId = 'g-exec-1'
$global:auth = @{ platform = 'google'; google_admin = 'admin@contoso.com'; google_domain = 'contoso.com'; google_customer = 'my_customer'; server = 's'; database = 'd'; google_sa = $sa }
$global:params = @{ platform = 'google'; g_identity = $true; g_usage = $true; g_licensing = $true; g_resources = $true; g_devices = $false; diagnostic_only = $false }
$sync = [hashtable]::Synchronized(@{ Stop = $false }); $reporter = Start-ThreadJob { 1 }
$logDir = Join-Path ([IO.Path]::GetTempPath()) "g-$([guid]::NewGuid())"; New-Item -ItemType Directory $logDir | Out-Null
$CallbackUrl = 'http://127.0.0.1:9/x'; $headers = @{}
. (Join-Path $root 'google\Invoke-GoogleAssessment.ps1') 6>$null

$w = $global:SENT.workloads; if ($global:SENT.error) { Write-Host "erro: $($global:SENT.error)" }
Check 'identidades: usuários, grupos, unidades e domínios (com alias) gravados' ($global:BULK['dbo.g_users'] -eq 2 -and $global:BULK['dbo.g_groups'] -eq 1 -and $global:BULK['dbo.g_orgunits'] -eq 1 -and $global:BULK['dbo.g_domains'] -eq 2) (($global:BULK.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ' ')
$u2 = $global:LAST['dbo.g_users'].Rows[1]
Check 'último login "1970" vira nulo (nunca entrou) e suspenso registrado' ($u2['last_login'] -is [DBNull] -and $u2['suspended'] -eq $true) "login=$($u2['last_login']) susp=$($u2['suspended'])"
Check 'uso: procura a data mais recente com relatório e atualiza g_users' ($w.g_usage.status -eq 'ok' -and $global:BULK['#gu'] -eq 1 -and @($global:CALLS | Where-Object { $_ -like 'usage|*' }).Count -eq 2 -and ($global:SQL -join ' ') -match 'UPDATE u SET') "status=$($w.g_usage.status) chamadas=$(@($global:CALLS | Where-Object { $_ -like 'usage|*' }).Count)"
Check 'escopo de licenças sem delegação: só o módulo de licenças falha' ($w.g_licensing.status -eq 'failed' -and $w.g_identity.status -eq 'ok' -and $w.g_resources.status -eq 'ok' -and $global:SENT.status -eq 'partial') "lic=$($w.g_licensing.status) final=$($global:SENT.status)"
Check 'checagem prévia aponta o escopo faltando' ($global:SENT.preflight.permissions.detail -like '*apps.licensing*') $global:SENT.preflight.permissions.detail
Check 'histórico da execução fechado com o total de usuários' ($global:HIST -eq 'completed/2') $global:HIST
Check 'dispositivos não pedidos não aparecem' (-not $w.Contains('g_devices')) ($w.Keys -join ',')

exit [int]($fail -gt 0)
