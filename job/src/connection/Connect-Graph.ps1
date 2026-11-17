# ==============================================================================
# MODULO GENERICO DE AUTENTICACAO MICROSOFT (Graph + SharePoint)
# ------------------------------------------------------------------------------
# Funcoes:
#   - Get-GraphToken         : token via Client Secret OU Certificado (PFX)
#   - Get-SharePointToken    : token para SharePoint resource (caso necessario)
#   - Invoke-GraphRequest    : helper para chamadas REST com retry/paginacao
#   - Test-GraphTokenValid   : valida token em cache antes de reutilizar
# ==============================================================================

$script:TokenCache = @{}

# ------------------------------------------------------------------------------
# Obtem token do Microsoft Graph (App-Only)
# Suporta dois modos:
#   - auth_mode = "secret"  : usa client_secret
#   - auth_mode = "cert"    : usa certificado PFX (Client Assertion JWT)
# Retorna a string do access_token e cacheia ate proxima expiracao.
# ------------------------------------------------------------------------------
function Get-GraphToken {
    param(
        [Parameter(Mandatory=$false)] [string] $Resource = 'https://graph.microsoft.com/.default'
    )

    if (-not (Test-Path Variable:Global:auth) -or $null -eq $global:auth) {
        throw "Configuracao global:auth nao carregada. Chame src/main.ps1 ou carregue auth.json antes."
    }

    $cacheKey = "$($global:auth.tenant_id)|$Resource"
    if ($script:TokenCache.ContainsKey($cacheKey)) {
        $cached = $script:TokenCache[$cacheKey]
        if ($cached.expires_at -gt (Get-Date).AddMinutes(2)) {
            return $cached.access_token
        }
    }

    # Trim: espaco colado no tenant_id do auth.json entra na URL e no "aud"
    # do JWT, e o Entra rejeita com AADSTS700023 (401) - dificil de enxergar.
    $tenantId = "$($global:auth.tenant_id)".Trim()
    $clientId = "$($global:auth.client_id)".Trim()
    $authMode = if ($global:auth.auth_mode) { $global:auth.auth_mode.ToLower() } else { 'secret' }

    # URL CORRIGIDA - usa o endpoint oficial Microsoft Identity Platform
    $tokenEndpoint = "https://login.microsoftonline.com/$tenantId/oauth2/v2.0/token"

    $body = @{
        client_id  = $clientId
        scope      = $Resource
        grant_type = 'client_credentials'
    }

    if ($authMode -eq 'cert') {
        $certPath = if ($global:auth.cert_path) { $global:auth.cert_path } else { '.\src\misc\cert.pfx' }
        if (-not (Test-Path $certPath)) {
            throw "Modo cert escolhido mas certificado nao encontrado em: $certPath"
        }

        $certPassword = if ([string]::IsNullOrEmpty($global:auth.cert_password)) {
            New-Object System.Security.SecureString
        } else {
            ConvertTo-SecureString $global:auth.cert_password -AsPlainText -Force
        }
        $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2(
            $certPath, $certPassword,
            [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet)

        $clientAssertion = New-ClientAssertionJwt -Cert $cert -ClientId $clientId -Audience $tokenEndpoint
        $body.client_assertion      = $clientAssertion
        $body.client_assertion_type = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'
    } else {
        if ([string]::IsNullOrEmpty($global:auth.client_secret)) {
            throw "auth.json: client_secret vazio em modo 'secret'."
        }
        $body.client_secret = $global:auth.client_secret
    }

    try {
        $resp = Invoke-RestMethod -Uri $tokenEndpoint -Method Post -Body $body -ContentType 'application/x-www-form-urlencoded' -ErrorAction Stop
        $script:TokenCache[$cacheKey] = @{
            access_token = $resp.access_token
            expires_at   = (Get-Date).AddSeconds([int]$resp.expires_in)
        }
        return $resp.access_token
    }
    catch {
        # O motivo real (AADSTSxxxx) vem no corpo da resposta, nao na Exception.
        $detail = ''
        try {
            if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
                $err = $_.ErrorDetails.Message | ConvertFrom-Json
                $detail = " | $($err.error): $(($err.error_description -split "`r?`n")[0])"
            }
        } catch {}
        throw "Falha ao obter token Microsoft Graph: $($_.Exception.Message)$detail"
    }
}

# ------------------------------------------------------------------------------
# Monta JWT (RS256) para autenticacao por certificado
# ------------------------------------------------------------------------------
function New-ClientAssertionJwt {
    param(
        [Parameter(Mandatory)] [System.Security.Cryptography.X509Certificates.X509Certificate2] $Cert,
        [Parameter(Mandatory)] [string] $ClientId,
        [Parameter(Mandatory)] [string] $Audience
    )

    $now    = [DateTimeOffset]::UtcNow
    $expiry = $now.AddMinutes(10)

    $header = [ordered]@{
        alg = 'RS256'
        typ = 'JWT'
        x5t = ([Convert]::ToBase64String($Cert.GetCertHash()) -replace '\+','-' -replace '/','_' -replace '=','')
    }
    $payload = [ordered]@{
        aud = $Audience
        exp = $expiry.ToUnixTimeSeconds()
        iss = $ClientId
        jti = [Guid]::NewGuid().ToString()
        nbf = $now.ToUnixTimeSeconds()
        sub = $ClientId
    }

    $headerJson  = $header  | ConvertTo-Json -Compress
    $payloadJson = $payload | ConvertTo-Json -Compress

    $encodedHeader  = ([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($headerJson))  -replace '\+','-' -replace '/','_' -replace '=','')
    $encodedPayload = ([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($payloadJson)) -replace '\+','-' -replace '/','_' -replace '=','')
    $stringToSign   = "$encodedHeader.$encodedPayload"

    $rsa = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($Cert)
    if ($null -eq $rsa) {
        throw "Nao foi possivel extrair a chave privada do certificado PFX."
    }
    $signature = $rsa.SignData(
        [Text.Encoding]::UTF8.GetBytes($stringToSign),
        [Security.Cryptography.HashAlgorithmName]::SHA256,
        [Security.Cryptography.RSASignaturePadding]::Pkcs1)
    $encodedSignature = ([Convert]::ToBase64String($signature) -replace '\+','-' -replace '/','_' -replace '=','')

    return "$stringToSign.$encodedSignature"
}

