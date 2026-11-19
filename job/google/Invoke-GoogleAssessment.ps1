# ==============================================================================
#  CT Assessment 365 SaaS | Levantamento Google Workspace (migração ao Microsoft 365)
# ------------------------------------------------------------------------------
#  Dot-source no Invoke-SaasAssessment.ps1 quando auth.platform = google (usa
#  $config, $global:auth/params, $reporter/$sync, $logDir, Send-PortalEvent e as
#  funções de banco do coletor). Cada módulo é isolado (um escopo não liberado
#  derruba só o módulo dele) e grava nas tabelas g_* (migração tenant 003).
#  Numa retomada da mesma execução, apaga o que o módulo já tinha gravado e refaz
#  (os dados vêm agregados: refazer custa pouco).
# ==============================================================================
if (-not (Get-Command New-GoogleAssertion -ErrorAction SilentlyContinue)) { . (Join-Path $PSScriptRoot 'Google.ps1') }

$diagnostic = [bool]$global:params['diagnostic_only']
$customer = if ($global:auth.google_customer) { [string]$global:auth.google_customer } else { 'my_customer' }
$domain = [string]$global:auth.google_domain
$dir = 'https://admin.googleapis.com/admin/directory/v1'

$gDefs = [ordered]@{
    g_identity  = @{ label = 'Identidades';       area = 'identity';  tables = @('g_users', 'g_groups', 'g_orgunits', 'g_domains') }
    g_usage     = @{ label = 'E-mail e Drive';    area = 'usage';     tables = @() }   # atualiza g_users
    g_licensing = @{ label = 'Licenças';          area = 'licensing'; tables = @('g_licenses') }
    g_resources = @{ label = 'Salas e recursos';  area = 'resources'; tables = @('g_resources') }
    g_devices   = @{ label = 'Dispositivos';      area = 'devices';   tables = @('g_devices') }
}
$workloads = [ordered]@{}
foreach ($k in $gDefs.Keys) { if ($global:params[$k] -and -not $diagnostic) { $workloads[$k] = [ordered]@{ label = $gDefs[$k].label; status = 'pending'; detail = ''; seconds = 0 } } }
$preflight = [ordered]@{ graph = $null; permissions = $null; sharepoint = $null; database = $null }
function Send-GState { [void](Send-PortalEvent -Body @{ workloads = $workloads; preflight = $preflight }) }
function Set-GWorkload([string]$Id, [string]$Status, [string]$Detail = '', [double]$Seconds = 0) {
    if (-not $workloads.Contains($Id)) { return }
    $workloads[$Id].status = $Status; $workloads[$Id].detail = $Detail
    if ($Seconds) { $workloads[$Id].seconds = [math]::Round($Seconds) }
    Send-GState
}

