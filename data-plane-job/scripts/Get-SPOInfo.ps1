#Requires -Version 7.0

<#
.SYNOPSIS
    Coleta informações de SharePoint Online

.DESCRIPTION
    Inspeciona sites SharePoint, permissões, documentos compartilhados, etc.

.NOTES
    Este módulo será expandido posteriormente.
    Hoje é apenas um placeholder estrutural.
#>

function Get-SPOInfo {
    param(
        [Parameter(Mandatory=$true)]
        [string]$M365TenantId
    )

    Write-Verbose "Iniciando coleta de SharePoint Online para tenant: $M365TenantId"

    # TODO: Implementar coleta real
    # - Listar todos os sites
    # - Por cada site:
    #   - Permissões
    #   - Documentos
    #   - Compartilhamentos externos
    #   - Metadados

    return @{
        SitesVisitados = 0
        DocumentosAnalisados = 0
        CompartilhamentosExternos = 0
        GBAnalisado = 0
    }
}

Export-ModuleMember -Function Get-SPOInfo
