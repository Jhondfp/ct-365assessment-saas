# ==============================================================================
#  CT Assessment 365 SaaS | Coleta de arquivos dividida em lotes
# ------------------------------------------------------------------------------
#  Depois da lista de sites, a coleta principal reparte arquivos (e lixeira) em
#  lotes de sites e registra os lotes no portal. Qualquer container da fila pega
#  um lote (Container Apps Job disparado pela fila), inclusive a própria coleta,
#  que também trabalha enquanto espera. O teto de containers por coleta fica no
#  portal (params.files_containers). Cada site grava o próprio progresso em
#  dbo.execution_progress: pegar de novo um lote interrompido só refaz o que faltou.
#  Dot-source no Invoke-SaasAssessment.ps1 (usa $CallbackUrl, $headers e as
#  funções do coletor já carregadas).
# ==============================================================================

function Invoke-PortalApi {
    param([string]$Method, [string]$Path, $Body = $null)
    $uri = "$CallbackUrl$Path"
    for ($i = 1; $i -le 5; $i++) {
        try {
            $args2 = @{ Uri = $uri; Method = $Method; Headers = $headers; TimeoutSec = 60; SkipHttpErrorCheck = $true }
            if ($null -ne $Body) { $args2.ContentType = 'application/json; charset=utf-8'; $args2.Body = [System.Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 8 -Compress)) }
            $r = Invoke-WebRequest @args2
            if ($r.StatusCode -eq 204) { return $null }
            if ($r.StatusCode -eq 409) { throw [System.OperationCanceledException]::new("Portal recusou ($Path): coleta encerrada ou cancelada.") }
            if ($r.StatusCode -ge 400) { throw "Portal respondeu $($r.StatusCode) em ${Path}: $($r.Content)" }
            return ($r.Content | ConvertFrom-Json)
        } catch [System.OperationCanceledException] { throw }
        catch {
            if ($i -eq 5) { throw }
            Start-Sleep -Seconds (3 * $i)
        }
    }
}

# Sites como o portal guarda (só o que os módulos usam) e de volta como objetos do coletor.
function ConvertTo-TaskSite($s) {
    [ordered]@{ Url = [string]$s.Url; Title = [string]$s.Title; Id = $(if ($s.PSObject.Properties['Id']) { [string]$s.Id } else { '' }); StorageUsageCurrent = $(if ($s.PSObject.Properties['StorageUsageCurrent']) { [double]$s.StorageUsageCurrent } else { 0 }) }
}
function ConvertFrom-TaskSite($s) {
    [pscustomobject]@{ Url = [string]$s.Url; Title = [string]$s.Title; Id = [string]$s.Id; StorageUsageCurrent = [double]$s.StorageUsageCurrent }
}

# Lotes equilibrados pelo tamanho: sites grandes (>= BigSiteMB) sozinhos; os demais empacotados do maior para o
# menor até MaxSites sites ou TargetMB por lote.
function Get-SiteBatches {
    param($Sites, [int]$MaxSites = 40, [double]$BigSiteMB = 20480, [double]$TargetMB = 0)
    $sorted = @($Sites | Sort-Object { [double]$(if ($_.PSObject.Properties['StorageUsageCurrent']) { $_.StorageUsageCurrent } else { 0 }) } -Descending)
    $total = ($sorted | ForEach-Object { [double]$(if ($_.PSObject.Properties['StorageUsageCurrent']) { $_.StorageUsageCurrent } else { 0 }) } | Measure-Object -Sum).Sum
    if ($TargetMB -le 0) { $TargetMB = [math]::Max(5120, $total / [math]::Max(1, [math]::Ceiling($sorted.Count / $MaxSites)) ) }
    $batches = [System.Collections.Generic.List[object]]::new()
    $cur = [System.Collections.Generic.List[object]]::new(); $curMB = 0.0
    foreach ($s in $sorted) {
        $mb = [double]$(if ($s.PSObject.Properties['StorageUsageCurrent']) { $s.StorageUsageCurrent } else { 0 })
        if ($mb -ge $BigSiteMB) { $batches.Add(@($s)); continue }
        if ($cur.Count -gt 0 -and ($cur.Count -ge $MaxSites -or ($curMB + $mb) -gt $TargetMB)) { $batches.Add($cur.ToArray()); $cur.Clear(); $curMB = 0.0 }
        $cur.Add($s); $curMB += $mb
    }
    if ($cur.Count) { $batches.Add($cur.ToArray()) }
    return , $batches.ToArray()
}

# Divide só quando vale a pena (muitos sites) e quando o portal permite (files_split, padrão ligado).
function Test-FilesFanOut($Sites) {
    $on = -not ($global:params.ContainsKey('files_split') -and $global:params.files_split -eq $false)
    $min = if ($global:params.ContainsKey('files_split_min_sites')) { [int]$global:params.files_split_min_sites } else { 60 }
    return $on -and @($Sites).Count -gt $min
}

