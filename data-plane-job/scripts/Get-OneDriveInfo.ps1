#Requires -Version 7.0

<#
.SYNOPSIS
    Coleta informações de OneDrive for Business

.DESCRIPTION
    Inspeciona OnDrives dos usuários, permissões, compartilhamentos, etc.

.NOTES
    Este módulo será expandido posteriormente.
    Hoje é apenas um placeholder estrutural.
#>

function Get-OneDriveInfo {
    param(
        [Parameter(Mandatory=$true)]
        [string]$M365TenantId
    )

    Write-Verbose "Iniciando coleta de OneDrive for Business para tenant: $M365TenantId"

    # TODO: Implementar coleta real
    # - Listar todos os OneDrives
    # - Por cada OneDrive:
    #   - Permissões
    #   - Documentos compartilhados
    #   - Shares externos
    #   - Metadados

    return @{
        OneDrivesVisitados = 0
        DocumentosAnalisados = 0
        CompartilhamentosExternos = 0
        GBAnalisado = 0
    }
}

Export-ModuleMember -Function Get-OneDriveInfo
