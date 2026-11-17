# ==============================================================================
#  CT Assessment 365 | Higienização — limpeza de versões antigas
# ------------------------------------------------------------------------------
#  Mantém as N versões mais recentes de cada arquivo (contando a atual) e apaga
#  as mais antigas, nos sites escolhidos. SIMULAR é o padrão: nada é alterado e o
#  resultado diz exatamente quantas versões sairiam e quanto espaço libera.
#
#  Modos:
#   - PorArquivo (padrão): trata só os arquivos candidatos apontados pela última
#     coleta (files_info com versions_count > N), lendo as versões REAIS de cada
#     um no SharePoint. Por padrão as versões apagadas vão para a LIXEIRA do site
#     (recuperáveis por ~93 dias; o espaço só é liberado de fato quando a lixeira
#     é esvaziada). Com -SemLixeira, a exclusão é permanente.
#   - JobSharePoint: enfileira no SharePoint o job oficial de "trim" do site
#     inteiro (New-PnPSiteFileVersionBatchDeleteJob). Rápido para sites grandes,
#     mas a exclusão é PERMANENTE (não passa pela lixeira) e vale para todas as
#     bibliotecas. A simulação usa a mesma leitura por arquivo do modo PorArquivo
#     como estimativa.
#
#  Proteções: nunca toca a Preservation Hold Library; por padrão pula arquivos
#  com rótulo de retenção (-IncluirRotulados para incluir); a versão atual nunca
#  é apagada. Cada item tratado é registrado em dbo.hygiene_version_items e a
#  execução em dbo.hygiene_runs (banco do cliente; migração 002).
#
#  Uso avulso (mesma configuração do ct-assessmentspo):
#    pwsh -File job/hygiene/Invoke-VersionCleanup.ps1 -AuthFile ./auth.json `
#         -SiteUrl https://contoso.sharepoint.com/sites/financeiro -ManterVersoes 100
#    ... -Acao Executar            (pede confirmação; -Confirm:$false para não pedir)
#  No SaaS, o worker chama com a configuração vinda do portal (já em $global:auth).
# ==============================================================================

