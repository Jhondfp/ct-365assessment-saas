# ==============================================================================
#  CT Assessment 365 SaaS | Levantamento AWS (migração para o Azure)
# ------------------------------------------------------------------------------
#  Dot-source no Invoke-SaasAssessment.ps1 quando auth.platform = aws (usa $config,
#  $global:auth/params, $reporter/$sync, $logDir, Send-PortalEvent e as funções de
#  banco do coletor). Chave de um usuário IAM só de leitura do cliente, nas variáveis
#  de ambiente deste processo. Cada módulo é isolado (permissão faltando derruba só
#  o módulo) e grava nas tabelas aws_* (migração tenant 004). Numa retomada, o
#  módulo apaga o que já tinha gravado e refaz (inventário é rápido).
# ==============================================================================
if (-not (Get-Command Invoke-Aws -ErrorAction SilentlyContinue)) { . (Join-Path $PSScriptRoot 'Aws.ps1') }

$diagnostic = [bool]$global:params['diagnostic_only']
$env:AWS_ACCESS_KEY_ID = [string]$global:auth.aws_access_key_id
$env:AWS_SECRET_ACCESS_KEY = [string]$global:auth.aws_secret_access_key
Remove-Item Env:AWS_SESSION_TOKEN, Env:AWS_PROFILE -ErrorAction SilentlyContinue
$env:AWS_DEFAULT_REGION = 'us-east-1'; $env:AWS_RETRY_MODE = 'adaptive'; $env:AWS_MAX_ATTEMPTS = '10'; $env:AWS_PAGER = ''
$env:AWS_CONFIG_FILE = '/dev/null'; $env:AWS_SHARED_CREDENTIALS_FILE = '/dev/null'

$aDefs = [ordered]@{
    aws_account  = @{ label = 'Conta e segurança';   tables = @('aws_accounts', 'aws_summary') }
    aws_compute  = @{ label = 'Computação';          tables = @('aws_instances', 'aws_services') }
    aws_usage    = @{ label = 'Uso de CPU (30 dias)'; tables = @() }   # atualiza aws_instances
    aws_storage  = @{ label = 'Armazenamento';       tables = @('aws_volumes', 'aws_buckets') }
    aws_database = @{ label = 'Bancos de dados';     tables = @('aws_databases') }
    aws_network  = @{ label = 'Rede';                tables = @('aws_network') }
    aws_cost     = @{ label = 'Custos';              tables = @('aws_costs') }
}
$workloads = [ordered]@{}
foreach ($k in $aDefs.Keys) { if ($global:params[$k] -and -not $diagnostic) { $workloads[$k] = [ordered]@{ label = $aDefs[$k].label; status = 'pending'; detail = ''; seconds = 0 } } }
$preflight = [ordered]@{ graph = $null; permissions = $null; sharepoint = $null; database = $null }
function Send-AState { [void](Send-PortalEvent -Body @{ workloads = $workloads; preflight = $preflight }) }
function Set-AWorkload([string]$Id, [string]$Status, [string]$Detail = '', [double]$Seconds = 0) {
    if (-not $workloads.Contains($Id)) { return }
    $workloads[$Id].status = $Status; $workloads[$Id].detail = $Detail
    if ($Seconds) { $workloads[$Id].seconds = [math]::Round($Seconds) }
    Send-AState
}

$dbConn = $null; $finalStatus = 'failed'; $finalError = $null; $script:instanceCount = 0
$script:account = $null; $script:regions = @(); $script:typeCache = @{}; $script:skipped = [System.Collections.Generic.List[string]]::new()

# Executa o mesmo comando em cada região; região sem o serviço ou não habilitada é pulada (anotada)
function Invoke-AwsRegions([string[]]$Arguments, [scriptblock]$Each) {
    foreach ($r in $script:regions) {
        try { $res = Invoke-Aws -Arguments $Arguments -Region $r; & $Each $r $res }
        catch {
            $m = $_.Exception.Message
            if (Test-AwsDenied $m) { throw }
            if (Test-AwsSkippable $m) { $script:skipped.Add("$($Arguments[0]) em $r"); continue }
            throw
        }
    }
}
# vCPU e memória de um tipo de instância (catálogo da AWS, com cache)
function Get-AwsTypeInfo([string]$Region, [string[]]$Types) {
    $need = @($Types | Where-Object { $_ -and -not $script:typeCache.ContainsKey($_) } | Select-Object -Unique)
    for ($i = 0; $i -lt $need.Count; $i += 100) {
        $chunk = $need[$i..([math]::Min($i + 99, $need.Count - 1))]
        try {
            $r = Invoke-Aws -Arguments (@('ec2', 'describe-instance-types', '--instance-types') + $chunk) -Region $Region
            foreach ($t in (Get-AList $r 'InstanceTypes')) {
                $script:typeCache[[string]$t.InstanceType] = @{ vcpu = [int](Get-AValue $t 'VCpuInfo.DefaultVCpus'); mem = [int](Get-AValue $t 'MemoryInfo.SizeInMiB'); burst = [bool](Get-AValue $t 'BurstablePerformanceSupported') }
            }
        } catch { Write-Log -Level WARNING -Module 'AWS' -Message "Catálogo de tipos indisponível em $Region." -Exception $_.Exception.Message }
    }
}

