# ==============================================================================
#  CT Assessment 365 SaaS | Entrypoint do job de coleta
# ------------------------------------------------------------------------------
#  Roda o coletor do ct-assessmentspo (src/, copiado sem alterações por
#  scripts/sync-collector.sh) para UMA execução disparada pelo portal.
#
#  Diferenças para o src/main.ps1 do ct-assessmentspo:
#   - auth.json / params.json vêm do portal (GET CALLBACK_URL), não de arquivos;
#     a credencial do M365 e a senha do banco nunca ficam no disco nem na imagem
#     (o certificado PFX vai para um arquivo temporário apagado no fim).
#   - o execution_id é o id da execução no portal. Se o container reiniciar
#     (retry do Container Apps Job), a execução continua de onde parou usando o
#     mesmo mecanismo de resume do coletor (dbo.execution_progress).
#   - em vez do monitor local (Start-Monitor.ps1), uma thread envia ao portal o
#     global_status.json e as linhas novas do log a cada 10 s.
#  O bloco "7. EXECUCAO DOS MODULOS" espelha o main.ps1: ao sincronizar uma
#  versão nova do coletor, confira se a ordem/condições dos módulos mudou lá.
#
#  Uso: variáveis ASSESSMENT_ID, CALLBACK_URL e CALLBACK_TOKEN (ou parâmetros).
# ==============================================================================

