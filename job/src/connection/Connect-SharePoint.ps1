# ==============================================================================
# MODULO GENERICO DE CONEXAO E COLETA SHAREPOINT ONLINE (PnP.PowerShell)
# ------------------------------------------------------------------------------
# Todas as conexoes retornam objeto -ReturnConnection, permitindo paralelismo.
# A funcao Disconnect-SPOConnection desconecta de verdade (Disconnect-PnPOnline).
#
# PROXY (opcional):
#   Configure em auth.json:
#     "proxy_url"      : "http://proxy.empresa.com:8080"  (vazio = sem proxy)
#     "proxy_username" : ""   (opcional, para proxy autenticado)
#     "proxy_password" : ""
#     "proxy_bypass"   : "localhost,*.local"  (opcional)
#   O proxy e aplicado automaticamente na primeira conexao de cada runspace.
#   Por atuar no nivel do processo .NET, tambem cobre chamadas ao Microsoft Graph.
# ==============================================================================

# Controla se o proxy ja foi aplicado neste runspace (cada runspace tem estado proprio)
$script:proxyApplied = $false

# ------------------------------------------------------------------------------
# Configura proxy .NET para este runspace/processo (idempotente)
# ------------------------------------------------------------------------------
function Set-SPOProxy {
    param(
        [Parameter(Mandatory)] [string] $ProxyUrl,
        [string] $Username  = '',
        [string] $Password  = '',
        [string] $BypassList = ''
    )

    try {
        $proxy = New-Object System.Net.WebProxy($ProxyUrl, $true)

        if (-not [string]::IsNullOrEmpty($Username)) {
            $proxy.Credentials = New-Object System.Net.NetworkCredential($Username, $Password)
        }

        if (-not [string]::IsNullOrEmpty($BypassList)) {
            $proxy.BypassList = @($BypassList -split ',\s*' | Where-Object { $_ })
        }

        # HttpWebRequest / chamadas legadas
        [System.Net.WebRequest]::DefaultWebProxy = $proxy

        # HttpClient / .NET 6+ (PnP v2, Invoke-RestMethod no PS7)
        $env:HTTPS_PROXY = $ProxyUrl
        $env:HTTP_PROXY  = $ProxyUrl
        if (-not [string]::IsNullOrEmpty($BypassList)) {
            $env:NO_PROXY = $BypassList
        }

        Write-Verbose "[SPO] Proxy configurado: $ProxyUrl"
    } catch {
        Write-Verbose "[SPO] Aviso: falha ao configurar proxy: $($_.Exception.Message)"
    }
}

function Clear-SPOProxy {
    [System.Net.WebRequest]::DefaultWebProxy = [System.Net.WebRequest]::GetSystemWebProxy()
    Remove-Item Env:HTTPS_PROXY -ErrorAction SilentlyContinue
    Remove-Item Env:HTTP_PROXY  -ErrorAction SilentlyContinue
    Remove-Item Env:NO_PROXY    -ErrorAction SilentlyContinue
    $script:proxyApplied = $false
    Write-Verbose '[SPO] Proxy removido.'
}

function Initialize-SPOProxy {
    if ($script:proxyApplied) { return }
    $script:proxyApplied = $true  # marca mesmo sem proxy, para nao re-checar

    $proxyUrl = if ($global:auth -and $global:auth.ContainsKey('proxy_url')) { $global:auth.proxy_url } else { $null }
    if ([string]::IsNullOrEmpty($proxyUrl)) { return }

    Set-SPOProxy `
        -ProxyUrl    $proxyUrl `
        -Username    ($global:auth.ContainsKey('proxy_username') ? $global:auth.proxy_username : '') `
        -Password    ($global:auth.ContainsKey('proxy_password') ? $global:auth.proxy_password : '') `
        -BypassList  ($global:auth.ContainsKey('proxy_bypass')   ? $global:auth.proxy_bypass   : '')
}

