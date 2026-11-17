# Simulações (Graph, PnP, banco e módulos do coletor) para testar o pipeline do Invoke-SaasAssessment.ps1
# sem tenant real. Usado por Test-Pipeline.ps1.

$global:auth = @{ client_id='c'; tenant_id='t'; spo_tenant='bioma'; client_secret=''; auth_mode='cert'; server='s'; database='d' }
$global:base64Cert = 'x'
$global:executionId = 'e1'
$config = [pscustomobject]@{ clientName='Bioma'; attempt=1 }
function Write-Log { param($Level,$Module,$Message,$Exception,$DbConnection,$SiteUrl) Write-Host "[$Level] [$Module] $Message $Exception" }
function Send-PortalEvent { param([hashtable]$Body) $global:LAST = $Body; return $true }
function Get-GraphToken { 'tok' }
function Invoke-GraphRequest { param($Uri,$Method,$Body,[switch]$All,$MaxRetries)
  if ($Uri -like '*organization*') { return [pscustomobject]@{ value=@([pscustomobject]@{displayName='Bioma Genetics'}) } }
  if ($Uri -match 'servicePrincipals\?') { return [pscustomobject]@{ value=@([pscustomobject]@{id='sp1'}) } }
  if ($Uri -match 'appRoleAssignments') { return @{ value=@([pscustomobject]@{resourceId='g'; appRoleId='r1'},[pscustomobject]@{resourceId='g'; appRoleId='r2'},[pscustomobject]@{resourceId='s'; appRoleId='r3'}) } }
  if ($Uri -match 'servicePrincipals/g\?') { return [pscustomobject]@{ appId='00000003-0000-0000-c000-000000000000'; appRoles=@([pscustomobject]@{id='r1';value='Directory.Read.All'},[pscustomobject]@{id='r2';value='Reports.Read.All'}) } }
  if ($Uri -match 'servicePrincipals/s\?') { return [pscustomobject]@{ appId='00000003-0000-0ff1-ce00-000000000000'; appRoles=@([pscustomobject]@{id='r3';value='Sites.FullControl.All'}) } }
  throw "uri inesperada $Uri" }
function Connect-SPOAdminCenter { param($TenantName,$ClientId,$CertBase64,$ClientSecret,$Tenant) if ($global:SCENARIO -eq 'spofail') { return $null } 'ctx' }
function Get-PnPTenant { param($Connection,$ErrorAction) 'tenant' }
function New-DbConnection { param($MaxRetries) 'db' }
function Invoke-DbReader { param($Connection,$Query,$Parameters) return ,@() }
function Invoke-DbNonQuery { }
function Start-ExecutionHistory { param($Connection) }
function Complete-ExecutionHistory { param($Status,$Connection,$TotalSites) Write-Host "history=$Status sites=$TotalSites" }
function Invoke-DashboardRefresh { param($Connection) $true }
function Test-ModuleCompleted { $false }
function Complete-ModuleProgress { }
function Clear-ExecutionModuleData { }
function Get-LicensingData { param($Connection) $true }
function Get-ActivityInfo { param($Connection) $true }
function Get-MailboxInfo { param($Connection) $true }
function Get-IntuneInfo { param($Connection) $true }
function Get-SitesInfo { param($Connection) if ($global:SCENARIO -eq 'nosites') { return @() } @([pscustomobject]@{Url='u1'},[pscustomobject]@{Url='u2'}) }
function Get-OwnerStatus { param($Connection) $true }
function Get-DataFiles { param($Sites,$Connection) if ($global:SCENARIO -eq 'filesfail') { throw 'Attempted to perform an unauthorized operation.' } }
function Get-TrashItems { param($Sites,$Connection) }
