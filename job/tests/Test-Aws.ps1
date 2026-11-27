# ==============================================================================
#  Levantamento AWS (job/aws) com a AWS CLI e o banco simulados: conta da chave,
#  regiões, módulos isolados (permissão faltando derruba só o módulo), métricas do
#  CloudWatch, tabelas aws_* e resultado reportado ao portal.
#  Uso: pwsh -File job/tests/Test-Aws.ps1   (sai com 1 se algo falhar)
# ==============================================================================
$root = Split-Path -Parent $PSScriptRoot
$fail = 0
function Check([string]$Name, [bool]$Ok, [string]$Got) { if ($Ok) { Write-Host "ok      $Name" -ForegroundColor Green } else { $script:fail++; Write-Host "FALHOU  $Name — $Got" -ForegroundColor Red } }
Set-StrictMode -Version 3.0

function global:Write-Log { param($Level, $Module, $Message, $SiteUrl, $Exception, $DbConnection) }
function global:Report-Step { param($StepName, $Status, $Progress, $Info) }
function global:New-DbConnection { param($MaxRetries) 'db' }
function global:Close-DbConnection { param($Connection) }
function global:Start-ExecutionHistory { param($Connection) $global:HIST = 'start' }
function global:Complete-ExecutionHistory { param($Status, $Connection, $TotalSites) $global:HIST = "$Status/$TotalSites" }
function global:Invoke-DbReader { param($Query, $Connection, $Parameters)
    if ($Query -like '*FROM dbo.aws_instances*') { return , @([pscustomobject]@{ region = 'us-east-1'; instance_id = 'i-1' }) }
    return , @() }
function global:Invoke-DbNonQuery { param($Query, $Connection, $Parameters, $TimeoutSeconds) $global:SQL.Add($Query); 1 }
function global:Invoke-DbBulkInsert { param($Connection, $DestinationTable, $DataTable) $global:BULK[$DestinationTable] = $DataTable.Rows.Count; $global:LAST[$DestinationTable] = $DataTable; $DataTable.Rows.Count }
function global:Send-PortalEvent { param([hashtable]$Body) $global:SENT = $Body; $true }