#Requires -Version 7.2
param(
    [string] $AssessmentId  = $env:ASSESSMENT_ID,
    [string] $CallbackUrl   = $env:CALLBACK_URL,
    [string] $CallbackToken = $env:CALLBACK_TOKEN
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 3.0

$projectRoot = $PSScriptRoot
Set-Location $projectRoot

if (-not $AssessmentId -or -not $CallbackUrl -or -not $CallbackToken) {
    Write-Host 'Informe ASSESSMENT_ID, CALLBACK_URL e CALLBACK_TOKEN (variáveis de ambiente ou parâmetros).' -ForegroundColor Red
    exit 2
}

$headers = @{ Authorization = "Bearer $CallbackToken" }

function Send-PortalEvent {
    param([hashtable] $Body)
    $json = $Body | ConvertTo-Json -Depth 8 -Compress
    for ($i = 1; $i -le 5; $i++) {
        try {
            Invoke-RestMethod -Uri $CallbackUrl -Method Post -Headers $headers -ContentType 'application/json; charset=utf-8' `
                -Body ([System.Text.Encoding]::UTF8.GetBytes($json)) -TimeoutSec 60 | Out-Null
            return $true
        } catch {
            $code = try { [int]$_.Exception.Response.StatusCode } catch { 0 }
            if ($code -eq 409 -or $code -eq 401) { return $false }
            Start-Sleep -Seconds (3 * $i)
        }
    }
    return $false
}

# ------------------------------------------------------------------------------
# 1. CONFIGURAÇÃO DA EXECUÇÃO (portal)
# ------------------------------------------------------------------------------
Write-Host "[Job] Execução $AssessmentId — buscando configuração no portal..."
$config = $null
for ($i = 1; $i -le 8; $i++) {
    try {
        $config = Invoke-RestMethod -Uri $CallbackUrl -Method Get -Headers $headers -TimeoutSec 60
        break
    } catch {
        $code = try { [int]$_.Exception.Response.StatusCode } catch { 0 }
        if ($code -in 401, 404, 409) {
            # Execução cancelada/concluída/inexistente: nada a fazer, e um retry também não ajudaria.
            Write-Host "[Job] Portal recusou a execução (HTTP $code): $($_.ErrorDetails.Message). Encerrando." -ForegroundColor Yellow
            exit 0
        }
        Write-Host "[Job] Portal indisponível (tentativa $i/8): $($_.Exception.Message)" -ForegroundColor Yellow
        Start-Sleep -Seconds ([math]::Min(10 * $i, 60))
    }
}
if (-not $config) { Write-Host '[Job] Sem configuração do portal.' -ForegroundColor Red; exit 1 }

# ------------------------------------------------------------------------------
# 2. CARREGAMENTO DO COLETOR (mesma ordem do main.ps1)
# ------------------------------------------------------------------------------
. (Join-Path $projectRoot 'src\connection\Connect-Database.ps1')
. (Join-Path $projectRoot 'src\connection\Repository.ps1')
. (Join-Path $projectRoot 'src\connection\Connect-Graph.ps1')
. (Join-Path $projectRoot 'src\connection\Connect-SharePoint.ps1')
. (Join-Path $projectRoot 'src\utils\Write-Log.ps1')
. (Join-Path $projectRoot 'src\utils\Handle-Status.ps1')
. (Join-Path $projectRoot 'src\utils\Export-Csv.ps1')
. (Join-Path $projectRoot 'src\modules\Get-LicensingInfo.ps1')
. (Join-Path $projectRoot 'src\modules\Get-ActivityInfo.ps1')
. (Join-Path $projectRoot 'src\modules\Get-MailboxInfo.ps1')
. (Join-Path $projectRoot 'src\modules\Get-IntuneInfo.ps1')
. (Join-Path $projectRoot 'src\modules\Get-MeetingsInfo.ps1')
. (Join-Path $projectRoot 'src\modules\Get-SitesInfo.ps1')
. (Join-Path $projectRoot 'src\modules\Get-OwnerStatus.ps1')
. (Join-Path $projectRoot 'src\modules\Get-DataFiles.ps1')
. (Join-Path $projectRoot 'src\modules\Get-TrashItems.ps1')

$global:executionId = [string]$config.executionId
# Start-ExecutionHistory grava machine_name/user_name (no Linux essas variáveis não existem)
if (-not $env:COMPUTERNAME) { $env:COMPUTERNAME = "saas-$([Environment]::MachineName)" }
if (-not $env:USERNAME)     { $env:USERNAME = 'ct-assessment-saas' }

$logDir      = Join-Path $projectRoot 'logs'
$progressDir = Join-Path $projectRoot 'src\progress'
Initialize-Logger -LogDir $logDir
Initialize-Status -ProgressDir $progressDir

$global:auth   = $config.auth   | ConvertTo-Json -Depth 5 | ConvertFrom-Json -AsHashtable
$global:params = $config.params | ConvertTo-Json -Depth 5 | ConvertFrom-Json -AsHashtable
foreach ($k in 'tenant_id','client_id') { if ($global:auth[$k] -is [string]) { $global:auth[$k] = $global:auth[$k].Trim() } }

# O coletor roda com StrictMode e le chaves do auth.json/params.json que o arquivo original SEMPRE tem (mesmo vazias):
# ex. Get-SitesInfo passa $global:auth.client_secret tambem no modo certificado. Completa com os padroes dos
# *.example.json do ct-assessmentspo tudo o que o portal nao mandou.
$authDefaults = [ordered]@{
    client_secret = ''; cert_password = ''; cert_path = ''; connection = 'sql'; auth_mode = 'secret'
    proxy_url = ''; proxy_username = ''; proxy_password = ''; proxy_bypass = ''
}
foreach ($k in $authDefaults.Keys) { if (-not $global:auth.ContainsKey($k) -or $null -eq $global:auth[$k]) { $global:auth[$k] = $authDefaults[$k] } }
$paramsDefaults = [ordered]@{
    notifications = $false; notifications_interval = 1; notifications_webhook = ''
    process_licensing_info = $false; process_adoption_info = $false; process_mailbox_info = $false; process_intune_info = $false
    process_sites_info = $false; process_onedrive = $false; process_sites = $false; process_subsites = $false
    process_recycle_bin = $false; process_calendar = $false; process_owner_status = $false
    store_in_csv = $false; store_in_sql = $true; resume_last_execution = $true; force_new_execution = $false; resume_max_age_hours = 72
    sites = @(); users_meeting = @(); sql_batch_size = 500; sites_batch_size = 100; sites_parallel_size = 8
    sql_command_timeout = 120; graph_page_size = 999; output_data_format = 'yyyy-MM-dd HH:mm:ss'; comments = ''; diagnostic_only = $false
}
foreach ($k in $paramsDefaults.Keys) { if (-not $global:params.ContainsKey($k) -or $null -eq $global:params[$k]) { $global:params[$k] = $paramsDefaults[$k] } }

# Certificado: Get-GraphToken lê auth.cert_path; o PnP usa $global:base64Cert
$global:base64Cert = $null
$certTemp = $null
if ($global:auth.auth_mode -eq 'cert') {
    $global:base64Cert = [string]$config.certBase64
    $certTemp = Join-Path ([System.IO.Path]::GetTempPath()) "ct-$([guid]::NewGuid()).pfx"
    [System.IO.File]::WriteAllBytes($certTemp, [Convert]::FromBase64String($global:base64Cert))
    $global:auth.cert_path = $certTemp
}

# ------------------------------------------------------------------------------
# 3. THREAD DE REPORTE AO PORTAL (status + log a cada 10 s)
# ------------------------------------------------------------------------------
$sync = [hashtable]::Synchronized(@{ Stop = $false })
$reporter = Start-ThreadJob -Name 'portal-reporter' -ArgumentList $CallbackUrl, $CallbackToken, (Join-Path $progressDir 'global_status.json'), $logDir, $sync -ScriptBlock {
    param($url, $token, $statusFile, $logDir, $sync)
    $offsets = @{}
    $re = '^\[(?<ts>[^\]]+)\]\s+\[(?<lvl>[^\]]+)\]\s+\[(?<mod>[^\]]+)\]\s+(?<msg>.+)$'
    while ($true) {
        $last = $sync.Stop
        $body = @{}
        try {
            if (Test-Path $statusFile) {
                $raw = [System.IO.File]::ReadAllText($statusFile, [System.Text.Encoding]::UTF8)
                if ($raw) { $body.progress = $raw | ConvertFrom-Json -AsHashtable }
            }
        } catch { }
        $lines = [System.Collections.Generic.List[hashtable]]::new()
        try {
            foreach ($f in (Get-ChildItem $logDir -Filter '*.log' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime)) {
                $off = if ($offsets.ContainsKey($f.FullName)) { $offsets[$f.FullName] } else { 0L }
                if ($f.Length -le $off) { continue }
                $fs = [System.IO.File]::Open($f.FullName, 'Open', 'Read', 'ReadWrite')
                try {
                    [void]$fs.Seek($off, 'Begin')
                    $sr = [System.IO.StreamReader]::new($fs, [System.Text.Encoding]::UTF8)
                    $text = $sr.ReadToEnd()
                    # só consome até a última quebra de linha (linha incompleta fica para o próximo ciclo)
                    $cut = $text.LastIndexOf("`n")
                    if ($cut -lt 0) { continue }
                    $offsets[$f.FullName] = $off + [System.Text.Encoding]::UTF8.GetByteCount($text.Substring(0, $cut + 1))
                    foreach ($line in ($text.Substring(0, $cut) -split "`r?`n")) {
                        if ([string]::IsNullOrWhiteSpace($line)) { continue }
                        $e = @{ ts = ''; level = 'INFO'; module = ''; message = $line }
                        if ($line -match $re) { $e.ts = $Matches.ts; $e.level = $Matches.lvl.Trim(); $e.module = $Matches.mod.Trim(); $e.message = $Matches.msg.Trim() }
                        $lines.Add($e)
                    }
                } finally { $fs.Dispose() }
            }
        } catch { }
        if ($lines.Count -gt 0) { $body.log = @($lines | Select-Object -Last 300) }
        if ($body.Count -gt 0) {
            try {
                $json = $body | ConvertTo-Json -Depth 8 -Compress
                Invoke-RestMethod -Uri $url -Method Post -Headers @{ Authorization = "Bearer $token" } -ContentType 'application/json; charset=utf-8' `
                    -Body ([System.Text.Encoding]::UTF8.GetBytes($json)) -TimeoutSec 60 | Out-Null
            } catch {
                $code = try { [int]$_.Exception.Response.StatusCode } catch { 0 }
                if ($code -eq 409) {
                    # Cancelada no portal (no Container Apps o portal já para o container; aqui cobre execução manual/docker)
                    Write-Host '[Job] Execução cancelada no portal — encerrando o processo.' -ForegroundColor Yellow
                    [Environment]::Exit(0)
                }
            }
        }
        if ($last) { break }
        for ($i = 0; $i -lt 10 -and -not $sync.Stop; $i++) { Start-Sleep -Seconds 1 }
    }
}

# ------------------------------------------------------------------------------
# 4. CHECAGEM PRÉVIA + WORKLOADS ISOLADOS
#    Diferente do main.ps1 (que para no primeiro erro), cada workload tem o
#    próprio resultado: um workload que falha não derruba os outros, e os que
#    dependem dele (arquivos/lixeira/donos dependem da lista de sites) são pulados
#    com o motivo. Antes de começar, a checagem prévia testa Graph, permissões do
#    app, SharePoint Admin e banco, para pular com mensagem clara o que já se sabe
#    que vai falhar. Com params.diagnostic_only = true, roda só a checagem prévia
#    (é o "Testar conexão" do portal para quem usa certificado).
# ------------------------------------------------------------------------------
$dbConn = $null
$sitesColetados = @()
$finalStatus = 'failed'
$finalError = $null
$diagnostic = [bool]$global:params['diagnostic_only']

# Workloads na ordem do main.ps1: chave do params.json -> id, rótulo e permissões exigidas
$workloadDefs = @(
    @{ id = 'licensing';    flag = 'process_licensing_info'; label = 'Licenciamento';        graph = @('Organization.Read.All','Directory.Read.All') }
    @{ id = 'adoption';     flag = 'process_adoption_info';  label = 'Adoção';               graph = @('Reports.Read.All') }
    @{ id = 'mailbox';      flag = 'process_mailbox_info';   label = 'Caixas de e-mail';     graph = @('Reports.Read.All') }
    @{ id = 'intune';       flag = 'process_intune_info';    label = 'Dispositivos Intune';  graph = @('DeviceManagementManagedDevices.Read.All','DeviceManagementManagedDevices.ReadWrite.All') }
    @{ id = 'sites';        flag = 'process_sites_info';     label = 'Sites e subsites';     spo = $true }
    @{ id = 'owner_status'; flag = 'process_owner_status';   label = 'Donos ativos';         spo = $true; graph = @('User.Read.All','Directory.Read.All'); needsSites = $true }
    @{ id = 'files';        flag = 'process_sites';          label = 'Arquivos';             spo = $true; needsSites = $true }
    @{ id = 'trash';        flag = 'process_recycle_bin';    label = 'Lixeira';              spo = $true; needsSites = $true }
)
$workloads = [ordered]@{}
foreach ($w in $workloadDefs) {
    $on = [bool]$global:params[$w.flag]
    if ($w.id -eq 'files') { $on = [bool]$global:params.process_sites -or [bool]$global:params.process_subsites }
    if ($on -and -not $diagnostic) { $workloads[$w.id] = [ordered]@{ label = $w.label; status = 'pending'; detail = ''; seconds = 0 } }
}
$preflight = [ordered]@{ graph = $null; permissions = $null; sharepoint = $null; database = $null }

function Send-Workloads { [void](Send-PortalEvent -Body @{ workloads = $workloads; preflight = $preflight }) }

function Set-Workload([string]$Id, [string]$Status, [string]$Detail = '', [double]$Seconds = 0) {
    if (-not $workloads.Contains($Id)) { return }
    $workloads[$Id].status = $Status
    $workloads[$Id].detail = $Detail
    if ($Seconds) { $workloads[$Id].seconds = [math]::Round($Seconds) }
    Send-Workloads
}

# Roda um workload isolado. ScriptBlock devolve $false = falhou (o módulo já registrou o motivo no log).
function Invoke-Workload([string]$Id, [scriptblock]$ScriptBlock) {
    if (-not $workloads.Contains($Id) -or $workloads[$Id].status -ne 'pending') { return $null }
    $sw = [Diagnostics.Stopwatch]::StartNew()
    Set-Workload $Id 'running'
    try {
        $out = & $ScriptBlock
        # vale o último booleano que o módulo devolveu; sem booleano (ex.: Get-SitesInfo devolve a lista), conta como sucesso
        $last = @($out) | Where-Object { $_ -is [bool] } | Select-Object -Last 1
        $ok = ($null -eq $last) -or $last
        if ($ok) { Set-Workload $Id 'ok' '' $sw.Elapsed.TotalSeconds }
        else { Set-Workload $Id 'failed' 'O módulo terminou com falha — veja o log.' $sw.Elapsed.TotalSeconds }
        return $out
    } catch {
        $msg = $_.Exception.Message
        Write-Log -Level ERROR -Module 'Main' -Message "Workload '$Id' falhou; seguindo com os demais." -Exception $msg -DbConnection $dbConn
        Set-Workload $Id 'failed' $msg $sw.Elapsed.TotalSeconds
        return $null
    }
}

function Invoke-Preflight {
    # Graph
    try {
        $org = Invoke-GraphRequest -Uri 'https://graph.microsoft.com/v1.0/organization?$select=displayName' -MaxRetries 2
        $name = if ($org.value) { $org.value[0].displayName } else { '' }
        $preflight.graph = [ordered]@{ ok = $true; detail = "Tenant: $name" }
        Write-Log -Level SUCCESS -Module 'Preflight' -Message "Graph OK ($name)."
    } catch {
        $preflight.graph = [ordered]@{ ok = $false; detail = $_.Exception.Message }
        Write-Log -Level ERROR -Module 'Preflight' -Message 'Graph falhou.' -Exception $_.Exception.Message
    }
    # Permissões de aplicativo concedidas (precisa de Directory.Read.All/Application.Read.All para ler; se não der, não bloqueia nada)
    try {
        $cid = $global:auth.client_id
        $sp = Invoke-GraphRequest -Uri "https://graph.microsoft.com/v1.0/servicePrincipals?`$filter=appId eq '$cid'&`$select=id" -MaxRetries 2
        if (-not $sp.value) { throw "Service principal do app $cid não encontrado no tenant (consentimento do administrador pendente?)." }
        $assign = Invoke-GraphRequest -Uri "https://graph.microsoft.com/v1.0/servicePrincipals/$($sp.value[0].id)/appRoleAssignments" -All -MaxRetries 2
        $granted = New-Object System.Collections.Generic.List[string]
        foreach ($rid in @($assign.value | ForEach-Object { $_.resourceId } | Select-Object -Unique)) {
            $res = Invoke-GraphRequest -Uri "https://graph.microsoft.com/v1.0/servicePrincipals/$rid`?`$select=appId,appRoles" -MaxRetries 2
            $prefix = switch ($res.appId) { '00000003-0000-0000-c000-000000000000' { 'Graph' } '00000003-0000-0ff1-ce00-000000000000' { 'SharePoint' } default { $null } }
            if (-not $prefix) { continue }
            foreach ($a in @($assign.value | Where-Object { $_.resourceId -eq $rid })) {
                $role = @($res.appRoles | Where-Object { $_.id -eq $a.appRoleId }) | Select-Object -First 1
                if ($role) { $granted.Add("$($prefix):$($role.value)") }
            }
        }
        $preflight.permissions = [ordered]@{ checked = $true; granted = @($granted | Sort-Object -Unique) }
        Write-Log -Level INFO -Module 'Preflight' -Message "Permissões concedidas: $((@($granted) | Sort-Object -Unique) -join ', ')"
    } catch {
        $preflight.permissions = [ordered]@{ checked = $false; granted = @(); detail = $_.Exception.Message }
        Write-Log -Level WARNING -Module 'Preflight' -Message 'Não foi possível ler as permissões do app (seguindo sem essa checagem).' -Exception $_.Exception.Message
    }
    # SharePoint Admin (PnP) — é o que sites/arquivos/lixeira usam
    $needSpo = $diagnostic -or @($workloadDefs | Where-Object { $_.spo -and $workloads.Contains($_.id) }).Count -gt 0
    if ($needSpo) {
        try {
            $ctx = Connect-SPOAdminCenter -TenantName $global:auth.spo_tenant -ClientId $global:auth.client_id -CertBase64 $global:base64Cert -ClientSecret $global:auth.client_secret -Tenant $global:auth.tenant_id
            if (-not $ctx) { throw 'Não foi possível conectar no SharePoint Admin (veja o log).' }
            $null = Get-PnPTenant -Connection $ctx -ErrorAction Stop
            $preflight.sharepoint = [ordered]@{ ok = $true; detail = "https://$($global:auth.spo_tenant)-admin.sharepoint.com" }
            Write-Log -Level SUCCESS -Module 'Preflight' -Message 'SharePoint Admin OK.'
        } catch {
            $hint = if ($global:auth.auth_mode -ne 'cert') { ' O SharePoint exige certificado para acesso app-only: troque a autenticação do cliente para certificado.' } else { '' }
            $preflight.sharepoint = [ordered]@{ ok = $false; detail = "$($_.Exception.Message)$hint" }
            Write-Log -Level ERROR -Module 'Preflight' -Message 'SharePoint Admin falhou.' -Exception "$($_.Exception.Message)$hint"
        }
    }
    # Pula de antemão o que já se sabe que vai falhar, com o motivo
    foreach ($w in $workloadDefs) {
        if (-not $workloads.Contains($w.id)) { continue }
        if ($w.spo -and $preflight.sharepoint -and -not $preflight.sharepoint.ok) { $workloads[$w.id].status = 'skipped'; $workloads[$w.id].detail = "SharePoint indisponível: $($preflight.sharepoint.detail)"; continue }
        if ($w.graph -and -not $w.spo -and $preflight.graph -and -not $preflight.graph.ok) { $workloads[$w.id].status = 'skipped'; $workloads[$w.id].detail = "Graph indisponível: $($preflight.graph.detail)"; continue }
        if ($w.graph -and $preflight.permissions -and $preflight.permissions.checked) {
            $has = @($w.graph | Where-Object { $preflight.permissions.granted -contains "Graph:$_" }).Count -gt 0
            if (-not $has) { $workloads[$w.id].status = 'skipped'; $workloads[$w.id].detail = "Falta a permissão de aplicativo no Graph: $($w.graph -join ' ou ') (com consentimento do administrador)." }
        }
    }
}

try {
    Write-Log -Level INFO -Module 'Main' -Message "Config recebida do portal | cliente=$($config.clientName) | mode=$($global:auth.auth_mode) | tentativa=$($config.attempt)$(if ($diagnostic) { ' | DIAGNOSTICO' })"

    Write-Log -Level INFO -Module 'Main' -Message 'Adquirindo token Microsoft Graph...'
    try {
        $global:TokenGraph = Get-GraphToken
        if (-not $global:TokenGraph) { throw 'Token Graph nao adquirido.' }
    } catch {
        # Sem token nada roda: registra na checagem prévia (o portal mostra "Microsoft Graph ✕" com o motivo)
        $preflight.graph = [ordered]@{ ok = $false; detail = $_.Exception.Message }
        throw
    }
    Write-Log -Level SUCCESS -Module 'Main' -Message 'Token Graph adquirido (cache local ativo).'

    Invoke-Preflight

    Write-Log -Level INFO -Module 'Main' -Message "Conectando ao banco do cliente ($($global:auth.database))..."
    try {
        $dbConn = New-DbConnection -MaxRetries 3
        $preflight.database = [ordered]@{ ok = $true; detail = "$($global:auth.server)/$($global:auth.database)" }
        Write-Log -Level SUCCESS -Module 'Main' -Message "Conexao DB ativa em $($global:auth.server)/$($global:auth.database)"
    } catch {
        $preflight.database = [ordered]@{ ok = $false; detail = $_.Exception.Message }
        throw "Banco do cliente inacessível: $($_.Exception.Message)"
    }
    Send-Workloads

    if ($diagnostic) {
        $okAll = $preflight.graph.ok -and $preflight.database.ok -and (-not $preflight.sharepoint -or $preflight.sharepoint.ok)
        $finalStatus = if ($okAll) { 'completed' } elseif ($preflight.graph.ok) { 'partial' } else { 'failed' }
        if (-not $okAll) { $finalError = 'Diagnóstico encontrou problemas — veja os itens da checagem.' }
        Write-Log -Level INFO -Module 'Main' -Message "Diagnóstico concluído: $finalStatus."
    } else {
        # Retomada: a mesma execução já tem linha em execution_history (o container anterior caiu no meio)
        $isResume = $false
        # Invoke-DbReader ja devolve array (virgula unaria): NAO envolver em @(), senao 0 linhas vira [ [] ] (Count=1)
        $prev = Invoke-DbReader -Connection $dbConn -Query 'SELECT status FROM dbo.execution_history WHERE execution_id = @exec' -Parameters @{ '@exec' = $global:executionId }
        if ($null -ne $prev -and $prev.Count -gt 0) {
            $isResume = $true
            Invoke-DbNonQuery -Connection $dbConn -Query "UPDATE dbo.execution_history SET status = 'running', end_time = NULL WHERE execution_id = @exec" -Parameters @{ '@exec' = $global:executionId } | Out-Null
            Write-Log -Level WARNING -Module 'Main' -Message "Retomando execucao $($global:executionId) (status anterior: $($prev[0].status))." -DbConnection $dbConn
        } else {
            Start-ExecutionHistory -Connection $dbConn
        }
        $global:isResume = $isResume
        Write-Log -Level INFO -Module 'Main' -Message "=== CT Assessment iniciado | ExecutionId=$($global:executionId) | Resume=$isResume ===" -DbConnection $dbConn

        # Mesmo mecanismo de resume do main.ps1 para os workloads "atômicos" (1 chamada cobre o tenant)
        function Invoke-ResumableModule([string]$ModuleName, [string[]]$ClearTables, [scriptblock]$ScriptBlock) {
            if ($isResume -and (Test-ModuleCompleted -Connection $dbConn -ModuleName $ModuleName)) {
                Write-Log -Level INFO -Module 'Main' -Message "Resume: modulo '$ModuleName' ja concluido nesta execucao - pulando." -DbConnection $dbConn
                return $true
            }
            if ($isResume) { foreach ($t in $ClearTables) { Clear-ExecutionModuleData -Connection $dbConn -TableName $t } }
            $ok = & $ScriptBlock
            if ($ok) { Complete-ModuleProgress -Connection $dbConn -ModuleName $ModuleName }
            return [bool]$ok
        }

        # 7. EXECUCAO DOS MODULOS — mesma ordem e condições do main.ps1, cada um isolado
        Invoke-Workload 'licensing' { Invoke-ResumableModule 'licensing' @('dbo.licensing_info') { Get-LicensingData -Connection $dbConn } } | Out-Null
        Invoke-Workload 'adoption'  { Invoke-ResumableModule 'adoption'  @('dbo.user_activity')  { Get-ActivityInfo -Connection $dbConn } } | Out-Null
        Invoke-Workload 'mailbox'   { Invoke-ResumableModule 'mailbox'   @('dbo.mailbox_info')   { Get-MailboxInfo -Connection $dbConn } } | Out-Null
        Invoke-Workload 'intune'    { Invoke-ResumableModule 'intune'    @('dbo.intune_devices','dbo.intune_compliance_states') { Get-IntuneInfo -Connection $dbConn } } | Out-Null

        if ($workloads.Contains('sites')) {
            $r = Invoke-Workload 'sites' { @(Get-SitesInfo -Connection $dbConn) }
            $sitesColetados = @($r | Where-Object { $null -ne $_ -and $_ -isnot [bool] })
            if ($workloads.sites.status -eq 'ok' -and $sitesColetados.Count -eq 0) { Set-Workload 'sites' 'failed' 'Nenhum site retornado pelo SharePoint Admin — veja o log.' }
            if ($workloads.sites.status -eq 'ok') { $workloads.sites.detail = "$($sitesColetados.Count) sites" ; Send-Workloads }
        }
        # Dependem da lista de sites
        foreach ($dep in 'owner_status','files','trash') {
            if ($workloads.Contains($dep) -and $workloads[$dep].status -eq 'pending' -and $sitesColetados.Count -eq 0) {
                Set-Workload $dep 'skipped' $(if ($workloads.Contains('sites')) { 'Sem a lista de sites (o workload Sites e subsites não concluiu).' } else { 'Exige o workload Sites e subsites.' })
            }
        }
        Invoke-Workload 'owner_status' { Invoke-ResumableModule 'owner_status' @('dbo.site_owner_status') { Get-OwnerStatus -Connection $dbConn } } | Out-Null
        Invoke-Workload 'files' { Get-DataFiles -Sites $sitesColetados -Connection $dbConn; $true } | Out-Null
        Invoke-Workload 'trash' { Get-TrashItems -Sites $sitesColetados -Connection $dbConn; $true } | Out-Null

        $states = @($workloads.Values | ForEach-Object { $_.status })
        $okCount = @($states | Where-Object { $_ -eq 'ok' }).Count
        $finalStatus = if ($okCount -eq $states.Count) { 'completed' } elseif ($okCount -gt 0) { 'partial' } else { 'failed' }
        if ($finalStatus -ne 'completed') {
            $finalError = (@($workloads.Values | Where-Object { $_.status -in 'failed','skipped' } | ForEach-Object { "$($_.label): $($_.detail)" }) -join "`n")
        }
        Write-Log -Level $(if ($finalStatus -eq 'completed') { 'SUCCESS' } else { 'WARNING' }) -Module 'Main' -Message "Pipeline encerrado: $finalStatus ($okCount de $($states.Count) workloads concluídos)." -DbConnection $dbConn
        Complete-ExecutionHistory -Status $(if ($okCount -gt 0) { 'completed' } else { 'failed' }) -Connection $dbConn -TotalSites $sitesColetados.Count
        if ($okCount -gt 0) {
            Write-Log -Level INFO -Module 'Main' -Message 'Atualizando agregacoes do dashboard (sp_RefreshDashboardAggregates)...'
            if (Invoke-DashboardRefresh -Connection $dbConn) { Write-Log -Level SUCCESS -Module 'Main' -Message 'Agregacoes do dashboard atualizadas.' }
            else { Write-Log -Level WARNING -Module 'Main' -Message 'Falha ao atualizar agregacoes do dashboard - rode dbo.sp_RefreshDashboardAggregates manualmente.' }
        }
    }
}
catch {
    $finalError = "$($_.Exception.Message)"
    Write-Log -Level CRITICAL -Module 'Main' -Message 'Falha critica no pipeline.' -Exception $finalError -DbConnection $dbConn
    Write-Host $_.ScriptStackTrace -ForegroundColor DarkGray
    foreach ($k in @($workloads.Keys)) { if ($workloads[$k].status -in 'pending','running') { $workloads[$k].status = 'skipped'; $workloads[$k].detail = 'Interrompido por falha geral.' } }
    if ($null -ne $dbConn -and -not $diagnostic) { Complete-ExecutionHistory -Status 'failed' -Connection $dbConn -TotalSites $sitesColetados.Count }
}
finally {
    if ($null -ne $dbConn) { try { Close-DbConnection -Connection $dbConn } catch { } }
    if ($certTemp) { Remove-Item $certTemp -Force -ErrorAction SilentlyContinue }
    Write-Log -Level INFO -Module 'Main' -Message "=== CT Assessment finalizado | ExecutionId=$($global:executionId) | $finalStatus ==="

    # último envio de log/progresso
    $sync.Stop = $true
    Wait-Job $reporter -Timeout 90 | Out-Null
    Remove-Job $reporter -Force -ErrorAction SilentlyContinue

    # log completo (gzip) para download no portal
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

    $final = @{ status = $finalStatus; totalSites = $sitesColetados.Count; workloads = $workloads; preflight = $preflight }
    if ($finalError) { $final.error = $finalError }
    if (-not (Send-PortalEvent -Body $final)) { Write-Host '[Job] Não foi possível reportar o resultado final ao portal.' -ForegroundColor Yellow }
}
# Resultado já registrado no portal: sai com 0 para o Container Apps não repetir uma execução encerrada.
exit 0
