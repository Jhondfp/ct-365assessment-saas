# ==============================================================================
#  CT Assessment 365 SaaS | Acesso às APIs do Google Workspace
# ------------------------------------------------------------------------------
#  Conta de serviço com delegação em todo o domínio: assina um JWT (RS256) com a
#  chave da conta, "em nome" do administrador do cliente, e troca por um token de
#  acesso. Um token por conjunto de escopos (um escopo não liberado derruba só o
#  módulo que precisa dele). Paginação por nextPageToken e novas tentativas em
#  429/5xx. Só leitura.
# ==============================================================================

$script:GScopes = @{
    identity  = @('https://www.googleapis.com/auth/admin.directory.user.readonly', 'https://www.googleapis.com/auth/admin.directory.group.readonly',
                  'https://www.googleapis.com/auth/admin.directory.orgunit.readonly', 'https://www.googleapis.com/auth/admin.directory.domain.readonly')
    usage     = @('https://www.googleapis.com/auth/admin.reports.usage.readonly')
    licensing = @('https://www.googleapis.com/auth/apps.licensing')
    resources = @('https://www.googleapis.com/auth/admin.directory.resource.calendar.readonly')
    devices   = @('https://www.googleapis.com/auth/admin.directory.device.mobile.readonly', 'https://www.googleapis.com/auth/admin.directory.device.chromeos.readonly')
}
$script:GTokens = @{}

function ConvertTo-Base64Url([byte[]]$Bytes) { [Convert]::ToBase64String($Bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_') }

# JWT da conta de serviço (assinado com a chave privada do JSON) para o fluxo jwt-bearer
function New-GoogleAssertion {
    param([Parameter(Mandatory)] $ServiceAccount, [Parameter(Mandatory)] [string] $Subject, [Parameter(Mandatory)] [string[]] $Scopes)
    $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $aud = if ($ServiceAccount.token_uri) { [string]$ServiceAccount.token_uri } else { 'https://oauth2.googleapis.com/token' }
    $header = @{ alg = 'RS256'; typ = 'JWT'; kid = [string]$ServiceAccount.private_key_id } | ConvertTo-Json -Compress
    $claims = [ordered]@{ iss = [string]$ServiceAccount.client_email; sub = $Subject; scope = ($Scopes -join ' '); aud = $aud; iat = $now; exp = $now + 3600 } | ConvertTo-Json -Compress
    $unsigned = (ConvertTo-Base64Url ([Text.Encoding]::UTF8.GetBytes($header))) + '.' + (ConvertTo-Base64Url ([Text.Encoding]::UTF8.GetBytes($claims)))
    $rsa = [System.Security.Cryptography.RSA]::Create()
    try {
        $rsa.ImportFromPem([string]$ServiceAccount.private_key)
        $sig = $rsa.SignData([Text.Encoding]::ASCII.GetBytes($unsigned), [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
    } finally { $rsa.Dispose() }
    return "$unsigned.$(ConvertTo-Base64Url $sig)"
}

function Get-GoogleToken {
    param([Parameter(Mandatory)] [string] $Area)
    $c = $script:GTokens[$Area]
    if ($c -and $c.Expires -gt (Get-Date).AddMinutes(5)) { return $c.Token }
    $sa = $global:auth.google_sa
    $assertion = New-GoogleAssertion -ServiceAccount $sa -Subject ([string]$global:auth.google_admin) -Scopes $script:GScopes[$Area]
    $uri = if ($sa.token_uri) { [string]$sa.token_uri } else { 'https://oauth2.googleapis.com/token' }
    try {
        $r = Invoke-RestMethod -Uri $uri -Method Post -ContentType 'application/x-www-form-urlencoded' -TimeoutSec 60 `
            -Body @{ grant_type = 'urn:ietf:params:oauth:grant-type:jwt-bearer'; assertion = $assertion }
    } catch {
        $detail = $_.ErrorDetails.Message
        throw "Google recusou o token para '$Area' (escopos $($script:GScopes[$Area] -join ', ')): $detail. Confira a delegação em todo o domínio e o administrador informado."
    }
    $script:GTokens[$Area] = @{ Token = $r.access_token; Expires = (Get-Date).AddSeconds([int]$r.expires_in) }
    return $r.access_token
}

# GET com paginação (nextPageToken) e novas tentativas. Devolve todos os itens da propriedade -Items.
function Invoke-GoogleApi {
    param([Parameter(Mandatory)] [string] $Area, [Parameter(Mandatory)] [string] $Uri, [string] $Items = '', [switch] $Single, [int] $MaxPages = 10000)
    $all = [System.Collections.Generic.List[object]]::new()
    $page = $null; $n = 0
    do {
        $u = if ($page) { $Uri + $(if ($Uri.Contains('?')) { '&' } else { '?' }) + 'pageToken=' + [uri]::EscapeDataString($page) } else { $Uri }
        $resp = $null
        for ($i = 1; $i -le 6; $i++) {
            try {
                $resp = Invoke-RestMethod -Uri $u -Headers @{ Authorization = "Bearer $(Get-GoogleToken -Area $Area)" } -TimeoutSec 120
                break
            } catch {
                $code = try { [int]$_.Exception.Response.StatusCode } catch { 0 }
                if ($code -in 429, 500, 502, 503, 504 -and $i -lt 6) { Start-Sleep -Seconds ([math]::Min(60, [math]::Pow(2, $i))); continue }
                $msg = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
                throw "Google API ($Area) respondeu $code em $($Uri.Split('?')[0]): $msg"
            }
        }
        if ($Single) { return $resp }
        if ($Items -and $resp.PSObject.Properties[$Items]) { foreach ($x in @($resp.$Items)) { $all.Add($x) } }
        $page = if ($resp.PSObject.Properties['nextPageToken']) { [string]$resp.nextPageToken } else { $null }
        $n++
    } while ($page -and $n -lt $MaxPages)
    return , $all.ToArray()
}

# Valor de um campo que pode não existir (StrictMode): $obj.a.b -> $null
function Get-GValue($Obj, [string] $Path) {
    $cur = $Obj
    foreach ($p in $Path.Split('.')) {
        if ($null -eq $cur) { return $null }
        if ($cur -is [hashtable]) { $cur = $cur[$p]; continue }
        if (-not $cur.PSObject.Properties[$p]) { return $null }
        $cur = $cur.$p
    }
    return $cur
}

function ConvertTo-GDate($v) {
    if (-not $v) { return [DBNull]::Value }
    try { $d = [datetime]::Parse([string]$v, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AdjustToUniversal) } catch { return [DBNull]::Value }
    if ($d.Year -lt 1980) { return [DBNull]::Value }   # "1970-01-01" = nunca
    return $d
}

# DataTable para SqlBulkCopy a partir de uma lista de hashtables com as mesmas chaves (colunas da tabela)
function New-GTable([string[]] $Columns, $Rows) {
    $dt = [System.Data.DataTable]::new()
    foreach ($c in $Columns) { [void]$dt.Columns.Add($c, [object]) }
    foreach ($r in $Rows) {
        $row = $dt.NewRow()
        foreach ($c in $Columns) { $v = $r[$c]; $row[$c] = if ($null -eq $v) { [DBNull]::Value } else { $v } }
        $dt.Rows.Add($row)
    }
    return , $dt
}
