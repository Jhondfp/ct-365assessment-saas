# ==============================================================================
# UTILITARIOS DE LOG - escreve em console, arquivo e (opcionalmente) banco
# ==============================================================================

$script:LogFile = $null
$script:LogLock = New-Object System.Threading.Mutex($false, "Global\CT_LogLock")

function Initialize-Logger {
    param(
        [string] $LogDir = '.\logs'
    )
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
    $script:LogFile = Join-Path $LogDir ("execution_{0:yyyy-MM-dd}.log" -f (Get-Date))

    # Exposto em escopo global para que runspaces paralelos (ForEach-Object -Parallel),
    # que re-executam este arquivo do zero via dot-source e por isso comecam com
    # $script:LogFile = $null, consigam recuperar o mesmo caminho e escrever no
    # mesmo arquivo em vez de perder silenciosamente todo log gerado dentro deles.
    $global:LogFilePath = $script:LogFile
}

function Write-Log {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [ValidateSet('INFO','WARNING','ERROR','SUCCESS','CRITICAL','DEBUG')] [string] $Level,
        [Parameter(Mandatory)] [string] $Module,
        [Parameter(Mandatory)] [string] $Message,
        [string] $SiteUrl   = $null,
        [string] $Exception = $null,
        [object] $DbConnection = $null,
        [switch] $NoConsole
    )

    $ts        = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss.fff')
    $threadId  = [System.Threading.Thread]::CurrentThread.ManagedThreadId
    $line      = "[$ts] [$Level] [$Module] [T$threadId] $Message"
    if ($SiteUrl)   { $line += " | site=$SiteUrl" }
    if ($Exception) { $line += " | ex=$Exception" }

    # Console com cor
    if (-not $NoConsole) {
        $color = switch ($Level) {
            'INFO'     { 'Gray' }
            'WARNING'  { 'Yellow' }
            'ERROR'    { 'Red' }
            'CRITICAL' { 'Magenta' }
            'SUCCESS'  { 'Green' }
            'DEBUG'    { 'DarkGray' }
            default    { 'White' }
        }
        Write-Host $line -ForegroundColor $color
    }

    # Arquivo - sob mutex inter-processo/inter-thread. Sem isto, escritas
    # concorrentes de threads/runspaces diferentes (ex: coleta paralela de sites)
    # colidem no Add-Content, o erro de compartilhamento e engolido pelo
    # -ErrorAction SilentlyContinue, e a linha desaparece sem deixar rastro.
    if ($script:LogFile) {
        $acquired = $false
        try {
            $acquired = $script:LogLock.WaitOne(3000)
            Add-Content -Path $script:LogFile -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue
        } catch { }
        finally {
            if ($acquired) { try { $script:LogLock.ReleaseMutex() } catch { } }
        }
    }

    # Banco (se conexao fornecida)
    if ($null -ne $DbConnection -and (Get-Command 'Save-ExecutionLog' -ErrorAction SilentlyContinue)) {
        try {
            Save-ExecutionLog -Level $Level -Module $Module -Message $Message `
                -SiteUrl $SiteUrl -Exception $Exception -Connection $DbConnection
        } catch { }
    }
}

# Alias retrocompativel
Set-Alias -Name Write-LogSQL -Value Write-Log -Scope Global -ErrorAction SilentlyContinue