# ------------------------------------------------------------------------------
# Conecta ao SharePoint Admin Center
# ------------------------------------------------------------------------------
function Connect-SPOAdminCenter {
    param(
        [Parameter(Mandatory)] [string] $TenantName,
        [Parameter(Mandatory)] [string] $ClientId,
        [Parameter(Mandatory=$false)] [string] $CertBase64 = $null,
        [Parameter(Mandatory=$false)] [string] $Thumbprint = $null,
        [Parameter(Mandatory=$false)] [string] $ClientSecret = $null,
        [Parameter(Mandatory=$false)] [string] $Tenant = $null
    )
    # Extrair o nome curto do tenant (contoso de contoso.onmicrosoft.com ou contoso-admin.sharepoint.com)
    $tenantName  = if ($TenantName -like '*onmicrosoft.com') {
        ($TenantName -replace '\.onmicrosoft\.com','').Trim()
    } else {
        $TenantName.Trim()
    }

    $adminUrl = "https://$tenantName-admin.sharepoint.com"

    return Connect-SPOContext -Url $adminUrl -ClientId $ClientId `
        -CertBase64 $CertBase64 -Thumbprint $Thumbprint -ClientSecret $ClientSecret -Tenant $Tenant
}

# ------------------------------------------------------------------------------
# Conecta a um site especifico (URL completa)
# ------------------------------------------------------------------------------
function Connect-SPOSite {
    param(
        [Parameter(Mandatory)] [string] $SiteUrl,
        [Parameter(Mandatory)] [string] $ClientId,
        [Parameter(Mandatory=$false)] [string] $CertBase64 = $null,
        [Parameter(Mandatory=$false)] [string] $Thumbprint = $null,
        [Parameter(Mandatory=$false)] [string] $ClientSecret = $null,
        [Parameter(Mandatory=$false)] [string] $Tenant = $null
    )
    return Connect-SPOContext -Url $SiteUrl -ClientId $ClientId `
        -CertBase64 $CertBase64 -Thumbprint $Thumbprint -ClientSecret $ClientSecret -Tenant $Tenant
}

# ------------------------------------------------------------------------------
# Conexao generica reutilizada por SPOAdminCenter e SPOSite
# ------------------------------------------------------------------------------
function Connect-SPOContext {
    param(
        [Parameter(Mandatory)] [string] $Url,
        [Parameter(Mandatory)] [string] $ClientId,
        [string] $CertBase64,
        [string] $Thumbprint,
        [string] $ClientSecret,
        [string] $Tenant
    )

    # Proxy: aplica uma vez por runspace (lê auth.json automaticamente)
    Initialize-SPOProxy

    # Tenant e obrigatorio para App Registration (certificado ou client secret)
    # Trim: espaco no tenant_id do auth.json faz o MSAL montar uma authority
    # invalida ("The authority ... must be in a well-formed URI format").
    $tenantValue = if ($Tenant) { $Tenant.Trim() } `
                   elseif ($global:auth.tenant_id) { "$($global:auth.tenant_id)".Trim() } `
                   else { $null }
    $ClientId   = $ClientId.Trim()
    if ($Thumbprint) { $Thumbprint = $Thumbprint.Trim() }

    $tempCertPath = $null
    try {
        $params = @{
            Url              = $Url
            ClientId         = $ClientId
            ReturnConnection = $true
            ErrorAction      = 'Stop'
        }
        if ($Thumbprint) {
            # Certificado por thumbprint - Tenant obrigatorio para app-only
            if ($tenantValue) { $params.Tenant = $tenantValue }
            $params.Thumbprint = $Thumbprint
        } elseif ($CertBase64) {
            # Certificado PFX em base64 - Tenant obrigatorio para app-only
            if ($tenantValue) { $params.Tenant = $tenantValue }
            $certBytes = [Convert]::FromBase64String($CertBase64)
            $tempCertPath = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "cert_$([guid]::NewGuid()).pfx")
            [System.IO.File]::WriteAllBytes($tempCertPath, $certBytes)
            $params.CertificatePath = $tempCertPath
            $certPwd = if ($global:auth.cert_password -and -not [string]::IsNullOrEmpty($global:auth.cert_password)) {
                ConvertTo-SecureString $global:auth.cert_password -AsPlainText -Force
            } else { $null }
            if ($certPwd) { $params.CertificatePassword = $certPwd }
        } elseif ($ClientSecret) {
            $params.ClientSecret = $ClientSecret
        } else {
            throw "Necessario fornecer Thumbprint, CertBase64 ou ClientSecret."
        }

        # Retry curto para falhas transitorias: sob paralelismo alto, autenticacao
        # via certificado esbarra num bug conhecido do MSAL/PnP.PowerShell (lanca
        # "Nullable object must have a value" quando o token endpoint do Azure AD
        # aplica throttling) que nao reflete um problema real com o site/certificado
        # - o mesmo site conecta normalmente fora do pico de concorrencia. Confirmado
        # empiricamente: sites que falharam na coleta reconectaram sem erro quando
        # testados isoladamente.
        $maxAttempts = 3
        for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
            try {
                return Connect-PnPOnline @params
            } catch {
                if ($attempt -ge $maxAttempts) { throw }
                Start-Sleep -Milliseconds (800 * $attempt + (Get-Random -Minimum 0 -Maximum 400))
            }
        }
    }
    catch {
        # Write-Verbose e invisivel numa execucao nao-interativa (nao vai pro
        # console/arquivo/banco) - se a conexao falhar pra TODOS os sites (ex.
        # certificado, throttling, sessao expirada), o modulo chamador nao via
        # nada de errado e ainda assim declarava "SUCCESS" no final sem ter
        # processado nenhum site. Write-Log (se ja dot-sourced no runspace)
        # garante que a falha apareca no log de verdade.
        $exDetail = "$($_.Exception.GetType().FullName): $($_.Exception.Message)"
        $inner = $_.Exception.InnerException
        while ($inner) {
            $exDetail += " -> $($inner.GetType().FullName): $($inner.Message)"
            $inner = $inner.InnerException
        }
        if (Get-Command 'Write-Log' -ErrorAction SilentlyContinue) {
            Write-Log -Level ERROR -Module 'SPO' -Message "Falha ao conectar em $Url" -Exception $exDetail
        } else {
            Write-Verbose "[SPO] Falha ao conectar em $Url : $exDetail"
        }
        return $null
    }
    finally {
        if ($null -ne $tempCertPath) {
            Remove-Item $tempCertPath -Force -ErrorAction SilentlyContinue
        }
    }
}