# AWS CLI simulada: responde pelo serviço/operação; a região sa-east-1 não tem EC2 habilitado
function global:aws {
    $a = @($args); $svc = $a[0]; $op = $a[1]; $ri = [array]::IndexOf($a, '--region'); $region = if ($ri -ge 0) { $a[$ri + 1] } else { '' }
    $global:CALLS.Add("$svc $op $region".Trim()); $global:LASTEXITCODE = 0
    $deny = { param($m) $global:LASTEXITCODE = 254; Write-Error "An error occurred (AccessDenied) when calling the $m operation: not authorized" }
    $j = { param($o) $o | ConvertTo-Json -Depth 20 -Compress }
    switch ("$svc $op") {
        'sts get-caller-identity' { return (& $j @{ Account = $global:MOCK_ACCOUNT; Arn = "arn:aws:iam::$($global:MOCK_ACCOUNT):user/ct-assessment" }) }
        'ec2 describe-regions' { return (& $j @{ Regions = @(@{ RegionName = 'us-east-1' }, @{ RegionName = 'sa-east-1' }) }) }
        'ec2 describe-instances' {
            if ($region -eq 'sa-east-1') { $global:LASTEXITCODE = 254; Write-Error 'An error occurred (OptInRequired) when calling the DescribeInstances operation'; return }
            return (& $j @{ Reservations = @(@{ Instances = @(
                @{ InstanceId = 'i-1'; InstanceType = 'm5.xlarge'; State = @{ Name = 'running' }; Platform = 'windows'; PlatformDetails = 'Windows with SQL Server Standard'; LaunchTime = '2024-01-10T10:00:00Z'; VpcId = 'vpc-1'; PublicIpAddress = '1.2.3.4'; Tags = @(@{ Key = 'Name'; Value = 'erp-db' }, @{ Key = 'Application'; Value = 'ERP' }, @{ Key = 'Environment'; Value = 'prod' }) },
                @{ InstanceId = 'i-2'; InstanceType = 't3.medium'; State = @{ Name = 'stopped' }; PlatformDetails = 'Linux/UNIX'; LaunchTime = '2023-05-01T10:00:00Z'; VpcId = 'vpc-1' }) }) }) }
        'ec2 describe-instance-types' { return (& $j @{ InstanceTypes = @(@{ InstanceType = 'm5.xlarge'; VCpuInfo = @{ DefaultVCpus = 4 }; MemoryInfo = @{ SizeInMiB = 16384 }; BurstablePerformanceSupported = $false }, @{ InstanceType = 't3.medium'; VCpuInfo = @{ DefaultVCpus = 2 }; MemoryInfo = @{ SizeInMiB = 4096 }; BurstablePerformanceSupported = $true }, @{ InstanceType = 'm5.large'; VCpuInfo = @{ DefaultVCpus = 2 }; MemoryInfo = @{ SizeInMiB = 8192 } }) }) }
        'ec2 describe-volumes' { if ($region -eq 'sa-east-1') { return (& $j @{ Volumes = @() }) }; return (& $j @{ Volumes = @(@{ VolumeId = 'vol-1'; Size = 200; VolumeType = 'gp3'; Iops = 3000; Attachments = @(@{ InstanceId = 'i-1' }); Encrypted = $true }, @{ VolumeId = 'vol-2'; Size = 50; VolumeType = 'gp2'; Attachments = @() }) }) }
        'ec2 describe-vpcs' { return (& $j @{ Vpcs = @(@{ VpcId = "vpc-$region"; CidrBlock = '10.0.0.0/16'; IsDefault = $false }) }) }
        'directconnect describe-connections' { if ($region -eq 'us-east-1') { return (& $j @{ connections = @(@{ connectionId = 'dx-1'; connectionName = 'DC-SP'; bandwidth = '1Gbps'; location = 'SP' }) }) }; return (& $j @{ connections = @() }) }
        'elbv2 describe-load-balancers' { return (& $j @{ LoadBalancers = @(@{ LoadBalancerName = "alb-$region"; Type = 'application'; Scheme = 'internet-facing' }) }) }
        'rds describe-db-instances' { if ($region -eq 'us-east-1') { return (& $j @{ DBInstances = @(@{ DBInstanceIdentifier = 'erp'; Engine = 'sqlserver-se'; EngineVersion = '15.0'; DBInstanceClass = 'db.m5.large'; AllocatedStorage = 500; MultiAZ = $true; LicenseModel = 'license-included'; DBInstanceStatus = 'available' }) }) }; return (& $j @{ DBInstances = @() }) }
        'iam get-account-summary' { return (& $j @{ SummaryMap = @{ Users = 12; Roles = 30; AccountMFAEnabled = 0 } }) }
        'iam get-account-password-policy' { $global:LASTEXITCODE = 254; Write-Error 'An error occurred (NoSuchEntity) when calling the GetAccountPasswordPolicy operation'; return }
        'iam list-account-aliases' { return (& $j @{ AccountAliases = @('contoso-prod') }) }
        'organizations list-accounts' { & $deny 'ListAccounts'; return }
        's3api list-buckets' { return (& $j @{ Buckets = @(@{ Name = 'dados'; CreationDate = '2022-01-01T00:00:00Z' }) }) }
        's3api get-bucket-location' { return (& $j @{ LocationConstraint = $null }) }
        'cloudwatch list-metrics' { return (& $j @{ Metrics = @() }) }
        'cloudwatch get-metric-data' {
            $fi = [array]::IndexOf($a, '--metric-data-queries'); $q = Get-Content ($a[$fi + 1] -replace '^file://', '') -Raw | ConvertFrom-Json
            $res = foreach ($x in @($q)) {
                $m = $x.MetricStat.Metric.MetricName; $sd = @($x.MetricStat.Metric.Dimensions | Where-Object { $_.Name -eq 'StorageType' }); $st = if ($sd.Count) { $sd[0].Value } else { '' }
                $v = if ($m -eq 'CPUUtilization') { if ($x.MetricStat.Stat -eq 'Maximum') { @(35, 62) } else { @(10, 20) } } elseif ($m -eq 'BucketSizeBytes' -and $st -eq 'StandardStorage') { @(1073741824) } elseif ($m -eq 'BucketSizeBytes' -and $st -eq 'GlacierStorage') { @(2147483648) } elseif ($m -eq 'NumberOfObjects') { @(1000) } else { @() }
                @{ Id = $x.Id; Values = $v }
            }
            return (& $j @{ MetricDataResults = @($res) }) }
        'ce get-cost-and-usage' { & $deny 'GetCostAndUsage'; return }
        default { return (& $j @{}) }
    }
}

function Run-Aws([string]$Account, [hashtable]$Params) {
    $global:CALLS = [System.Collections.Generic.List[string]]::new(); $global:SQL = [System.Collections.Generic.List[string]]::new(); $global:BULK = @{}; $global:LAST = @{}; $global:SENT = $null; $global:HIST = $null
    $global:MOCK_ACCOUNT = $Account; $global:executionId = 'aws-exec-1'
    $global:auth = @{ platform = 'aws'; aws_access_key_id = 'AKIATESTE'; aws_secret_access_key = 'segredo'; aws_account_id = '111122223333'; aws_regions = ''; server = 's'; database = 'd' }
    $global:params = $Params
    $script:sync = [hashtable]::Synchronized(@{ Stop = $false }); $script:reporter = Start-ThreadJob { 1 }
    $script:logDir = Join-Path ([IO.Path]::GetTempPath()) "aws-$([guid]::NewGuid())"; New-Item -ItemType Directory $script:logDir | Out-Null
    $script:CallbackUrl = 'http://127.0.0.1:9/x'; $script:headers = @{}
    . (Join-Path $root 'aws\Invoke-AwsAssessment.ps1') 6>$null
}
$all = @{ platform = 'aws'; aws_account = $true; aws_compute = $true; aws_usage = $true; aws_storage = $true; aws_database = $true; aws_network = $true; aws_cost = $true; diagnostic_only = $false }