try {
    # ── checagem prévia: identidade da chave e permissões básicas por área ──
    try { $who = Invoke-Aws -Arguments @('sts', 'get-caller-identity') }
    catch { $preflight.graph = [ordered]@{ ok = $false; detail = "A AWS recusou a chave de acesso: $($_.Exception.Message). Confira a Access Key ID e a Secret Access Key do usuário IAM." }; throw $preflight.graph.detail }
    $script:account = [string]$who.Account
    $expected = [string]$global:auth.aws_account_id
    if ($expected -and $expected -ne $script:account) {
        $preflight.graph = [ordered]@{ ok = $false; detail = "A chave pertence à conta $($script:account), mas o cadastro do cliente indica a conta $expected." }
        throw $preflight.graph.detail
    }
    $preflight.graph = [ordered]@{ ok = $true; detail = "AWS: conta $($script:account) · $([string]$who.Arn)"; tenant = $script:account }

    $wanted = @(([string]$global:auth.aws_regions).Split(',', [StringSplitOptions]::RemoveEmptyEntries) | ForEach-Object { $_.Trim().ToLower() } | Where-Object { $_ })
    $granted = [System.Collections.Generic.List[string]]::new(); $missing = [System.Collections.Generic.List[string]]::new()
    try {
        $rg = Invoke-Aws -Arguments @('ec2', 'describe-regions') -Region 'us-east-1'
        $enabled = @(Get-AList $rg 'Regions' | ForEach-Object { [string]$_.RegionName })
        $script:regions = if ($wanted.Count) { @($wanted | Where-Object { $enabled -contains $_ }) } else { $enabled }
        $granted.Add('AWS:ec2:Describe*')
    } catch { $missing.Add('ec2:DescribeRegions'); $script:regions = $wanted }
    $probe = [ordered]@{
        'iam:GetAccountSummary'         = { Invoke-Aws -Arguments @('iam', 'get-account-summary') }
        's3:ListAllMyBuckets'           = { Invoke-Aws -Arguments @('s3api', 'list-buckets') }
        'rds:DescribeDBInstances'       = { Invoke-Aws -Arguments @('rds', 'describe-db-instances', '--max-items', '1') -Region 'us-east-1' }
        'cloudwatch:GetMetricData'      = { Invoke-Aws -Arguments @('cloudwatch', 'list-metrics', '--namespace', 'AWS/EC2', '--max-items', '1') -Region 'us-east-1' }
        'ce:GetCostAndUsage'            = $null   # cada chamada custa US$ 0,01: testada só no módulo de custos
    }
    foreach ($p in $probe.Keys) {
        if (-not $probe[$p]) { continue }
        try { [void](& $probe[$p]); $granted.Add("AWS:$p") } catch { if (Test-AwsDenied $_.Exception.Message) { $missing.Add($p) } else { $granted.Add("AWS:$p") } }
    }
    $preflight.permissions = [ordered]@{ ok = $true; checked = $true; granted = @($granted); detail = $(if ($missing.Count) { "Permissões faltando: $($missing -join ', ')" } else { '' }) }
    if (-not $script:regions.Count) { throw 'Nenhuma região disponível para a chave (confira as regiões informadas no cadastro).' }
    Write-Log -Level SUCCESS -Module 'AWS' -Message "Conexão com a AWS OK: conta $($script:account), $($script:regions.Count) região(ões)."

    $dbConn = New-DbConnection -MaxRetries 3
    $preflight.database = [ordered]@{ ok = $true; detail = "$($global:auth.server)/$($global:auth.database)" }
    Send-AState

    if ($diagnostic) {
        $finalStatus = if ($missing.Count) { 'partial' } else { 'completed' }
        if ($missing.Count) { $finalError = "Faltam permissões na política do usuário IAM: $($missing -join ', ')" }
    } else {
        $prev = Invoke-DbReader -Connection $dbConn -Query 'SELECT status FROM dbo.execution_history WHERE execution_id = @e' -Parameters @{ '@e' = $global:executionId }
        if ($null -ne $prev -and $prev.Count -gt 0) {
            Invoke-DbNonQuery -Connection $dbConn -Query "UPDATE dbo.execution_history SET status = 'running', end_time = NULL WHERE execution_id = @e" -Parameters @{ '@e' = $global:executionId } | Out-Null
            Write-Log -Level WARNING -Module 'AWS' -Message 'Retomando o levantamento: os módulos são refeitos do zero.'
        } else { Start-ExecutionHistory -Connection $dbConn }

        $E = $global:executionId; $A = $script:account
        $clear = { param([string[]]$Tables) foreach ($t in $Tables) { Invoke-DbNonQuery -Connection $dbConn -Query "DELETE FROM dbo.$t WHERE execution_id = @e" -Parameters @{ '@e' = $global:executionId } -TimeoutSeconds 600 | Out-Null } }
        $bulk = { param([string]$Table, [string[]]$Cols, $Rows) [void](Invoke-DbBulkInsert -Connection $dbConn -DestinationTable "dbo.$Table" -DataTable (New-ATable $Cols @($Rows))) }
        $run = {
            param([string]$Id, [scriptblock]$Body)
            if (-not $workloads.Contains($Id)) { return }
            $sw = [Diagnostics.Stopwatch]::StartNew(); Set-AWorkload $Id 'running'
            try { $detail = & $Body; Set-AWorkload $Id 'ok' ([string]$detail) $sw.Elapsed.TotalSeconds }
            catch {
                $m = $_.Exception.Message
                $msg = if (Test-AwsDenied $m) { "Sem permissão: $m" } else { $m }
                Write-Log -Level ERROR -Module 'AWS' -Message "Módulo '$Id' falhou; seguindo com os demais." -Exception $msg
                Set-AWorkload $Id 'failed' $msg $sw.Elapsed.TotalSeconds
            }
        }
        $step = { param([string]$Name, [int]$Pct, [string]$Info) Report-Step -StepName "AWS · $Name" -Status $(if ($Pct -ge 100) { 'completed' } else { 'in progress' }) -Progress $Pct -Info $Info }

        & $run 'aws_account' {
            & $clear $aDefs.aws_account.tables
            & $step 'Conta e segurança' 10 'Organização e contas'
            $accRows = [System.Collections.Generic.List[hashtable]]::new()
            try {
                $accs = Invoke-Aws -Arguments @('organizations', 'list-accounts')
                foreach ($x in (Get-AList $accs 'Accounts')) { $accRows.Add(@{ execution_id = $E; account_id = [string]$x.Id; name = [string](Get-AValue $x 'Name'); email = [string](Get-AValue $x 'Email'); status = [string](Get-AValue $x 'Status'); is_current = ([string]$x.Id -eq $A) }) }
            } catch { }   # conta fora de organização ou sem permissão: registra só a conta atual
            if (-not ($accRows | Where-Object { $_.account_id -eq $A })) {
                $alias = try { @(Get-AList (Invoke-Aws -Arguments @('iam', 'list-account-aliases')) 'AccountAliases')[0] } catch { $null }
                $accRows.Add(@{ execution_id = $E; account_id = $A; name = [string]$alias; email = $null; status = 'ACTIVE'; is_current = $true })
            }
            & $bulk 'aws_accounts' @('execution_id', 'account_id', 'name', 'email', 'status', 'is_current') $accRows
            & $step 'Conta e segurança' 50 'IAM'
            $sum = [System.Collections.Generic.List[hashtable]]::new()
            $s = Invoke-Aws -Arguments @('iam', 'get-account-summary')
            $map = Get-AValue $s 'SummaryMap'
            foreach ($k in @('Users', 'Groups', 'Roles', 'Policies', 'AccountMFAEnabled', 'AccountAccessKeysPresent', 'MFADevicesInUse')) { $v = Get-AValue $map $k; if ($null -ne $v) { $sum.Add(@{ execution_id = $E; account_id = $A; item = "iam.$k"; value = [string]$v }) } }
            try { $pp = Invoke-Aws -Arguments @('iam', 'get-account-password-policy'); $sum.Add(@{ execution_id = $E; account_id = $A; item = 'iam.PasswordPolicy'; value = "min $(Get-AValue $pp 'PasswordPolicy.MinimumPasswordLength')" }) } catch { $sum.Add(@{ execution_id = $E; account_id = $A; item = 'iam.PasswordPolicy'; value = 'nenhuma' }) }
            $sum.Add(@{ execution_id = $E; account_id = $A; item = 'regions'; value = ($script:regions -join ',') })
            & $bulk 'aws_summary' @('execution_id', 'account_id', 'item', 'value') $sum
            & $step 'Conta e segurança' 100 'OK'
            "$($accRows.Count) conta(s) · $(Get-AValue $map 'Users') usuários IAM"
        }

        & $run 'aws_compute' {
            & $clear $aDefs.aws_compute.tables
            $inst = [System.Collections.Generic.List[hashtable]]::new(); $svc = [System.Collections.Generic.List[hashtable]]::new(); $n = 0
            foreach ($r in $script:regions) {
                $n++; & $step 'Computação' ([int](90 * $n / [math]::Max(1, $script:regions.Count))) "Região $r"
                try { $res = Invoke-Aws -Arguments @('ec2', 'describe-instances') -Region $r }
                catch { if (Test-AwsDenied $_.Exception.Message) { throw }; $script:skipped.Add("ec2 em $r"); continue }
                $list = @(foreach ($rv in (Get-AList $res 'Reservations')) { Get-AList $rv 'Instances' })
                if ($list.Count) { Get-AwsTypeInfo -Region $r -Types @($list | ForEach-Object { [string]$_.InstanceType }) }
                foreach ($i in $list) {
                    $t = $script:typeCache[[string]$i.InstanceType]
                    $inst.Add(@{ execution_id = $E; account_id = $A; region = $r; instance_id = [string]$i.InstanceId; name = (Get-ATag $i @('Name'))
                        instance_type = [string]$i.InstanceType; vcpu = $(if ($t) { $t.vcpu } else { $null }); memory_mib = $(if ($t) { $t.mem } else { $null }); burstable = $(if ($t) { $t.burst } else { $null })
                        state = [string](Get-AValue $i 'State.Name'); platform = $(if ([string](Get-AValue $i 'Platform') -eq 'windows') { 'windows' } else { 'linux' }); platform_details = [string](Get-AValue $i 'PlatformDetails')
                        launch_time = (ConvertTo-ADate (Get-AValue $i 'LaunchTime')); state_reason = [string](Get-AValue $i 'StateTransitionReason')
                        vpc_id = [string](Get-AValue $i 'VpcId'); public_ip = [bool](Get-AValue $i 'PublicIpAddress')
                        app_tag = (Get-ATag $i @('Application', 'App', 'Aplicacao', 'Aplicação', 'Sistema', 'Project', 'Projeto', 'Service'))
                        env_tag = (Get-ATag $i @('Environment', 'Env', 'Ambiente', 'Stage')); tags = (ConvertTo-ATagsJson $i) })
                }
                foreach ($spec in @(
                    @{ kind = 'lambda'; args = @('lambda', 'list-functions'); path = 'Functions'; name = 'FunctionName'; detail = { param($x) "$(Get-AValue $x 'Runtime') · $(Get-AValue $x 'MemorySize') MB" }; size = { param($x) [long](Get-AValue $x 'CodeSize') } },
                    @{ kind = 'ecs'; args = @('ecs', 'list-clusters'); path = 'clusterArns'; name = $null; detail = { param($x) '' }; size = { param($x) $null } },
                    @{ kind = 'eks'; args = @('eks', 'list-clusters'); path = 'clusters'; name = $null; detail = { param($x) '' }; size = { param($x) $null } },
                    @{ kind = 'asg'; args = @('autoscaling', 'describe-auto-scaling-groups'); path = 'AutoScalingGroups'; name = 'AutoScalingGroupName'; detail = { param($x) "mín $(Get-AValue $x 'MinSize') · máx $(Get-AValue $x 'MaxSize') · atual $(@(Get-AList $x 'Instances').Count)" }; size = { param($x) $null } }
                )) {
                    try { $o = Invoke-Aws -Arguments $spec.args -Region $r }
                    catch { if (Test-AwsDenied $_.Exception.Message) { Write-Log -Level WARNING -Module 'AWS' -Message "Sem permissão para $($spec.kind) em $r." ; continue }; $script:skipped.Add("$($spec.kind) em $r"); continue }
                    foreach ($x in (Get-AList $o $spec.path)) {
                        $nm = if ($spec.name) { [string](Get-AValue $x $spec.name) } else { ([string]$x).Split('/')[-1] }
                        $svc.Add(@{ execution_id = $E; account_id = $A; region = $r; kind = $spec.kind; name = $nm; detail = [string](& $spec.detail $x); size_bytes = (& $spec.size $x); count_value = $null })
                    }
                }
            }
            & $bulk 'aws_instances' @('execution_id', 'account_id', 'region', 'instance_id', 'name', 'instance_type', 'vcpu', 'memory_mib', 'burstable', 'state', 'platform', 'platform_details', 'launch_time', 'state_reason', 'vpc_id', 'public_ip', 'app_tag', 'env_tag', 'tags') $inst
            & $bulk 'aws_services' @('execution_id', 'account_id', 'region', 'kind', 'name', 'detail', 'size_bytes', 'count_value') $svc
            $script:instanceCount = $inst.Count
            & $step 'Computação' 100 'OK'
            Write-Log -Level SUCCESS -Module 'AWS' -Message "Computação: $($inst.Count) instâncias EC2, $($svc.Count) outros serviços."
            "$($inst.Count) instâncias EC2 · $(@($svc | Where-Object { $_.kind -eq 'lambda' }).Count) funções Lambda"
        }

        & $run 'aws_usage' {
            $rows = Invoke-DbReader -Connection $dbConn -Query "SELECT region, instance_id FROM dbo.aws_instances WHERE execution_id = @e AND state = 'running'" -Parameters @{ '@e' = $E }
            if ($null -eq $rows -or $rows.Count -eq 0) { return 'nenhuma instância ligada' }
            $tmp = [System.Collections.Generic.List[hashtable]]::new(); $groups = @($rows | Group-Object region); $n = 0
            foreach ($g in $groups) {
                $n++; & $step 'Uso de CPU' ([int](90 * $n / $groups.Count)) "Região $($g.Name)"
                $st = Get-AwsMetricStats -Region $g.Name -Namespace 'AWS/EC2' -Metric 'CPUUtilization' -DimensionName 'InstanceId' -Ids @($g.Group | ForEach-Object { [string]$_.instance_id })
                foreach ($id in $st.Keys) { $tmp.Add(@{ instance_id = $id; cpu_avg = [math]::Round([double]$st[$id]['Average'], 2); cpu_max = [math]::Round([double]$st[$id]['Maximum'], 2) }) }
            }
            if ($tmp.Count) {
                Invoke-DbNonQuery -Connection $dbConn -Query "IF OBJECT_ID('tempdb..#cpu') IS NOT NULL DROP TABLE #cpu; CREATE TABLE #cpu (instance_id NVARCHAR(64), cpu_avg DECIMAL(6,2), cpu_max DECIMAL(6,2))" | Out-Null
                [void](Invoke-DbBulkInsert -Connection $dbConn -DestinationTable '#cpu' -DataTable (New-ATable @('instance_id', 'cpu_avg', 'cpu_max') $tmp))
                Invoke-DbNonQuery -Connection $dbConn -TimeoutSeconds 600 -Parameters @{ '@e' = $E } -Query "UPDATE i SET i.cpu_avg = c.cpu_avg, i.cpu_max = c.cpu_max FROM dbo.aws_instances i JOIN #cpu c ON c.instance_id = i.instance_id WHERE i.execution_id = @e; DROP TABLE #cpu;" | Out-Null
            }
            & $step 'Uso de CPU' 100 'OK'
            "$($tmp.Count) de $($rows.Count) instâncias ligadas com métricas"
        }

        & $run 'aws_storage' {
            & $clear $aDefs.aws_storage.tables
            $vols = [System.Collections.Generic.List[hashtable]]::new(); $n = 0
            foreach ($r in $script:regions) {
                $n++; & $step 'Armazenamento' ([int](50 * $n / [math]::Max(1, $script:regions.Count))) "Volumes em $r"
                try { $res = Invoke-Aws -Arguments @('ec2', 'describe-volumes') -Region $r }
                catch { if (Test-AwsDenied $_.Exception.Message) { throw }; continue }
                foreach ($v in (Get-AList $res 'Volumes')) {
                    $att = @(Get-AList $v 'Attachments')
                    $vols.Add(@{ execution_id = $E; account_id = $A; region = $r; volume_id = [string]$v.VolumeId; size_gb = [int]$v.Size; volume_type = [string]$v.VolumeType; iops = (Get-AValue $v 'Iops'); throughput = (Get-AValue $v 'Throughput')
                        attached = ($att.Count -gt 0); instance_id = $(if ($att.Count) { [string]$att[0].InstanceId } else { $null }); encrypted = [bool](Get-AValue $v 'Encrypted') })
                }
                try {
                    $efs = Invoke-Aws -Arguments @('efs', 'describe-file-systems') -Region $r
                    foreach ($f in (Get-AList $efs 'FileSystems')) { $vols.Add(@{ execution_id = $E; account_id = $A; region = $r; volume_id = [string]$f.FileSystemId; size_gb = [int][math]::Ceiling([double](Get-AValue $f 'SizeInBytes.Value') / 1GB); volume_type = 'efs'; iops = $null; throughput = $null; attached = $true; instance_id = $null; encrypted = [bool](Get-AValue $f 'Encrypted') }) }
                } catch { }
            }
            & $bulk 'aws_volumes' @('execution_id', 'account_id', 'region', 'volume_id', 'size_gb', 'volume_type', 'iops', 'throughput', 'attached', 'instance_id', 'encrypted') $vols
            & $step 'Armazenamento' 60 'Buckets S3'
            $bk = Invoke-Aws -Arguments @('s3api', 'list-buckets')
            $buckets = @(Get-AList $bk 'Buckets'); $brows = [System.Collections.Generic.List[hashtable]]::new(); $byRegion = @{}
            foreach ($b in $buckets) {
                $loc = try { [string](Get-AValue (Invoke-Aws -Arguments @('s3api', 'get-bucket-location', '--bucket', [string]$b.Name)) 'LocationConstraint') } catch { '' }
                if (-not $loc -or $loc -eq 'None') { $loc = 'us-east-1' } elseif ($loc -eq 'EU') { $loc = 'eu-west-1' }
                if (-not $byRegion[$loc]) { $byRegion[$loc] = [System.Collections.Generic.List[string]]::new() }; $byRegion[$loc].Add([string]$b.Name)
                $brows.Add(@{ execution_id = $E; account_id = $A; region = $loc; bucket_name = [string]$b.Name; created = (ConvertTo-ADate (Get-AValue $b 'CreationDate')); size_bytes = 0L; standard_bytes = 0L; ia_bytes = 0L; archive_bytes = 0L; objects = $null })
            }
            # tamanho pelas métricas diárias do S3 (sem listar objetos)
            $classes = [ordered]@{ StandardStorage = 'standard_bytes'; IntelligentTieringFAStorage = 'standard_bytes'; StandardIAStorage = 'ia_bytes'; OneZoneIAStorage = 'ia_bytes'; IntelligentTieringIAStorage = 'ia_bytes'; GlacierInstantRetrievalStorage = 'archive_bytes'; GlacierStorage = 'archive_bytes'; DeepArchiveStorage = 'archive_bytes' }
            foreach ($loc in $byRegion.Keys) {
                foreach ($cls in $classes.Keys) {
                    try { $st = Get-AwsMetricStats -Region $loc -Namespace 'AWS/S3' -Metric 'BucketSizeBytes' -DimensionName 'BucketName' -Ids @($byRegion[$loc]) -Stats @('Maximum') -Days 3 -ExtraDimensions @{ StorageType = $cls } }
                    catch { if (Test-AwsDenied $_.Exception.Message) { throw }; continue }
                    foreach ($name in $st.Keys) { $row = $brows | Where-Object { $_.bucket_name -eq $name } | Select-Object -First 1; if ($row) { $v = [long]$st[$name]['Maximum']; $row[$classes[$cls]] += $v; $row.size_bytes += $v } }
                }
                try { $oc = Get-AwsMetricStats -Region $loc -Namespace 'AWS/S3' -Metric 'NumberOfObjects' -DimensionName 'BucketName' -Ids @($byRegion[$loc]) -Stats @('Maximum') -Days 3 -ExtraDimensions @{ StorageType = 'AllStorageTypes' }
                      foreach ($name in $oc.Keys) { $row = $brows | Where-Object { $_.bucket_name -eq $name } | Select-Object -First 1; if ($row) { $row.objects = [long]$oc[$name]['Maximum'] } } } catch { }
            }
            & $bulk 'aws_buckets' @('execution_id', 'account_id', 'region', 'bucket_name', 'created', 'size_bytes', 'standard_bytes', 'ia_bytes', 'archive_bytes', 'objects') $brows
            & $step 'Armazenamento' 100 'OK'
            $ebsGb = ($vols | Where-Object { $_.volume_type -ne 'efs' } | Measure-Object -Property size_gb -Sum).Sum
            "$($vols.Count) volumes ($ebsGb GB) · $($brows.Count) buckets S3"
        }

        & $run 'aws_database' {
            & $clear $aDefs.aws_database.tables
            $dbs = [System.Collections.Generic.List[hashtable]]::new(); $n = 0
            foreach ($r in $script:regions) {
                $n++; & $step 'Bancos de dados' ([int](95 * $n / [math]::Max(1, $script:regions.Count))) "Região $r"
                try { $res = Invoke-Aws -Arguments @('rds', 'describe-db-instances') -Region $r }
                catch { if (Test-AwsDenied $_.Exception.Message) { throw }; continue }
                $list = @(Get-AList $res 'DBInstances')
                if ($list.Count) { Get-AwsTypeInfo -Region $r -Types @($list | ForEach-Object { ([string]$_.DBInstanceClass) -replace '^db\.', '' }) }
                foreach ($d in $list) {
                    $t = $script:typeCache[(([string]$d.DBInstanceClass) -replace '^db\.', '')]
                    $dbs.Add(@{ execution_id = $E; account_id = $A; region = $r; kind = 'rds'; identifier = [string]$d.DBInstanceIdentifier; engine = [string]$d.Engine; engine_version = [string](Get-AValue $d 'EngineVersion')
                        instance_class = [string]$d.DBInstanceClass; vcpu = $(if ($t) { $t.vcpu } else { $null }); memory_mib = $(if ($t) { $t.mem } else { $null }); storage_gb = (Get-AValue $d 'AllocatedStorage')
                        multi_az = [bool](Get-AValue $d 'MultiAZ'); license_model = [string](Get-AValue $d 'LicenseModel'); status = [string](Get-AValue $d 'DBInstanceStatus') })
                }
                try {
                    foreach ($tn in (Get-AList (Invoke-Aws -Arguments @('dynamodb', 'list-tables') -Region $r) 'TableNames')) {
                        $dt = try { Get-AValue (Invoke-Aws -Arguments @('dynamodb', 'describe-table', '--table-name', [string]$tn) -Region $r) 'Table' } catch { $null }
                        $dbs.Add(@{ execution_id = $E; account_id = $A; region = $r; kind = 'dynamodb'; identifier = [string]$tn; engine = 'dynamodb'; engine_version = $null; instance_class = [string](Get-AValue $dt 'BillingModeSummary.BillingMode')
                            vcpu = $null; memory_mib = $null; storage_gb = $(if ($dt) { [math]::Round([double](Get-AValue $dt 'TableSizeBytes') / 1GB, 2) } else { $null }); multi_az = $true; license_model = $null; status = [string](Get-AValue $dt 'TableStatus') })
                    }
                } catch { }
                try {
                    foreach ($cc in (Get-AList (Invoke-Aws -Arguments @('elasticache', 'describe-cache-clusters') -Region $r) 'CacheClusters')) {
                        $dbs.Add(@{ execution_id = $E; account_id = $A; region = $r; kind = 'elasticache'; identifier = [string]$cc.CacheClusterId; engine = [string]$cc.Engine; engine_version = [string](Get-AValue $cc 'EngineVersion'); instance_class = [string](Get-AValue $cc 'CacheNodeType')
                            vcpu = $null; memory_mib = $null; storage_gb = $null; multi_az = $false; license_model = $null; status = [string](Get-AValue $cc 'CacheClusterStatus') })
                    }
                } catch { }
            }
            & $bulk 'aws_databases' @('execution_id', 'account_id', 'region', 'kind', 'identifier', 'engine', 'engine_version', 'instance_class', 'vcpu', 'memory_mib', 'storage_gb', 'multi_az', 'license_model', 'status') $dbs
            & $step 'Bancos de dados' 100 'OK'
            "$(@($dbs | Where-Object { $_.kind -eq 'rds' }).Count) RDS · $(@($dbs | Where-Object { $_.kind -eq 'dynamodb' }).Count) DynamoDB · $(@($dbs | Where-Object { $_.kind -eq 'elasticache' }).Count) ElastiCache"
        }

        & $run 'aws_network' {
            & $clear $aDefs.aws_network.tables
            $net = [System.Collections.Generic.List[hashtable]]::new(); $n = 0
            $add = { param($r, $k, $id, $nm, $d) $net.Add(@{ execution_id = $E; account_id = $A; region = $r; kind = $k; resource_id = [string]$id; name = [string]$nm; detail = [string]$d }) }
            foreach ($r in $script:regions) {
                $n++; & $step 'Rede' ([int](85 * $n / [math]::Max(1, $script:regions.Count))) "Região $r"
                try { $v = Invoke-Aws -Arguments @('ec2', 'describe-vpcs') -Region $r } catch { if (Test-AwsDenied $_.Exception.Message) { throw }; continue }
                foreach ($x in (Get-AList $v 'Vpcs')) { & $add $r 'vpc' $x.VpcId (Get-ATag $x @('Name')) "$(Get-AValue $x 'CidrBlock')$(if (Get-AValue $x 'IsDefault') { ' · padrão' })" }
                try { foreach ($x in (Get-AList (Invoke-Aws -Arguments @('ec2', 'describe-vpn-connections') -Region $r) 'VpnConnections')) { & $add $r 'vpn' $x.VpnConnectionId (Get-ATag $x @('Name')) ([string](Get-AValue $x 'State')) } } catch { }
                try { foreach ($x in (Get-AList (Invoke-Aws -Arguments @('ec2', 'describe-nat-gateways') -Region $r) 'NatGateways')) { & $add $r 'nat' $x.NatGatewayId (Get-ATag $x @('Name')) ([string](Get-AValue $x 'State')) } } catch { }
                try { foreach ($x in (Get-AList (Invoke-Aws -Arguments @('ec2', 'describe-transit-gateways') -Region $r) 'TransitGateways')) { & $add $r 'tgw' $x.TransitGatewayId (Get-ATag $x @('Name')) ([string](Get-AValue $x 'State')) } } catch { }
                try { foreach ($x in (Get-AList (Invoke-Aws -Arguments @('elbv2', 'describe-load-balancers') -Region $r) 'LoadBalancers')) { & $add $r "lb-$([string](Get-AValue $x 'Type'))" $x.LoadBalancerName $x.LoadBalancerName "$(Get-AValue $x 'Scheme')" } } catch { }
                try { foreach ($x in (Get-AList (Invoke-Aws -Arguments @('elb', 'describe-load-balancers') -Region $r) 'LoadBalancerDescriptions')) { & $add $r 'lb-classic' $x.LoadBalancerName $x.LoadBalancerName "$(Get-AValue $x 'Scheme')" } } catch { }
                try { foreach ($x in (Get-AList (Invoke-Aws -Arguments @('directconnect', 'describe-connections') -Region $r) 'connections')) { & $add $r 'directconnect' $x.connectionId $x.connectionName "$(Get-AValue $x 'bandwidth') · $(Get-AValue $x 'location')" } } catch { }
            }
            & $step 'Rede' 90 'DNS e CDN'
            try { foreach ($x in (Get-AList (Invoke-Aws -Arguments @('route53', 'list-hosted-zones')) 'HostedZones')) { & $add 'global' 'route53' $x.Id $x.Name "$(Get-AValue $x 'ResourceRecordSetCount') registros$(if (Get-AValue $x 'Config.PrivateZone') { ' · privada' })" } } catch { }
            try { foreach ($x in (Get-AList (Invoke-Aws -Arguments @('cloudfront', 'list-distributions')) 'DistributionList.Items')) { & $add 'global' 'cloudfront' $x.Id $x.DomainName ([string](Get-AValue $x 'Status')) } } catch { }
            & $bulk 'aws_network' @('execution_id', 'account_id', 'region', 'kind', 'resource_id', 'name', 'detail') $net
            & $step 'Rede' 100 'OK'
            "$(@($net | Where-Object { $_.kind -eq 'vpc' }).Count) VPCs · $(@($net | Where-Object { $_.kind -like 'lb-*' }).Count) load balancers · $(@($net | Where-Object { $_.kind -in 'vpn', 'directconnect' }).Count) conexões híbridas"
        }

        & $run 'aws_cost' {
            & $clear $aDefs.aws_cost.tables
            & $step 'Custos' 30 'Cost Explorer (6 meses)'
            $end = (Get-Date).ToUniversalTime().ToString('yyyy-MM-01'); $start = (Get-Date).ToUniversalTime().AddMonths(-6).ToString('yyyy-MM-01')
            $res = Invoke-Aws -Arguments @('ce', 'get-cost-and-usage', '--time-period', "Start=$start,End=$end", '--granularity', 'MONTHLY', '--metrics', 'UnblendedCost', '--group-by', 'Type=DIMENSION,Key=SERVICE')
            $rows = [System.Collections.Generic.List[hashtable]]::new()
            foreach ($p in (Get-AList $res 'ResultsByTime')) {
                foreach ($g in (Get-AList $p 'Groups')) {
                    $amt = [double](Get-AValue $g 'Metrics.UnblendedCost.Amount'); if ($amt -lt 0.01) { continue }
                    $rows.Add(@{ execution_id = $E; account_id = $A; month = [datetime](Get-AValue $p 'TimePeriod.Start'); service = [string]@(Get-AList $g 'Keys')[0]; amount = [math]::Round($amt, 2); currency = [string](Get-AValue $g 'Metrics.UnblendedCost.Unit') })
                }
            }
            & $bulk 'aws_costs' @('execution_id', 'account_id', 'month', 'service', 'amount', 'currency') $rows
            & $step 'Custos' 100 'OK'
            $last = ($rows | Group-Object { $_.month } | Sort-Object Name | Select-Object -Last 1)
            "$($rows.Count) linhas · último mês US$ $([math]::Round(($last.Group | Measure-Object -Property amount -Sum).Sum, 2))"
        }

        if ($script:skipped.Count) { Write-Log -Level INFO -Module 'AWS' -Message "Pulados (região sem o serviço ou não habilitada): $(($script:skipped | Select-Object -Unique) -join ', ')" }
        $states = @($workloads.Values | ForEach-Object { $_.status })
        $ok = @($states | Where-Object { $_ -eq 'ok' }).Count
        $finalStatus = if ($ok -eq $states.Count) { 'completed' } elseif ($ok -gt 0) { 'partial' } else { 'failed' }
        if ($finalStatus -ne 'completed') { $finalError = (@($workloads.Values | Where-Object { $_.status -eq 'failed' } | ForEach-Object { "$($_.label): $($_.detail)" }) -join "`n") }
        Complete-ExecutionHistory -Status $(if ($ok -gt 0) { 'completed' } else { 'failed' }) -Connection $dbConn -TotalSites $script:instanceCount
        Write-Log -Level $(if ($finalStatus -eq 'completed') { 'SUCCESS' } else { 'WARNING' }) -Module 'AWS' -Message "Levantamento encerrado: $finalStatus ($ok de $($states.Count) módulos)."
    }
} catch {
    $finalError = $_.Exception.Message
    Write-Log -Level CRITICAL -Module 'AWS' -Message 'Falha no levantamento da AWS.' -Exception $finalError
    foreach ($k in @($workloads.Keys)) { if ($workloads[$k].status -in 'pending', 'running') { $workloads[$k].status = 'skipped'; $workloads[$k].detail = 'Interrompido por falha geral.' } }
    if ($null -ne $dbConn -and -not $diagnostic) { Complete-ExecutionHistory -Status 'failed' -Connection $dbConn }
} finally {
    Remove-Item Env:AWS_ACCESS_KEY_ID, Env:AWS_SECRET_ACCESS_KEY -ErrorAction SilentlyContinue
    if ($null -ne $dbConn) { try { Close-DbConnection -Connection $dbConn } catch { } }
    $sync.Stop = $true
    Wait-Job $reporter -Timeout 90 | Out-Null
    Remove-Job $reporter -Force -ErrorAction SilentlyContinue
    try {
        $files = @(Get-ChildItem $logDir -Filter '*.log' -ErrorAction SilentlyContinue | Sort-Object Name)
        if ($files.Count) {
            $ms = [IO.MemoryStream]::new()
            $gz = [IO.Compression.GZipStream]::new($ms, [IO.Compression.CompressionLevel]::Optimal, $true)
            foreach ($f in $files) { $b = [IO.File]::ReadAllBytes($f.FullName); $gz.Write($b, 0, $b.Length) }
            $gz.Dispose()
            Invoke-RestMethod -Uri "$CallbackUrl/log" -Method Post -Headers $headers -ContentType 'application/gzip' -Body $ms.ToArray() -TimeoutSec 300 | Out-Null
        }
    } catch { Write-Host "[Job] Não foi possível enviar o log completo: $($_.Exception.Message)" -ForegroundColor Yellow }
}
$final = @{ status = $finalStatus; totalSites = $script:instanceCount; workloads = $workloads; preflight = $preflight }
if ($finalError) { $final.error = $finalError }
if (-not (Send-PortalEvent -Body $final)) { Write-Host '[Job] Não foi possível reportar o resultado final ao portal.' -ForegroundColor Yellow }
