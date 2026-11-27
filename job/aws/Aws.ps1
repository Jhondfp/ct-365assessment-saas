# ==============================================================================
#  CT Assessment 365 SaaS | Acesso à AWS (levantamento para migração ao Azure)
# ------------------------------------------------------------------------------
#  Usa a AWS CLI v2 do container com a chave de um usuário IAM só de leitura do
#  cliente (variáveis de ambiente só deste processo; nada em disco). A CLI já
#  pagina e repete em throttling (modo adaptive). Só leitura: describe/list/get.
# ==============================================================================

# Chamada da CLI: devolve o JSON já convertido; erro vira exceção com o código da AWS (AccessDenied etc.)
function Invoke-Aws {
    param([Parameter(Mandatory)] [string[]] $Arguments, [string] $Region, [switch] $AllowEmpty)
    $a = [System.Collections.Generic.List[string]]::new()
    foreach ($x in $Arguments) { $a.Add($x) }
    if ($Region) { $a.Add('--region'); $a.Add($Region) }
    $a.Add('--output'); $a.Add('json'); $a.Add('--no-cli-pager')
    $global:LASTEXITCODE = 0
    $raw = & aws @a 2>&1
    $out = [System.Text.StringBuilder]::new(); $err = [System.Text.StringBuilder]::new()
    foreach ($line in @($raw)) { if ($line -is [System.Management.Automation.ErrorRecord]) { [void]$err.AppendLine($line.ToString()) } else { [void]$out.AppendLine([string]$line) } }
    if ($LASTEXITCODE -ne 0) {
        $msg = $err.ToString().Trim(); if (-not $msg) { $msg = $out.ToString().Trim() }
        $code = if ($msg -match '\(([A-Za-z]+(Exception|Denied|Operation|Required|Token|Failure)?[A-Za-z]*)\)') { $Matches[1] } else { 'Erro' }
        throw [System.Exception]::new("AWS $($Arguments[0]) $($Arguments[1])$(if ($Region) { " ($Region)" }): $code · $(($msg -split "`n")[0])")
    }
    $text = $out.ToString().Trim()
    if (-not $text) { if ($AllowEmpty) { return $null }; return [pscustomobject]@{} }
    return ($text | ConvertFrom-Json -Depth 50)
}

# Erro de permissão (para mostrar "falta permissão" em vez de falha genérica)
function Test-AwsDenied([string]$Message) { return $Message -match 'AccessDenied|UnauthorizedOperation|not authorized|AuthorizationError|AccessDeniedException' }
# Região não habilitada / serviço indisponível na região: segue sem dado
function Test-AwsSkippable([string]$Message) { return $Message -match 'OptInRequired|InvalidClientTokenId|UnrecognizedClientException|Could not connect to the endpoint|not supported in this region|SubscriptionRequiredException' }

# Valor de um caminho que pode não existir (StrictMode)
function Get-AValue($Obj, [string] $Path) {
    $cur = $Obj
    foreach ($p in $Path.Split('.')) {
        if ($null -eq $cur) { return $null }
        if ($cur -is [hashtable]) { $cur = $cur[$p]; continue }
        if (-not $cur.PSObject.Properties[$p]) { return $null }
        $cur = $cur.$p
    }
    return $cur
}
function Get-AList($Obj, [string] $Path) { return @(Get-AValue $Obj $Path | Where-Object { $null -ne $_ }) }

# Tag de um recurso ([{Key,Value}]); procura vários nomes (Application, App, Sistema…)
function Get-ATag($Obj, [string[]] $Names) {
    $tags = Get-AList $Obj 'Tags'
    foreach ($n in $Names) { foreach ($t in $tags) { if ([string](Get-AValue $t 'Key') -ieq $n) { return [string](Get-AValue $t 'Value') } } }
    return $null
}
function ConvertTo-ATagsJson($Obj) {
    $h = [ordered]@{}; foreach ($t in (Get-AList $Obj 'Tags')) { $h[[string]$t.Key] = [string](Get-AValue $t 'Value') }
    if (-not $h.Count) { return $null }
    $j = $h | ConvertTo-Json -Compress; if ($j.Length -gt 4000) { $j = $j.Substring(0, 4000) }; return $j
}

function ConvertTo-ADate($v) {
    if (-not $v) { return [DBNull]::Value }
    if ($v -is [datetime]) { return $v.ToUniversalTime() }
    try { return [datetime]::Parse([string]$v, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AdjustToUniversal) } catch { return [DBNull]::Value }
}

# DataTable para SqlBulkCopy a partir de hashtables com as mesmas chaves
function New-ATable([string[]] $Columns, $Rows) {
    $dt = [System.Data.DataTable]::new()
    foreach ($c in $Columns) { [void]$dt.Columns.Add($c, [object]) }
    foreach ($r in $Rows) {
        $row = $dt.NewRow()
        foreach ($c in $Columns) { $v = $r[$c]; $row[$c] = if ($null -eq $v) { [DBNull]::Value } else { $v } }
        $dt.Rows.Add($row)
    }
    return , $dt
}

# CloudWatch: média e máximo diários de uma métrica para vários recursos (até 500 consultas por chamada)
function Get-AwsMetricStats {
    param([Parameter(Mandatory)] [string] $Region, [Parameter(Mandatory)] [string] $Namespace, [Parameter(Mandatory)] [string] $Metric,
          [Parameter(Mandatory)] [string] $DimensionName, [Parameter(Mandatory)] [string[]] $Ids, [string[]] $Stats = @('Average', 'Maximum'),
          [int] $Days = 30, [int] $Period = 86400, [hashtable] $ExtraDimensions = @{})
    $result = @{}
    if (-not $Ids.Count) { return $result }
    $end = (Get-Date).ToUniversalTime(); $start = $end.AddDays(-$Days)
    $perCall = [math]::Floor(500 / $Stats.Count)
    for ($i = 0; $i -lt $Ids.Count; $i += $perCall) {
        $chunk = $Ids[$i..([math]::Min($i + $perCall - 1, $Ids.Count - 1))]
        $queries = [System.Collections.Generic.List[object]]::new(); $map = @{}
        for ($j = 0; $j -lt $chunk.Count; $j++) {
            $dims = @(@{ Name = $DimensionName; Value = [string]$chunk[$j] }) + @($ExtraDimensions.GetEnumerator() | ForEach-Object { @{ Name = $_.Key; Value = [string]$_.Value } })
            foreach ($s in $Stats) {
                $qid = "q$($j)_$($s.ToLower())"; $map[$qid] = @{ id = [string]$chunk[$j]; stat = $s }
                $queries.Add(@{ Id = $qid; MetricStat = @{ Metric = @{ Namespace = $Namespace; MetricName = $Metric; Dimensions = $dims }; Period = $Period; Stat = $s }; ReturnData = $true })
            }
        }
        $file = Join-Path ([IO.Path]::GetTempPath()) "cw-$([guid]::NewGuid()).json"
        try {
            ($queries | ConvertTo-Json -Depth 10 -Compress) | Set-Content -Path $file -Encoding utf8NoBOM
            $r = Invoke-Aws -Arguments @('cloudwatch', 'get-metric-data', '--metric-data-queries', "file://$file", '--start-time', $start.ToString('o'), '--end-time', $end.ToString('o')) -Region $Region
        } finally { Remove-Item $file -Force -ErrorAction SilentlyContinue }
        foreach ($m in (Get-AList $r 'MetricDataResults')) {
            $info = $map[[string]$m.Id]; if (-not $info) { continue }
            $vals = @(Get-AList $m 'Values' | ForEach-Object { [double]$_ })
            if (-not $vals.Count) { continue }
            if (-not $result.ContainsKey($info.id)) { $result[$info.id] = @{} }
            $result[$info.id][$info.stat] = switch ($info.stat) {
                'Maximum' { ($vals | Measure-Object -Maximum).Maximum }
                'Average' { ($vals | Measure-Object -Average).Average }
                default { $vals[0] }   # último ponto (ex.: tamanho de bucket)
            }
        }
    }
    return $result
}