# Arquivos (e lixeira) de um grupo de sites. Sempre em modo retomada: pula o que já terminou e limpa linhas parciais.
function Invoke-SiteBatch {
    param($Sites, $Connection, [switch]$IncludeTrash, [switch]$IncludeFiles)
    $prev = $global:isResume
    $global:isResume = $true
    try {
        if ($IncludeFiles) { Get-DataFiles -Sites $Sites -Connection $Connection }
        if ($IncludeTrash) { Get-TrashItems -Sites $Sites -Connection $Connection }
    } finally { $global:isResume = $prev }
}

# Coleta principal: cria os lotes, trabalha neles e espera os outros containers terminarem.
function Invoke-FilesFanOut {
    param($Sites, $Connection, [switch]$IncludeTrash, [switch]$IncludeFiles)
    $maxSites = if ($global:params.ContainsKey('files_batch_sites')) { [int]$global:params.files_batch_sites } else { 40 }
    $batches = Get-SiteBatches -Sites $Sites -MaxSites $maxSites
    $body = @{ batches = @($batches | ForEach-Object { @{ sites = @($_ | ForEach-Object { ConvertTo-TaskSite $_ }) } }) }
    $s = Invoke-PortalApi -Method Post -Path '/tasks' -Body $body
    Write-Log -Level INFO -Module 'Lotes' -Message "Coleta dividida em $($s.total) lotes de até $maxSites sites; outros containers pegam lotes em paralelo." -DbConnection $Connection
    $lastLog = [datetime]::MinValue
    while ($true) {
        $t = Invoke-PortalApi -Method Post -Path '/tasks/claim'
        if ($t) {
            Write-Log -Level INFO -Module 'Lotes' -Message "Lote $($t.seq): $(@($t.sites).Count) sites (nesta coleta)." -DbConnection $Connection
            $err = $null
            try { Invoke-SiteBatch -Sites @($t.sites | ForEach-Object { ConvertFrom-TaskSite $_ }) -Connection $Connection -IncludeTrash:$IncludeTrash -IncludeFiles:$IncludeFiles }
            catch { $err = $_.Exception.Message; Write-Log -Level ERROR -Module 'Lotes' -Message "Lote $($t.seq) falhou." -Exception $err -DbConnection $Connection }
            $fin = if ($err) { @{ status = 'failed'; error = $err } } else { @{ status = 'done' } }
            try { [void](Invoke-PortalApi -Method Post -Path "/tasks/$($t.id)" -Body $fin) } catch [System.OperationCanceledException] { throw } catch { }
            continue
        }
        $s = Invoke-PortalApi -Method Get -Path '/tasks'
        Report-Step -StepName 'Coleta de Arquivos' -Status 'in progress' -Progress ([math]::Min(99, 5 + [math]::Round((($s.done + $s.failed) / [math]::Max(1, $s.total)) * 94))) -Info "$($s.done) de $($s.total) lotes concluídos · $($s.containers) container(s) trabalhando"
        if ($s.finished) { break }
        if (((Get-Date) - $lastLog).TotalMinutes -ge 5) {
            Write-Log -Level INFO -Module 'Lotes' -Message "Aguardando lotes: $($s.done) concluídos, $($s.running) em andamento, $($s.queued) na fila, $($s.failed) com falha." -DbConnection $Connection
            $lastLog = Get-Date
        }
        Start-Sleep -Seconds 20
    }
    Report-Step -StepName 'Coleta de Arquivos' -Status 'completed' -Progress 100 -Info "$($s.done) de $($s.total) lotes"
    if ($s.failed -gt 0) {
        Write-Log -Level WARNING -Module 'Lotes' -Message "$($s.failed) de $($s.total) lotes falharam; os sites deles ficam sem arquivos nesta coleta (Executar de novo retoma só o que faltou)." -DbConnection $Connection
        return $false
    }
    return $true
}

# Container de um lote: conecta no banco do cliente, coleta os sites do lote e avisa o portal.
function Invoke-TaskMode {
    param($Task)
    $conn = $null; $err = $null
    try {
        $conn = New-DbConnection -MaxRetries 3
        $sites = @($Task.sites | ForEach-Object { ConvertFrom-TaskSite $_ })
        Write-Log -Level INFO -Module 'Lotes' -Message "Lote $($Task.seq): $($sites.Count) sites." -DbConnection $conn
        $files = [bool]$global:params.process_sites -or [bool]$global:params.process_subsites
        Invoke-SiteBatch -Sites $sites -Connection $conn -IncludeFiles:$files -IncludeTrash:([bool]$global:params.process_recycle_bin)
        Write-Log -Level SUCCESS -Module 'Lotes' -Message "Lote $($Task.seq) concluído." -DbConnection $conn
    } catch {
        $err = $_.Exception.Message
        Write-Log -Level ERROR -Module 'Lotes' -Message "Lote $($Task.seq) falhou." -Exception $err -DbConnection $conn
    } finally {
        if ($conn) { try { Close-DbConnection -Connection $conn } catch { } }
    }
    return $err
}
