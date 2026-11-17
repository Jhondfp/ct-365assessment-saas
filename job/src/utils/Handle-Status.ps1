# ==============================================================================
# UTILITARIO DE STATUS DE EXECUCAO - persiste progresso em JSON com lock
# ==============================================================================

$script:StatusFile = '.\src\progress\global_status.json'
$script:StatusLock = New-Object System.Threading.Mutex($false, "Global\CT_StatusLock")

function Initialize-Status {
    param(
        [string] $ProgressDir = '.\src\progress'
    )
    if (-not (Test-Path $ProgressDir)) {
        New-Item -ItemType Directory -Path $ProgressDir -Force | Out-Null
    }
    $script:StatusFile = Join-Path $ProgressDir 'global_status.json'

    $execId = if (Test-Path Variable:Global:executionId) { $global:executionId } else { [guid]::NewGuid().ToString() }
    $global:StatusData = [PSCustomObject]@{
        ExecutionId = $execId
        StartTime   = Get-Date
        LastUpdate  = Get-Date
        Status      = 'Initialized'
        Steps       = @{}
    }

    # Grava imediatamente no disco (sobrescrevendo o que sobrou da execucao
    # anterior) - sem isso, o Monitor continua mostrando ExecutionId/StartTime/
    # progresso da execucao passada ate a primeira chamada de Report-Step,
    # e cada etapa que a nova execucao ainda nao alcancou fica com o numero
    # antigo (ex: "843 de 854 sites" de ontem) em vez de vazio/0%.
    $acquired = $false
    try {
        $acquired = $script:StatusLock.WaitOne(5000)
        if ($acquired) {
            $json = $global:StatusData | ConvertTo-Json -Depth 6 -Compress
            [System.IO.File]::WriteAllText($script:StatusFile, $json, [System.Text.Encoding]::UTF8)
        }
    } catch {
        # Persistencia em disco e best-effort
    } finally {
        if ($acquired) { try { $script:StatusLock.ReleaseMutex() } catch { } }
    }
}

function Report-Step {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [string] $StepName,
        [Parameter(Mandatory)] [string] $Status,
        [Parameter(Mandatory)] [int]    $Progress,
        [string] $Info = ''
    )

    $stepObj = [ordered]@{
        Status   = $Status
        Progress = $Progress
        Info     = $Info
        Updated  = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    }

    # Le + mescla + grava sob mutex inter-processo. Necessario porque
    # ForEach-Object -Parallel roda cada iteracao num runspace com seu proprio
    # escopo global: $global:StatusData de uma thread de coleta de arquivos NAO
    # e o mesmo objeto do thread principal. Se cada runspace so serializasse a
    # sua copia em memoria, cada relato de progresso apagaria os steps que
    # outras etapas/threads ja tinham gravado no arquivo. Ler o disco como fonte
    # da verdade a cada chamada elimina esse risco, custando so um I/O pequeno.
    $acquired = $false
    try {
        $acquired = $script:StatusLock.WaitOne(5000)
        if (-not $acquired) { return }

        $currentExecId = if (Test-Path Variable:Global:executionId) { $global:executionId } else { $null }

        $data = $null
        if (Test-Path $script:StatusFile) {
            try {
                $raw  = [System.IO.File]::ReadAllText($script:StatusFile, [System.Text.Encoding]::UTF8)
                if ($raw) { $data = $raw | ConvertFrom-Json -AsHashtable }
            } catch { $data = $null }
        }
        # Arquivo no disco e de uma execucao diferente (sobra da execucao
        # anterior, ou runspace paralelo cujo Initialize-Status ainda nao
        # rodou) - descarta e comeca um estado novo em vez de misturar.
        if ($null -ne $data -and $currentExecId -and $data.ContainsKey('ExecutionId') -and $data.ExecutionId -ne $currentExecId) {
            $data = $null
        }
        if ($null -eq $data) {
            $execId = if (Test-Path Variable:Global:executionId) { $global:executionId } else { [guid]::NewGuid().ToString() }
            $data = @{
                ExecutionId = $execId
                StartTime   = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
                Status      = 'In Progress'
                Steps       = @{}
            }
        }
        if (-not $data.ContainsKey('Steps') -or $null -eq $data.Steps) { $data.Steps = @{} }

        $data.LastUpdate         = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
        $data.Status             = 'In Progress'
        $data.Steps[$StepName]   = $stepObj

        $global:StatusData = $data
        $json = $data | ConvertTo-Json -Depth 6 -Compress
        [System.IO.File]::WriteAllText($script:StatusFile, $json, [System.Text.Encoding]::UTF8)
    } catch {
        # Persistencia em disco e best-effort
    } finally {
        if ($acquired) { try { $script:StatusLock.ReleaseMutex() } catch { } }
    }
}