# ------------------------------------------------------------------------------
# Realiza chamada REST ao Graph com retry exponencial, paginacao automatica
# e tratamento de 429 (throttling).
# ------------------------------------------------------------------------------
function Invoke-GraphRequest {
    param(
        [Parameter(Mandatory)] [string] $Uri,
        [Parameter(Mandatory=$false)] [string] $Method  = 'GET',
        [Parameter(Mandatory=$false)] $Body            = $null,
        [Parameter(Mandatory=$false)] [switch] $All,        # paginacao completa @odata.nextLink
        [Parameter(Mandatory=$false)] [int] $MaxRetries = 5
    )

    $token   = Get-GraphToken
    $headers = @{
        Authorization  = "Bearer $token"
        'Content-Type' = 'application/json'
    }

    if (-not $All) {
        return _Invoke-GraphCall -Uri $Uri -Method $Method -Body $Body -Headers $headers -MaxRetries $MaxRetries
    }

    # Modo paginacao: percorre todos os @odata.nextLink
    $allItems = New-Object System.Collections.Generic.List[object]
    $next = $Uri
    while (-not [string]::IsNullOrEmpty($next)) {
        $page = _Invoke-GraphCall -Uri $next -Method $Method -Body $Body -Headers $headers -MaxRetries $MaxRetries
        if ($null -ne $page.value) {
            foreach ($v in $page.value) { $allItems.Add($v) }
        }
        $next = if ($page.PSObject.Properties['@odata.nextLink']) { $page.'@odata.nextLink' } else { $null }
    }
    return @{ value = $allItems.ToArray() }
}

function _Invoke-GraphCall {
    param($Uri, $Method, $Body, $Headers, $MaxRetries)

    $attempt = 0
    while ($true) {
        $attempt++
        try {
            $params = @{
                Uri     = $Uri
                Method  = $Method
                Headers = $Headers
                ErrorAction = 'Stop'
            }
            if ($null -ne $Body) { $params.Body = if ($Body -is [string]) { $Body } else { $Body | ConvertTo-Json -Depth 10 } }
            return Invoke-RestMethod @params
        }
        catch {
            $statusCode = 0
            try { $statusCode = [int]$_.Exception.Response.StatusCode } catch {}

            # 429 ou 5xx => retry com backoff
            if ($attempt -lt $MaxRetries -and ($statusCode -eq 429 -or ($statusCode -ge 500 -and $statusCode -le 599))) {
                # No PS7 Response e um HttpResponseMessage - Headers nao tem
                # indexador por string (Headers['Retry-After'] sempre vinha
                # vazio); o valor fica em Headers.RetryAfter (Delta ou Date).
                $retryAfter = 0
                try {
                    $ra = $_.Exception.Response.Headers.RetryAfter
                    if ($ra -and $ra.Delta)    { $retryAfter = [int][Math]::Ceiling($ra.Delta.TotalSeconds) }
                    elseif ($ra -and $ra.Date) { $retryAfter = [int][Math]::Ceiling(($ra.Date - [DateTimeOffset]::UtcNow).TotalSeconds) }
                } catch {}
                # 429 sem Retry-After (Intune devolve "RetryAfter": null): a
                # janela de throttling e de 20s+ - o backoff curto (1+2+4+8s)
                # esgotava as tentativas antes dela abrir. 10/20/40/80s + jitter.
                $delay = if ($retryAfter -gt 0) { $retryAfter * 1000 }
                         elseif ($statusCode -eq 429) { [Math]::Min(120000, 5000 * [Math]::Pow(2, $attempt)) + (Get-Random -Maximum 3000) }
                         else { [Math]::Min(60000, 500 * [Math]::Pow(2, $attempt)) }
                Start-Sleep -Milliseconds $delay
                continue
            }

            # Invoke-RestMethod so expoe "Response status code does not indicate
            # success: 400 (Bad Request)" por padrao - sem o corpo do erro, que
            # e onde o Graph manda o motivo de verdade (error.code/error.message).
            # $_.ErrorDetails.Message tem o corpo bruto da resposta no PS7+;
            # reempacota numa excecao nova com essa informacao, sem mudar o
            # comportamento de retry acima.
            $bodyMsg = $null
            try { if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $bodyMsg = $_.ErrorDetails.Message } } catch {}
            if ($bodyMsg) {
                throw (New-Object System.Exception("$($_.Exception.Message) | Corpo: $bodyMsg", $_.Exception))
            }
            throw
        }
    }
}