#Requires -Version 7.2
[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    # Sites alvo. Vazio = todos os sites que têm candidatos na coleta de origem.
    [string[]] $SiteUrl = @(),
    # Versões a manter por arquivo, contando a atual (mínimo 1).
    [ValidateRange(1, 50000)] [int] $ManterVersoes = 100,
    [ValidateSet('Simular', 'Executar')] [string] $Acao = 'Simular',
    [ValidateSet('PorArquivo', 'JobSharePoint')] [string] $Modo = 'PorArquivo',
    # PorArquivo: exclui permanentemente em vez de mandar para a lixeira.
    [switch] $SemLixeira,
    # Inclui arquivos com rótulo de retenção (a exclusão pode ser bloqueada pela política).
    [switch] $IncluirRotulados,
    # Coleta de origem dos candidatos (padrão: a última concluída no banco do cliente).
    [string] $ExecutionId = '',
    # Limite de arquivos por execução (0 = sem limite). Útil para um piloto.
    [int] $MaxArquivos = 0,
    # Uso avulso: auth.json no formato do ct-assessmentspo (tenant, app, certificado e banco).
    [string] $AuthFile = '',
    # Pasta do CSV com o resultado por arquivo.
    [string] $OutDir = '',
    [string] $RunId = ([guid]::NewGuid().ToString()),
    # SaaS: chamado com um resumo a cada site concluído (para mostrar progresso no portal).
    [scriptblock] $OnProgress = $null
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 3.0
$jobRoot = Split-Path -Parent $PSScriptRoot
$dryRun = $Acao -eq 'Simular'

# ------------------------------------------------------------------------------
# Funções do coletor (conexão, banco, log) — mesmas do ct-assessmentspo
# ------------------------------------------------------------------------------
if (-not (Get-Command Connect-SPOSite -ErrorAction SilentlyContinue)) {
    . (Join-Path $jobRoot 'src\connection\Connect-Database.ps1')
    . (Join-Path $jobRoot 'src\connection\Repository.ps1')
    . (Join-Path $jobRoot 'src\connection\Connect-Graph.ps1')
    . (Join-Path $jobRoot 'src\connection\Connect-SharePoint.ps1')
    . (Join-Path $jobRoot 'src\utils\Write-Log.ps1')
}
if (-not (Get-Command Remove-PnPFileVersion -ErrorAction SilentlyContinue)) { Import-Module PnP.PowerShell -ErrorAction Stop }

if ($AuthFile) {
    $global:auth = Get-Content -Raw $AuthFile | ConvertFrom-Json -AsHashtable
    foreach ($k in 'tenant_id', 'client_id') { if ($global:auth[$k] -is [string]) { $global:auth[$k] = $global:auth[$k].Trim() } }
    foreach ($k in 'client_secret', 'cert_password', 'cert_path', 'proxy_url', 'proxy_username', 'proxy_password', 'proxy_bypass') { if (-not $global:auth.ContainsKey($k)) { $global:auth[$k] = '' } }
    if (-not $global:auth.ContainsKey('auth_mode') -or -not $global:auth.auth_mode) { $global:auth.auth_mode = if ($global:auth.client_secret) { 'secret' } else { 'cert' } }
    if (-not $global:auth.ContainsKey('connection')) { $global:auth.connection = 'sql' }
    $global:base64Cert = $null
    if ($global:auth.auth_mode -eq 'cert' -and $global:auth.cert_path -and (Test-Path $global:auth.cert_path)) {
        $global:base64Cert = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path $global:auth.cert_path)))
    }
    if (-not (Test-Path Variable:Global:LogFilePath)) { Initialize-Logger -LogDir (Join-Path $jobRoot 'logs') }
}
if (-not (Test-Path Variable:Global:auth) -or $null -eq $global:auth) { throw 'Configuração ausente: informe -AuthFile (uso avulso) ou carregue $global:auth (SaaS).' }
if (-not (Test-Path Variable:Global:base64Cert)) { $global:base64Cert = $null }
if (-not (Test-Path Variable:Global:executionId)) { $global:executionId = $RunId }

function Write-Hlog([string]$Level, [string]$Message, [string]$Site = $null, [string]$Ex = $null) {
    Write-Log -Level $Level -Module 'Versoes' -Message $Message -SiteUrl $Site -Exception $Ex
}

# Chamada ao SharePoint com novas tentativas em throttling/erros transitórios
function Invoke-Spo([scriptblock]$Call, [int]$Tries = 4) {
    for ($i = 1; ; $i++) {
        try { return & $Call }
        catch {
            $m = $_.Exception.Message
            $transient = $m -match '429|503|throttl|Too many requests|temporarily|timed out|Nullable object must have a value'
            if (-not $transient -or $i -ge $Tries) { throw }
            Start-Sleep -Seconds ([math]::Min(60, 5 * $i * $i))
        }
    }
}

$authArgs = @{ ClientId = $global:auth.client_id; CertBase64 = $global:base64Cert; ClientSecret = $global:auth.client_secret; Tenant = $global:auth.tenant_id }

# ------------------------------------------------------------------------------
# Banco do cliente: coleta de origem, candidatos e registro
# ------------------------------------------------------------------------------
$db = New-DbConnection -MaxRetries 3
$hasHygieneTables = [bool](Invoke-DbScalar -Connection $db -Query "SELECT CASE WHEN OBJECT_ID('dbo.hygiene_runs','U') IS NULL THEN 0 ELSE 1 END")
if (-not $hasHygieneTables) { Write-Hlog WARNING 'Tabelas de higienização ausentes no banco do cliente (migração 002): o resultado fica só no CSV.' }

