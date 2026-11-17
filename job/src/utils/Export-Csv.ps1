# ==============================================================================
# UTILITARIO GENERICO DE EXPORT CSV - usado por todos os modulos
# ==============================================================================

function Write-CsvAppend {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [Object[]] $Data,
        [Parameter(Mandatory)] [string]   $Path,
        [string] $Delimiter = '|'
    )
    if ($null -eq $Data -or $Data.Count -eq 0) { return }

    $dir = Split-Path $Path -Parent
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }

    $writeHeader = -not (Test-Path $Path)
    if ($writeHeader) {
        $Data | Export-Csv -Path $Path -NoTypeInformation -Delimiter $Delimiter -Encoding UTF8
    } else {
        $Data | ConvertTo-Csv -NoTypeInformation -Delimiter $Delimiter |
                Select-Object -Skip 1 |
                Out-File -Append -FilePath $Path -Encoding UTF8
    }
}

function Get-CsvOutputPath {
    param(
        [Parameter(Mandatory)] [string] $ModuleName,
        [Parameter(Mandatory)] [string] $FileName,
        [string] $BaseDir = '.\src\done'
    )
    $dir = Join-Path $BaseDir $ModuleName
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    return Join-Path $dir $FileName
}