$dbConn = $null; $finalStatus = 'failed'; $finalError = $null; $userCount = 0
try {
    # ── checagem prévia: um token por área (mostra exatamente qual escopo falta) ──
    $granted = [System.Collections.Generic.List[string]]::new(); $missingScopes = [System.Collections.Generic.List[string]]::new()
    foreach ($area in $script:GScopes.Keys) {
        try { [void](Get-GoogleToken -Area $area); foreach ($s in $script:GScopes[$area]) { $granted.Add("Google:$($s.Replace('https://www.googleapis.com/auth/', ''))") } }
        catch { foreach ($s in $script:GScopes[$area]) { $missingScopes.Add($s.Replace('https://www.googleapis.com/auth/', '')) } }
    }
    $preflight.permissions = [ordered]@{ ok = $true; checked = $true; granted = @($granted); detail = $(if ($missingScopes.Count) { "Escopos sem delegação: $($missingScopes -join ', ')" } else { '' }) }
    if ($granted.Count -eq 0) {
        $preflight.graph = [ordered]@{ ok = $false; detail = "A conta de serviço não conseguiu token para nenhum escopo. Confira a delegação em todo o domínio (ID do cliente da conta) e o administrador $($global:auth.google_admin)." }
        throw $preflight.graph.detail
    }
    $who = try { (Invoke-GoogleApi -Area identity -Uri "$dir/customer/$customer/domains" -Items domains) } catch { $null }
    $preflight.graph = [ordered]@{ ok = $true; detail = "Google Workspace: $domain$(if ($who) { " · $(@($who).Count) domínio(s)" })"; tenant = $domain }
    Write-Log -Level SUCCESS -Module 'Google' -Message "Conexão com o Google Workspace OK ($domain) como $($global:auth.google_admin)."

    $dbConn = New-DbConnection -MaxRetries 3
    $preflight.database = [ordered]@{ ok = $true; detail = "$($global:auth.server)/$($global:auth.database)" }
    Send-GState

    if ($diagnostic) {
        $finalStatus = if ($missingScopes.Count) { 'partial' } else { 'completed' }
        if ($missingScopes.Count) { $finalError = "Faltam escopos na delegação: $($missingScopes -join ', ')" }
    } else {
        $prev = Invoke-DbReader -Connection $dbConn -Query 'SELECT status FROM dbo.execution_history WHERE execution_id = @e' -Parameters @{ '@e' = $global:executionId }
        if ($null -ne $prev -and $prev.Count -gt 0) {
            Invoke-DbNonQuery -Connection $dbConn -Query "UPDATE dbo.execution_history SET status = 'running', end_time = NULL WHERE execution_id = @e" -Parameters @{ '@e' = $global:executionId } | Out-Null
            Write-Log -Level WARNING -Module 'Google' -Message 'Retomando o levantamento: os módulos são refeitos do zero.'
        } else { Start-ExecutionHistory -Connection $dbConn }

        $clear = { param([string[]]$Tables) foreach ($t in $Tables) { Invoke-DbNonQuery -Connection $dbConn -Query "DELETE FROM dbo.$t WHERE execution_id = @e" -Parameters @{ '@e' = $global:executionId } -TimeoutSeconds 600 | Out-Null } }
        $run = {
            param([string]$Id, [scriptblock]$Body)
            if (-not $workloads.Contains($Id)) { return }
            $sw = [Diagnostics.Stopwatch]::StartNew(); Set-GWorkload $Id 'running'
            try { $detail = & $Body; Set-GWorkload $Id 'ok' ([string]$detail) $sw.Elapsed.TotalSeconds }
            catch { Write-Log -Level ERROR -Module 'Google' -Message "Módulo '$Id' falhou; seguindo com os demais." -Exception $_.Exception.Message; Set-GWorkload $Id 'failed' $_.Exception.Message $sw.Elapsed.TotalSeconds }
        }

        & $run 'g_identity' {
            & $clear $gDefs.g_identity.tables
            Report-Step -StepName 'Google · Identidades' -Status 'in progress' -Progress 10 -Info 'Domínios e unidades organizacionais'
            $doms = Invoke-GoogleApi -Area identity -Uri "$dir/customer/$customer/domains" -Items domains
            $drows = foreach ($d in $doms) {
                @{ execution_id = $global:executionId; domain_name = [string]$d.domainName; is_primary = [bool](Get-GValue $d 'isPrimary'); verified = [bool](Get-GValue $d 'verified'); is_alias = $false; parent_domain = $null }
                foreach ($a in @(Get-GValue $d 'domainAliases')) { if ($a) { @{ execution_id = $global:executionId; domain_name = [string]$a.domainAliasName; is_primary = $false; verified = [bool](Get-GValue $a 'verified'); is_alias = $true; parent_domain = [string]$d.domainName } } }
            }
            [void](Invoke-DbBulkInsert -Connection $dbConn -DestinationTable 'dbo.g_domains' -DataTable (New-GTable @('execution_id', 'domain_name', 'is_primary', 'verified', 'is_alias', 'parent_domain') @($drows)))
            $ous = Invoke-GoogleApi -Area identity -Uri "$dir/customer/$customer/orgunits?type=ALL" -Items organizationUnits
            $orows = foreach ($o in $ous) { @{ execution_id = $global:executionId; org_unit_path = [string]$o.orgUnitPath; name = [string](Get-GValue $o 'name'); parent_path = [string](Get-GValue $o 'parentOrgUnitPath'); description = [string](Get-GValue $o 'description') } }
            [void](Invoke-DbBulkInsert -Connection $dbConn -DestinationTable 'dbo.g_orgunits' -DataTable (New-GTable @('execution_id', 'org_unit_path', 'name', 'parent_path', 'description') @($orows)))

            Report-Step -StepName 'Google · Identidades' -Status 'in progress' -Progress 30 -Info 'Usuários'
            $users = Invoke-GoogleApi -Area identity -Uri "$dir/users?customer=$customer&maxResults=500&projection=basic&orderBy=email" -Items users
            $script:userCount = @($users).Count
            $urows = foreach ($u in $users) {
                $al = @(@(Get-GValue $u 'aliases') + @(Get-GValue $u 'nonEditableAliases') | Where-Object { $_ })
                @{ execution_id = $global:executionId; user_id = [string](Get-GValue $u 'id'); primary_email = [string]$u.primaryEmail; full_name = [string](Get-GValue $u 'name.fullName')
                   org_unit_path = [string](Get-GValue $u 'orgUnitPath'); suspended = [bool](Get-GValue $u 'suspended'); archived = [bool](Get-GValue $u 'archived')
                   is_admin = [bool](Get-GValue $u 'isAdmin'); is_delegated_admin = [bool](Get-GValue $u 'isDelegatedAdmin'); is_2sv_enrolled = [bool](Get-GValue $u 'isEnrolledIn2Sv'); is_2sv_enforced = [bool](Get-GValue $u 'isEnforcedIn2Sv')
                   created_at = (ConvertTo-GDate (Get-GValue $u 'creationTime')); last_login = (ConvertTo-GDate (Get-GValue $u 'lastLoginTime'))
                   aliases_count = $al.Count; aliases = ($al -join ';') }
            }
            [void](Invoke-DbBulkInsert -Connection $dbConn -DestinationTable 'dbo.g_users' -DataTable (New-GTable @('execution_id', 'user_id', 'primary_email', 'full_name', 'org_unit_path', 'suspended', 'archived', 'is_admin', 'is_delegated_admin', 'is_2sv_enrolled', 'is_2sv_enforced', 'created_at', 'last_login', 'aliases_count', 'aliases') @($urows)))

            Report-Step -StepName 'Google · Identidades' -Status 'in progress' -Progress 70 -Info 'Grupos'
            $groups = Invoke-GoogleApi -Area identity -Uri "$dir/groups?customer=$customer&maxResults=200" -Items groups
            $grows = foreach ($g in $groups) { @{ execution_id = $global:executionId; email = [string]$g.email; name = [string](Get-GValue $g 'name'); direct_members = [long](Get-GValue $g 'directMembersCount'); aliases_count = @(Get-GValue $g 'aliases' | Where-Object { $_ }).Count; description = [string](Get-GValue $g 'description') } }
            [void](Invoke-DbBulkInsert -Connection $dbConn -DestinationTable 'dbo.g_groups' -DataTable (New-GTable @('execution_id', 'email', 'name', 'direct_members', 'aliases_count', 'description') @($grows)))
            Report-Step -StepName 'Google · Identidades' -Status 'completed' -Progress 100 -Info 'OK'
            Write-Log -Level SUCCESS -Module 'Google' -Message "Identidades: $(@($users).Count) usuários, $(@($groups).Count) grupos, $(@($ous).Count) unidades, $(@($drows).Count) domínios."
            "$(@($users).Count) usuários · $(@($groups).Count) grupos"
        }

        & $run 'g_usage' {
            # O relatório do Google fica disponível com 2 a 3 dias de atraso: procura a data mais recente com dados
            $report = $null; $date = $null
            for ($back = 2; $back -le 10 -and -not $report; $back++) {
                $d = (Get-Date).ToUniversalTime().AddDays(-$back).ToString('yyyy-MM-dd')
                Report-Step -StepName 'Google · E-mail e Drive' -Status 'in progress' -Progress 10 -Info "Relatório de uso de $d"
                $rows = @(Invoke-GoogleApi -Area usage -Uri "https://admin.googleapis.com/admin/reports/v1/usage/users/all/dates/$($d)?maxResults=1000" -Items usageReports | Where-Object { $null -ne $_ })
                if ($rows.Count -gt 0) { $report = $rows; $date = $d }
            }
            if (-not $report) { throw 'O Google não devolveu relatório de uso nos últimos 10 dias.' }
            $num = { param($p, [string]$n) $x = $p[$n]; if ($null -eq $x) { return [DBNull]::Value }; $v = Get-GValue $x 'intValue'; if ($null -ne $v) { return [long]$v }; return [DBNull]::Value }
            $dt = { param($p, [string]$n) $x = $p[$n]; if ($null -eq $x) { return [DBNull]::Value }; ConvertTo-GDate (Get-GValue $x 'datetimeValue') }
            $tmp = [System.Collections.Generic.List[hashtable]]::new()
            foreach ($r in $report) {
                $p = @{}; foreach ($x in @(Get-GValue $r 'parameters')) { if ($x) { $p[[string]$x.name] = $x } }
                $tmp.Add(@{ email = [string](Get-GValue $r 'entity.userEmail'); gmail_mb = (& $num $p 'accounts:gmail_used_quota_in_mb'); drive_mb = (& $num $p 'accounts:drive_used_quota_in_mb')
                    photos_mb = (& $num $p 'accounts:gplus_photos_used_quota_in_mb'); used_quota_mb = (& $num $p 'accounts:used_quota_in_mb'); total_quota_mb = (& $num $p 'accounts:total_quota_in_mb')
                    gmail_last_activity = (& $dt $p 'gmail:last_interaction_time'); drive_last_activity = (& $dt $p 'drive:last_active_usage_time')
                    drive_items_owned = (& $num $p 'drive:num_owned_items_total'); drive_items_external = (& $num $p 'drive:num_owned_items_with_visibility_shared_externally')
                    drive_items_anyone_link = (& $num $p 'drive:num_owned_items_with_visibility_anyone_with_link'); report_date = [datetime]$date })
            }
            # carrega numa tabela temporária e atualiza g_users de uma vez
            Invoke-DbNonQuery -Connection $dbConn -Query "IF OBJECT_ID('tempdb..#gu') IS NOT NULL DROP TABLE #gu; CREATE TABLE #gu (email NVARCHAR(320), gmail_mb BIGINT, drive_mb BIGINT, photos_mb BIGINT, used_quota_mb BIGINT, total_quota_mb BIGINT, gmail_last_activity DATETIME2, drive_last_activity DATETIME2, drive_items_owned BIGINT, drive_items_external BIGINT, drive_items_anyone_link BIGINT, report_date DATE)" | Out-Null
            $cols = @('email', 'gmail_mb', 'drive_mb', 'photos_mb', 'used_quota_mb', 'total_quota_mb', 'gmail_last_activity', 'drive_last_activity', 'drive_items_owned', 'drive_items_external', 'drive_items_anyone_link', 'report_date')
            [void](Invoke-DbBulkInsert -Connection $dbConn -DestinationTable '#gu' -DataTable (New-GTable $cols @($tmp)))
            Invoke-DbNonQuery -Connection $dbConn -TimeoutSeconds 600 -Parameters @{ '@e' = $global:executionId } -Query @"
UPDATE u SET u.gmail_mb = g.gmail_mb, u.drive_mb = g.drive_mb, u.photos_mb = g.photos_mb, u.used_quota_mb = g.used_quota_mb, u.total_quota_mb = g.total_quota_mb,
  u.gmail_last_activity = g.gmail_last_activity, u.drive_last_activity = g.drive_last_activity, u.drive_items_owned = g.drive_items_owned,
  u.drive_items_external = g.drive_items_external, u.drive_items_anyone_link = g.drive_items_anyone_link, u.report_date = g.report_date
FROM dbo.g_users u JOIN #gu g ON g.email = u.primary_email WHERE u.execution_id = @e; DROP TABLE #gu;
"@ | Out-Null
            Report-Step -StepName 'Google · E-mail e Drive' -Status 'completed' -Progress 100 -Info "Relatório de $date"
            Write-Log -Level SUCCESS -Module 'Google' -Message "Uso de e-mail e Drive de $(@($report).Count) usuários (relatório de $date)."
            "$(@($report).Count) usuários · relatório de $date"
        }

        & $run 'g_licensing' {
            & $clear $gDefs.g_licensing.tables
            $lic = Invoke-GoogleApi -Area licensing -Uri "https://licensing.googleapis.com/apps/licensing/v1/product/Google-Apps/users?customerId=$([uri]::EscapeDataString($domain))&maxResults=1000" -Items items
            $lrows = foreach ($l in $lic) { @{ execution_id = $global:executionId; product_id = [string](Get-GValue $l 'productId'); sku_id = [string](Get-GValue $l 'skuId'); sku_name = [string](Get-GValue $l 'skuName'); user_email = [string](Get-GValue $l 'userId') } }
            [void](Invoke-DbBulkInsert -Connection $dbConn -DestinationTable 'dbo.g_licenses' -DataTable (New-GTable @('execution_id', 'product_id', 'sku_id', 'sku_name', 'user_email') @($lrows)))
            "$(@($lic).Count) licenças atribuídas"
        }

        & $run 'g_resources' {
            & $clear $gDefs.g_resources.tables
            $res = Invoke-GoogleApi -Area resources -Uri "$dir/customer/$customer/resources/calendars?maxResults=500" -Items items
            $rrows = foreach ($r in $res) { @{ execution_id = $global:executionId; resource_email = [string](Get-GValue $r 'resourceEmail'); name = [string](Get-GValue $r 'resourceName'); resource_type = [string](Get-GValue $r 'resourceType'); category = [string](Get-GValue $r 'resourceCategory'); capacity = $(if (Get-GValue $r 'capacity') { [int](Get-GValue $r 'capacity') } else { $null }); building_id = [string](Get-GValue $r 'buildingId') } }
            [void](Invoke-DbBulkInsert -Connection $dbConn -DestinationTable 'dbo.g_resources' -DataTable (New-GTable @('execution_id', 'resource_email', 'name', 'resource_type', 'category', 'capacity', 'building_id') @($rrows)))
            "$(@($res).Count) recursos"
        }

        & $run 'g_devices' {
            & $clear $gDefs.g_devices.tables
            $mob = Invoke-GoogleApi -Area devices -Uri "$dir/customer/$customer/devices/mobile?maxResults=100&projection=BASIC" -Items mobiledevices
            $chr = Invoke-GoogleApi -Area devices -Uri "$dir/customer/$customer/devices/chromeos?maxResults=200&projection=BASIC" -Items chromeosdevices
            $vrows = @(
                foreach ($m in $mob) { @{ execution_id = $global:executionId; device_kind = 'mobile'; device_id = [string](Get-GValue $m 'resourceId'); model = [string](Get-GValue $m 'model'); os = [string](Get-GValue $m 'os'); owner_email = (@(Get-GValue $m 'email') -join ';'); status = [string](Get-GValue $m 'status'); last_sync = (ConvertTo-GDate (Get-GValue $m 'lastSync')) } }
                foreach ($c in $chr) { @{ execution_id = $global:executionId; device_kind = 'chromeos'; device_id = [string](Get-GValue $c 'deviceId'); model = [string](Get-GValue $c 'model'); os = [string](Get-GValue $c 'osVersion'); owner_email = [string](Get-GValue $c 'annotatedUser'); status = [string](Get-GValue $c 'status'); last_sync = (ConvertTo-GDate (Get-GValue $c 'lastSync')) } }
            )
            [void](Invoke-DbBulkInsert -Connection $dbConn -DestinationTable 'dbo.g_devices' -DataTable (New-GTable @('execution_id', 'device_kind', 'device_id', 'model', 'os', 'owner_email', 'status', 'last_sync') $vrows))
            "$(@($mob).Count) celulares · $(@($chr).Count) Chromebooks"
        }

        $states = @($workloads.Values | ForEach-Object { $_.status })
        $ok = @($states | Where-Object { $_ -eq 'ok' }).Count
        $finalStatus = if ($ok -eq $states.Count) { 'completed' } elseif ($ok -gt 0) { 'partial' } else { 'failed' }
        if ($finalStatus -ne 'completed') { $finalError = (@($workloads.Values | Where-Object { $_.status -eq 'failed' } | ForEach-Object { "$($_.label): $($_.detail)" }) -join "`n") }
        Complete-ExecutionHistory -Status $(if ($ok -gt 0) { 'completed' } else { 'failed' }) -Connection $dbConn -TotalSites $script:userCount
        Write-Log -Level $(if ($finalStatus -eq 'completed') { 'SUCCESS' } else { 'WARNING' }) -Module 'Google' -Message "Levantamento encerrado: $finalStatus ($ok de $($states.Count) módulos)."
    }
} catch {
    $finalError = $_.Exception.Message
    Write-Log -Level CRITICAL -Module 'Google' -Message 'Falha no levantamento do Google Workspace.' -Exception $finalError
    foreach ($k in @($workloads.Keys)) { if ($workloads[$k].status -in 'pending', 'running') { $workloads[$k].status = 'skipped'; $workloads[$k].detail = 'Interrompido por falha geral.' } }
    if ($null -ne $dbConn -and -not $diagnostic) { Complete-ExecutionHistory -Status 'failed' -Connection $dbConn }
} finally {
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
$final = @{ status = $finalStatus; totalSites = $script:userCount; workloads = $workloads; preflight = $preflight }
if ($finalError) { $final.error = $finalError }
if (-not (Send-PortalEvent -Body $final)) { Write-Host '[Job] Não foi possível reportar o resultado final ao portal.' -ForegroundColor Yellow }