if (-not $ExecutionId) {
    $ExecutionId = [string](Invoke-DbScalar -Connection $db -Query "SELECT TOP 1 execution_id FROM dbo.execution_history WHERE status = 'completed' ORDER BY start_time DESC")
    if (-not $ExecutionId) { throw 'Nenhuma coleta concluída no banco do cliente: rode uma coleta com o workload Arquivos antes de higienizar.' }
}
Write-Hlog INFO "Limpeza de versões | ação=$Acao | modo=$Modo | manter=$ManterVersoes | lixeira=$(-not $SemLixeira) | coleta=$ExecutionId | run=$RunId"

$where = "execution_id = @e AND versions_count > @keep AND ISNULL(preservation_hold_library, 0) = 0 AND relative_url IS NOT NULL"
if (-not $IncluirRotulados) { $where += " AND (file_compliance_tag IS NULL OR file_compliance_tag = '')" }
$sqlCand = "SELECT site_url, relative_url, file_url, file_name, versions_count, file_size FROM dbo.files_info WHERE $where"
$candidates = New-Object System.Collections.Generic.List[object]
if ($SiteUrl.Count) {
    foreach ($s in $SiteUrl) {
        $rows = Invoke-DbReader -Connection $db -TimeoutSeconds 300 -Query "$sqlCand AND site_url = @s ORDER BY versions_count DESC" -Parameters @{ '@e' = $ExecutionId; '@keep' = $ManterVersoes; '@s' = $s.TrimEnd('/') }
        foreach ($r in $rows) { $candidates.Add($r) }
    }
} else {
    $rows = Invoke-DbReader -Connection $db -TimeoutSeconds 300 -Query "$sqlCand ORDER BY site_url, versions_count DESC" -Parameters @{ '@e' = $ExecutionId; '@keep' = $ManterVersoes }
    foreach ($r in $rows) { $candidates.Add($r) }
}
if ($MaxArquivos -gt 0 -and $candidates.Count -gt $MaxArquivos) { $candidates = [System.Collections.Generic.List[object]]@($candidates | Select-Object -First $MaxArquivos) }
$bySite = $candidates | Group-Object site_url
Write-Hlog INFO "$($candidates.Count) arquivos candidatos em $(@($bySite).Count) site(s) (versão > $ManterVersoes na coleta)."

if ($hasHygieneTables) {
    Invoke-DbNonQuery -Connection $db -Query @"
INSERT INTO dbo.hygiene_runs (run_id, action, mode, dry_run, keep_versions, recycle, source_execution_id, started_at, status, sites, files_targeted)
VALUES (@r, 'version_cleanup', @m, @d, @k, @rc, @e, SYSUTCDATETIME(), 'running', @s, @f)
"@ -Parameters @{ '@r' = $RunId; '@m' = $Modo; '@d' = [int]$dryRun; '@k' = $ManterVersoes; '@rc' = [int](-not $SemLixeira); '@e' = $ExecutionId; '@s' = @($bySite).Count; '@f' = $candidates.Count } | Out-Null
}