# ------------------------------------------------------------------------------
# Desconecta com seguranca (versao corrigida)
# ------------------------------------------------------------------------------
function Disconnect-SPOConnection {
    param([Parameter(Mandatory=$false)] $Connection)
    if ($null -eq $Connection) { return }
    try {
        Disconnect-PnPOnline -Connection $Connection -ErrorAction SilentlyContinue
    } catch { }
}

# ------------------------------------------------------------------------------
# Helpers reutilizaveis
# ------------------------------------------------------------------------------
function Get-SPOSiteInfo {
    param([Parameter(Mandatory)] $AdminConnection, [Parameter(Mandatory)] [string] $SiteUrl)
    try { return Get-PnPTenantSite -Url $SiteUrl -Connection $AdminConnection -ErrorAction Stop }
    catch { return $null }
}

function Get-SPOWebProperties {
    param([Parameter(Mandatory)] $SiteConnection)
    try { return Get-PnPWeb -Connection $SiteConnection -ErrorAction Stop }
    catch { return $null }
}

function Get-SPOSubsites {
    param([Parameter(Mandatory)] $SiteConnection)
    try {
        $r = Get-PnPSubWeb -Connection $SiteConnection -Recurse -ErrorAction SilentlyContinue
        return @($r)
    } catch { return @() }
}

function Get-SPOLists {
    param([Parameter(Mandatory)] $SiteConnection, [int] $MinimumItemCount = 0)
    try {
        $r = Get-PnPList -Connection $SiteConnection -ErrorAction Stop |
             Where-Object { $_.ItemCount -gt $MinimumItemCount }
        return @($r)
    } catch { return @() }
}

function Get-SPOAdministrators {
    param([Parameter(Mandatory)] $SiteConnection)
    try {
        $admins = Get-PnPUser -Connection $SiteConnection -ErrorAction SilentlyContinue |
                  Where-Object { $_.IsSiteAdmin -eq $true } |
                  Select-Object -ExpandProperty Email
        return ($admins -join '; ')
    } catch { return $null }
}

function Get-SPOSharingSettings {
    param([Parameter(Mandatory)] [string] $SharingCapability)
    $sharingMap = @{
        'Disabled'                        = @{ Translated = 'Desativado'; Enabled = $false }
        'ExternalUserSharingOnly'         = @{ Translated = 'Somente usuarios externos (sem links anonimos)'; Enabled = $true }
        'ExternalUserAndGuestSharing'     = @{ Translated = 'Usuarios externos e convidados (links anonimos permitidos)'; Enabled = $true }
        'ExistingExternalUserSharingOnly' = @{ Translated = 'Somente usuarios externos existentes'; Enabled = $true }
    }
    if ($sharingMap.ContainsKey($SharingCapability)) { return $sharingMap[$SharingCapability] }
    return @{ Translated = "Desconhecido ($SharingCapability)"; Enabled = $false }
}

function Get-SPOSiteType {
    param([Parameter(Mandatory)] $Site)
    if ($Site.IsTeamsConnected -or $Site.IsTeamsChannelConnected) { return 'Teams Site' }
    return 'Communication'
}