# 1) chave de outra conta: para na checagem prévia, sem tocar no banco
Run-Aws '999988887777' $all
Check 'chave de outra conta é recusada na checagem prévia' ($global:SENT.status -eq 'failed' -and $global:SENT.preflight.graph.ok -eq $false -and $global:SENT.preflight.graph.detail -like '*999988887777*111122223333*' -and $global:BULK.Count -eq 0) "status=$($global:SENT.status) detalhe=$($global:SENT.preflight.graph.detail)"

# 2) levantamento completo
Run-Aws '111122223333' $all
$w = $global:SENT.workloads
Check 'regiões habilitadas; região sem EC2 (opt-in) é pulada sem derrubar o módulo' ($w.aws_compute.status -eq 'ok' -and $global:BULK['dbo.aws_instances'] -eq 2) "status=$($w.aws_compute.status) inst=$($global:BULK['dbo.aws_instances'])"
$i1 = $global:LAST['dbo.aws_instances'].Rows[0]
Check 'instância com vCPU/memória do catálogo, Windows+SQL, tags de aplicação e ambiente' ($i1['vcpu'] -eq 4 -and $i1['memory_mib'] -eq 16384 -and $i1['platform'] -eq 'windows' -and $i1['app_tag'] -eq 'ERP' -and $i1['env_tag'] -eq 'prod' -and $i1['public_ip'] -eq $true) "vcpu=$($i1['vcpu']) app=$($i1['app_tag']) env=$($i1['env_tag'])"
Check 'uso de CPU: média e pico de 30 dias gravados nas instâncias ligadas' ($w.aws_usage.status -eq 'ok' -and $global:BULK['#cpu'] -eq 1 -and ($global:LAST['#cpu'].Rows[0]['cpu_max'] -eq 62) -and ($global:SQL -join ' ') -match 'UPDATE i SET i.cpu_avg') "status=$($w.aws_usage.status) max=$($global:LAST['#cpu'].Rows[0]['cpu_max'])"
$b = $global:LAST['dbo.aws_buckets'].Rows[0]
Check 'S3: tamanho por classe pelas métricas (sem listar objetos)' ($b['standard_bytes'] -eq 1073741824 -and $b['archive_bytes'] -eq 2147483648 -and $b['size_bytes'] -eq 3221225472 -and $b['objects'] -eq 1000 -and $b['region'] -eq 'us-east-1') "std=$($b['standard_bytes']) arq=$($b['archive_bytes']) total=$($b['size_bytes'])"
$d = $global:LAST['dbo.aws_databases'].Rows[0]
Check 'RDS com motor, licença e vCPU/memória da classe' ($d['engine'] -eq 'sqlserver-se' -and $d['vcpu'] -eq 2 -and $d['memory_mib'] -eq 8192 -and $d['multi_az'] -eq $true) "engine=$($d['engine']) vcpu=$($d['vcpu'])"
Check 'rede: VPCs, load balancers e Direct Connect' (@($global:LAST['dbo.aws_network'].Rows | Where-Object { $_['kind'] -eq 'directconnect' }).Count -eq 1 -and @($global:LAST['dbo.aws_network'].Rows | Where-Object { $_['kind'] -eq 'vpc' }).Count -eq 2) "linhas=$($global:BULK['dbo.aws_network'])"
Check 'conta fora de organização: registra a conta da chave com o alias' ($global:LAST['dbo.aws_accounts'].Rows[0]['name'] -eq 'contoso-prod' -and $w.aws_account.status -eq 'ok') "nome=$($global:LAST['dbo.aws_accounts'].Rows[0]['name'])"
Check 'sem permissão de custos: só o módulo de custos falha e a coleta fica parcial' ($w.aws_cost.status -eq 'failed' -and $w.aws_cost.detail -like 'Sem permissão*' -and $global:SENT.status -eq 'partial') "custo=$($w.aws_cost.status) final=$($global:SENT.status)"
Check 'histórico fechado com o total de instâncias' ($global:HIST -eq 'completed/2') $global:HIST
Check 'chave removida do ambiente no fim' (-not $env:AWS_ACCESS_KEY_ID -and -not $env:AWS_SECRET_ACCESS_KEY) "id=$env:AWS_ACCESS_KEY_ID"
Check 'Cost Explorer não é chamado na checagem prévia (cada chamada custa)' (@($global:CALLS | Where-Object { $_ -like 'ce *' }).Count -eq 1) "chamadas ce=$(@($global:CALLS | Where-Object { $_ -like 'ce *' }).Count)"

# 3) diagnóstico: só checagem prévia
Run-Aws '111122223333' @{ platform = 'aws'; diagnostic_only = $true }
Check 'diagnóstico não grava nada e devolve permissões' ($global:BULK.Count -eq 0 -and $global:SENT.status -eq 'completed' -and @($global:SENT.preflight.permissions.granted).Count -ge 4) "status=$($global:SENT.status) perms=$(@($global:SENT.preflight.permissions.granted) -join ',')"

exit [int]($fail -gt 0)