$results = New-Object System.Collections.Generic.List[object]
function Add-Result($Site, $File, [int]$Before, [int]$Deleted, [long]$Bytes, [string]$Status, [string]$Detail = '') {
    $row = [pscustomobject]@{ site_url = $Site; file_url = $File; versions_before = $Before; versions_deleted = $Deleted; bytes = $Bytes; status = $Status; detail = $Detail }
    $results.Add($row)
    if ($hasHygieneTables) {
        try {
            Invoke-DbNonQuery -Connection $db -Query "INSERT INTO dbo.hygiene_version_items (run_id, site_url, file_url, versions_before, versions_deleted, bytes, status, detail) VALUES (@r, @s, @f, @b, @d, @y, @st, @dt)" `
                -Parameters @{ '@r' = $RunId; '@s' = $Site; '@f' = $File; '@b' = $Before; '@d' = $Deleted; '@y' = $Bytes; '@st' = $Status; '@dt' = $Detail } | Out-Null
        } catch { Write-Hlog WARNING 'Falha ao registrar item no banco.' $Site $_.Exception.Message }
    }
}

# ------------------------------------------------------------------------------
# Processamento por site
# ------------------------------------------------------------------------------
$siteIndex = 0
foreach ($g in @($bySite)) {
    $siteIndex++
    $site = [string]$g.Name
    Write-Hlog INFO "[$siteIndex/$(@($bySite).Count)] $($g.Count) candidatos." $site
    $ctx = Invoke-Spo { Connect-SPOSite -SiteUrl $site @authArgs }
    if (-not $ctx) {
        foreach ($c in $g.Group) { Add-Result $site $c.file_url 0 0 0 'erro' 'Não foi possível conectar no site (veja o log).' }
        continue
    }

    foreach ($c in $g.Group) {
        $rel = [string]$c.relative_url
        try {
            # Versões históricas reais (a atual não vem na lista e nunca é apagada)
            $versions = @(Invoke-Spo { Get-PnPFileVersion -Url $rel -Connection $ctx })
            $keepHistorical = $ManterVersoes - 1
            if ($versions.Count -le $keepHistorical) {
                Add-Result $site $c.file_url $versions.Count 0 0 'sem_excesso' "Já tem $($versions.Count + 1) versões no total."
                continue
            }
            $old = @($versions | Sort-Object { [datetime]$_.Created }, { [int]$_.ID } | Select-Object -First ($versions.Count - $keepHistorical))
            $bytes = [long](($old | Measure-Object -Property Size -Sum).Sum)

            if ($dryRun -or $Modo -eq 'JobSharePoint') {
                Add-Result $site $c.file_url $versions.Count $old.Count $bytes 'simulado'
                continue
            }
            if (-not $PSCmdlet.ShouldProcess($c.file_url, "Apagar $($old.Count) versões antigas")) {
                Add-Result $site $c.file_url $versions.Count 0 0 'simulado' 'Execução não confirmada.'
                continue
            }
            $deleted = 0; $freed = [long]0; $errs = @()
            foreach ($v in $old) {
                try {
                    Invoke-Spo { Remove-PnPFileVersion -Url $rel -Identity ([int]$v.ID) -Recycle:(-not $SemLixeira) -Force -Connection $ctx } | Out-Null
                    $deleted++; $freed += [long]$v.Size
                } catch { $errs += "$($v.VersionLabel): $($_.Exception.Message)" }
            }
            $status = if (-not $errs.Count) { 'removido' } elseif ($deleted) { 'erro' } elseif (($errs -join ' ') -match 'hold|retention|reten|label|r[oó]tulo|preserv') { 'protegido' } else { 'erro' }
            Add-Result $site $c.file_url $versions.Count $deleted $freed $status (($errs | Select-Object -First 3) -join ' | ')
        } catch {
            $m = $_.Exception.Message
            $st = if ($m -match 'hold|retention|label|preserv') { 'protegido' } elseif ($m -match 'File Not Found|does not exist|404') { 'nao_encontrado' } else { 'erro' }
            Add-Result $site $c.file_url 0 0 0 $st $m
        }
    }

    # Modo JobSharePoint: enfileira o trim oficial do site inteiro (permanente)
    if (-not $dryRun -and $Modo -eq 'JobSharePoint') {
        if ($PSCmdlet.ShouldProcess($site, "Enfileirar job do SharePoint mantendo $ManterVersoes versões (exclusão PERMANENTE)")) {
            try {
                Invoke-Spo { New-PnPSiteFileVersionBatchDeleteJob -MajorVersionLimit $ManterVersoes -MajorWithMinorVersionsLimit $ManterVersoes -Force -Connection $ctx } | Out-Null
                $st = try { Get-PnPSiteFileVersionBatchDeleteJobStatus -Connection $ctx | ConvertTo-Json -Compress -Depth 3 } catch { '' }
                Add-Result $site $site 0 0 0 'job_enfileirado' $st
                Write-Hlog SUCCESS 'Job de limpeza do SharePoint enfileirado (roda no servidor; acompanhe pelo status do site).' $site
            } catch { Add-Result $site $site 0 0 0 'erro' $_.Exception.Message; Write-Hlog ERROR 'Falha ao enfileirar o job do SharePoint.' $site $_.Exception.Message }
        }
    }
    try { Disconnect-SPOConnection -Connection $ctx } catch { }

    $siteRows = @($results | Where-Object { $_.site_url -eq $site })
    Write-Hlog INFO ("Site concluído: {0} versões {1}, {2:N1} MB." -f (($siteRows | Measure-Object versions_deleted -Sum).Sum), $(if ($dryRun) { 'a remover' } else { 'removidas' }), ((($siteRows | Measure-Object bytes -Sum).Sum) / 1MB)) $site
    if ($OnProgress) { & $OnProgress @{ site = $site; index = $siteIndex; total = @($bySite).Count; results = $results } }
}

# ------------------------------------------------------------------------------
# Resumo
# ------------------------------------------------------------------------------
$changed = @($results | Where-Object { $_.status -in 'removido', 'simulado' -and $_.versions_deleted -gt 0 })
$errors = @($results | Where-Object { $_.status -eq 'erro' }).Count
$summary = [ordered]@{
    run_id           = $RunId
    acao             = $Acao
    modo             = $Modo
    manter_versoes   = $ManterVersoes
    lixeira          = -not $SemLixeira
    coleta_origem    = $ExecutionId
    sites            = @($bySite).Count
    arquivos         = $candidates.Count
    arquivos_alterados = $changed.Count
    versoes          = [long](($results | Measure-Object versions_deleted -Sum).Sum)
    bytes            = [long](($results | Measure-Object bytes -Sum).Sum)
    protegidos       = @($results | Where-Object { $_.status -eq 'protegido' }).Count
    erros            = $errors
    status           = if ($errors -eq 0) { 'completed' } elseif ($changed.Count) { 'partial' } else { 'failed' }
}
if ($candidates.Count -eq 0) { $summary.status = 'completed' }

if ($hasHygieneTables) {
    Invoke-DbNonQuery -Connection $db -Query @"
UPDATE dbo.hygiene_runs SET finished_at = SYSUTCDATETIME(), status = @st, files_changed = @fc, versions_deleted = @v, bytes_freed = @b, errors = @er WHERE run_id = @r
"@ -Parameters @{ '@r' = $RunId; '@st' = $summary.status; '@fc' = $summary.arquivos_alterados; '@v' = $summary.versoes; '@b' = $summary.bytes; '@er' = $summary.erros } | Out-Null
}
Close-DbConnection -Connection $db

if ($OutDir) {
    New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
    $csv = Join-Path $OutDir "limpeza-versoes-$($Acao.ToLower())-$($RunId.Substring(0, 8)).csv"
    $results | Export-Csv -Path $csv -NoTypeInformation -Encoding utf8 -Delimiter ';'
    Write-Hlog INFO "Resultado por arquivo: $csv"
}
Write-Hlog $(if ($summary.status -eq 'completed') { 'SUCCESS' } else { 'WARNING' }) ("{0}: {1} versões em {2} arquivos, {3:N1} GB {4}{5}." -f $(if ($dryRun) { 'Simulação' } else { 'Limpeza' }), $summary.versoes, $summary.arquivos_alterados, ($summary.bytes / 1GB), $(if ($dryRun) { 'a liberar' } else { 'liberados' }), $(if (-not $dryRun -and -not $SemLixeira -and $Modo -eq 'PorArquivo') { ' (vão para a lixeira: o espaço é liberado quando ela for esvaziada)' } else { '' }))
[pscustomobject]$summary
