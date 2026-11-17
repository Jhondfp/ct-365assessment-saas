# ==============================================================================
# MODULO: COLETA DE METADADOS DE LICENCIAMENTO (Microsoft Graph)
# ------------------------------------------------------------------------------
# - URL e scope corrigidos (era apontando para "microsoft.com" - bug critico)
# - Token obtido via Connect-Graph (cache + retry + paginacao automatica)
# - Persistencia generica via Save-LicensingInfo / Write-CsvAppend
# ==============================================================================

function Get-LicensingData {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$false)] $Connection = $null
    )

    Write-Log -Level INFO -Module 'Licensing' -Message 'Iniciando coleta de licenciamento.' -DbConnection $Connection
    Report-Step -StepName 'Coleta de Licenciamento' -Status 'in progress' -Progress 5 -Info 'Mapeamento de SKUs iniciado'

    $executionId = $global:executionId
    $storeInSql  = $global:params.store_in_sql
    $storeInCsv  = $global:params.store_in_csv
    $batchSize   = if ($global:params.sites_batch_size) { [int]$global:params.sites_batch_size } else { 100 }
    $csvPath     = Get-CsvOutputPath -ModuleName 'licensing' -FileName 'licensing_metadados.csv'

    try {
        # ENDPOINT CORRETO do Microsoft Graph
        $graphUri = 'https://graph.microsoft.com/v1.0/subscribedSkus'

        $licencas = [System.Collections.Generic.List[object]]::new()
        $nextUri = $graphUri
        do {
            $page    = Invoke-GraphRequest -Uri $nextUri
            if ($page -and $page.value) {
                foreach ($item in @($page.value)) { $licencas.Add($item) }
            }
            $nextUri = $page | Select-Object -ExpandProperty '@odata.nextLink' -ErrorAction SilentlyContinue
        } while ($nextUri)

        if ($licencas.Count -eq 0) {
            Write-Log -Level WARNING -Module 'Licensing' -Message 'Nenhuma licenca retornada pelo Graph.' -DbConnection $Connection
            Report-Step -StepName 'Coleta de Licenciamento' -Status 'completed' -Progress 100 -Info 'Sem dados'
            return $true
        }

        $skuFriendlyNames = @{
            'STANDARDPACK'                  = 'Office 365 E1'
            'ENTERPRISEPACK'                = 'Office 365 E3'
            'ENTERPRISEPREMIUM'             = 'Office 365 E5'
            'OFFICESUBSCRIPTION'            = 'Office 365 ProPlus'
            'OFFICE_PRO_PLUS_SUBSCRIPTION'  = 'Office 365 ProPlus'
            'M365BUSINESSBASIC'             = 'Microsoft 365 Business Basic'
            'M365BUSINESSSTANDARD'          = 'Microsoft 365 Business Standard'
            'M365BUSINESSPREMIUM'           = 'Microsoft 365 Business Premium'
            'M365F1'                        = 'Microsoft 365 F1'
            'M365F3'                        = 'Microsoft 365 F3'
            'M365E3'                        = 'Microsoft 365 E3'
            'M365E5'                        = 'Microsoft 365 E5'
            'EXCHANGE_S_STANDARD'           = 'Exchange Online Plan 1'
            'EXCHANGE_S_ENTERPRISE'         = 'Exchange Online Plan 2'
            'SHAREPOINTSTANDARD'            = 'SharePoint Online Plan 1'
            'SHAREPOINTENTERPRISE'          = 'SharePoint Online Plan 2'
            'TEAMS1'                        = 'Microsoft Teams Essentials'
            'POWER_BI_PRO'                  = 'Power BI Pro'
            'Microsoft_365_Copilot'         = 'Copilot 365'
        }

        $lote = New-Object System.Collections.Generic.List[object]
        $now  = Get-Date

        foreach ($sku in $licencas) {
            $enabled = if ($null -ne $sku.prepaidUnits.enabled) { [int64]$sku.prepaidUnits.enabled } else { 0 }
            $warning = if ($null -ne $sku.prepaidUnits.warning) { [int64]$sku.prepaidUnits.warning } else { 0 }
            $used    = if ($null -ne $sku.consumedUnits)         { [int64]$sku.consumedUnits } else { 0 }

            $friendly = if ($skuFriendlyNames.ContainsKey($sku.skuPartNumber)) {
                $skuFriendlyNames[$sku.skuPartNumber]
            } else { $sku.skuPartNumber }

            $lote.Add([PSCustomObject]@{
                ExecutionId     = $executionId
                sku_id          = $sku.skuId
                sku_part_number = $sku.skuPartNumber
                friendly_name   = $friendly
                total_licenses  = ($enabled + $warning)
                used_licenses   = $used
                timestamp       = $now
            })

            if ($lote.Count -ge $batchSize) {
                Flush-Licensing -Lote $lote -Connection $Connection -CsvPath $csvPath -StoreSql:$storeInSql -StoreCsv:$storeInCsv
            }
        }
        Flush-Licensing -Lote $lote -Connection $Connection -CsvPath $csvPath -StoreSql:$storeInSql -StoreCsv:$storeInCsv

        Write-Log -Level SUCCESS -Module 'Licensing' -Message "Coleta concluida. $($licencas.Count) SKUs processados." -DbConnection $Connection
        Report-Step -StepName 'Coleta de Licenciamento' -Status 'completed' -Progress 100 -Info "$($licencas.Count) SKUs"
        return $true
    }
    catch {
        Write-Log -Level ERROR -Module 'Licensing' -Message 'Falha na coleta de licenciamento.' -Exception $_.Exception.Message -DbConnection $Connection
        Report-Step -StepName 'Coleta de Licenciamento' -Status 'failed' -Progress 100 -Info $_.Exception.Message
        return $false
    }
}

function Flush-Licensing {
    param($Lote, $Connection, [string]$CsvPath, [switch]$StoreSql, [switch]$StoreCsv)
    if ($null -eq $Lote -or $Lote.Count -eq 0) { return }
    $arr = $Lote.ToArray()
    if ($StoreCsv) { Write-CsvAppend -Data $arr -Path $CsvPath }
    if ($StoreSql -and $null -ne $Connection) { Save-LicensingInfo -Batch $arr -Connection $Connection | Out-Null }
    $Lote.Clear()
}
