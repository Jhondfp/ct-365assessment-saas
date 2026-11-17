# ==============================================================================
# MODULO: COLETA DE DISPOSITIVOS GERENCIADOS (Intune / Microsoft Graph)
# ------------------------------------------------------------------------------
# - Token via modulo central de Graph (Connect-Graph.ps1) - cache automatico
# - Paginacao automatica via Invoke-GraphRequest -All
# - Persistencia generica via Save-IntuneDevices / Save-IntuneComplianceStates
# - Compliance policy states: 1 chamada extra POR DISPOSITIVO
#   (/managedDevices/{id}/deviceCompliancePolicyStates) - navigation property
#   coberta pelo mesmo DeviceManagementManagedDevices.Read.All ja concedido,
#   sem precisar de permissao nova. Sequencial (nao paralelo) de proposito,
#   mesmo padrao do Get-OwnerStatus.ps1, pra nao martelar o Graph.
# - src/main.ps1 ativa Set-StrictMode -Version 3.0: acessar uma propriedade
#   que nao existe no objeto retornado pelo Graph (nem todo managedDevice
#   devolve os mesmos campos - varia por plataforma/tipo de enrollment)
#   estoura erro em vez de virar $null. Por isso todo acesso a campo do Graph
#   aqui passa por Get-JsonProp, que guarda com PSObject.Properties[...] antes.
# ==============================================================================

function Get-JsonProp {
    param($Object, [Parameter(Mandatory)] [string] $Name)
    if ($null -ne $Object -and $Object.PSObject.Properties[$Name]) { return $Object.$Name }
    return $null
}

function Get-IntuneInfo {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$false)] $Connection = $null
    )

    Write-Log -Level INFO -Module 'Intune' -Message 'Iniciando coleta de dispositivos Intune.' -DbConnection $Connection
    Report-Step -StepName 'Intune - Coleta' -Status 'in progress' -Progress 0 -Info 'Autenticando no Graph'

    $executionId = $global:executionId
    $storeSql = $global:params.store_in_sql
    $storeCsv = $global:params.store_in_csv
    $batchSize = if ($global:params.sql_batch_size) { [int]$global:params.sql_batch_size } else { 500 }
    $csvPath  = Get-CsvOutputPath -ModuleName 'intune' -FileName 'intune_devices.csv'

    try {
        # $expand=deviceHealthAttestationState so e suportado ao consultar 1 device
        # por id - na collection inteira o Graph responde 400 Bad Request. O status
        # de antivirus real vem de partnerReportedThreatState (Defender/parceiro),
        # que ja e uma propriedade direta do managedDevice, sem precisar de expand.
        $uri = 'https://graph.microsoft.com/v1.0/deviceManagement/managedDevices'
        $resp = Invoke-GraphRequest -Uri $uri -All

        if ($null -eq $resp.value -or $resp.value.Count -eq 0) {
            Write-Log -Level WARNING -Module 'Intune' -Message 'Nenhum dispositivo retornado.' -DbConnection $Connection
            Report-Step -StepName 'Intune - Coleta' -Status 'completed' -Progress 100 -Info 'Sem dispositivos'
            return $true
        }

        Report-Step -StepName 'Intune - Coleta' -Status 'in progress' -Progress 50 -Info "$($resp.value.Count) dispositivos"

        $lote           = New-Object System.Collections.Generic.List[object]
        $loteCompliance = New-Object System.Collections.Generic.List[object]
        $riskCount = 0
        $done      = 0
        $total     = $resp.value.Count

        foreach ($d in $resp.value) {
            $deviceId       = Get-JsonProp $d 'id'
            $deviceName     = Get-JsonProp $d 'deviceName'
            $isEncryptedRaw = Get-JsonProp $d 'isEncrypted'
            $isEncrypted    = [bool]$isEncryptedRaw
            $complianceState = Get-JsonProp $d 'complianceState'
            $jailBrokenRaw   = Get-JsonProp $d 'jailBroken'
            $jailBroken      = ($jailBrokenRaw -eq 'true' -or $jailBrokenRaw -eq $true)
            $antivirusRaw    = Get-JsonProp $d 'partnerReportedThreatState'
            $noAntivirus     = ($null -ne $antivirusRaw -and $antivirusRaw -notin @('secured','unknown','notReported'))
            $noBitLocker     = ($isEncryptedRaw -eq $false)
            $isRisk          = ($complianceState -ne 'compliant' -or $jailBroken -or $noAntivirus -or $noBitLocker)
            if ($isRisk) { $riskCount++ }

            $lote.Add([PSCustomObject]@{
                ExecutionId       = $executionId
                DeviceId          = $deviceId
                DeviceName        = $deviceName
                DeviceType        = Get-JsonProp $d 'deviceType'
                OperatingSystem   = Get-JsonProp $d 'operatingSystem'
                OsVersion         = Get-JsonProp $d 'osVersion'
                UserPrincipalName = Get-JsonProp $d 'userPrincipalName'
                OwnerName         = Get-JsonProp $d 'userDisplayName'
                ComplianceState   = $complianceState
                JailBroken        = $jailBroken
                IsEncrypted       = $isEncrypted
                AntivirusStatus   = if ($null -ne $antivirusRaw) { $antivirusRaw } else { 'unknown' }
                ComplianceRisk    = if ($complianceState -ne 'compliant') { 1 } else { 0 }
                ManagementAgent   = Get-JsonProp $d 'managementAgent'
                EnrollmentDate    = Get-JsonProp $d 'enrolledDateTime'
                LastSyncDateTime  = Get-JsonProp $d 'lastSyncDateTime'
                BitlockerStatus   = if ($isEncrypted) { 'Ativo' } else { 'Desativado' }
                RiskFlag          = if ($isRisk) { 'Risco' } else { 'OK' }
                Model             = Get-JsonProp $d 'model'
                Manufacturer      = Get-JsonProp $d 'manufacturer'
                SerialNumber      = Get-JsonProp $d 'serialNumber'
                OwnerType         = Get-JsonProp $d 'managedDeviceOwnerType'
                EnrollmentType    = Get-JsonProp $d 'deviceEnrollmentType'
                AzureAdRegistered = [bool](Get-JsonProp $d 'azureADRegistered')
            })

            # Motivo da (nao-)compliance por politica - 1 chamada extra por
            # device (navigation property, mesma permissao ja concedida).
            # Falha isolada aqui nao derruba a coleta - so fica sem o detalhe
            # daquele device, o resto (ComplianceState/ComplianceRisk acima)
            # ja veio da chamada principal.
            if ($deviceId) {
                try {
                    $compUri  = "https://graph.microsoft.com/v1.0/deviceManagement/managedDevices/$deviceId/deviceCompliancePolicyStates"
                    $compResp = Invoke-GraphRequest -Uri $compUri -All
                    foreach ($cs in $compResp.value) {
                        $loteCompliance.Add([PSCustomObject]@{
                            ExecutionId  = $executionId
                            DeviceId     = $deviceId
                            DeviceName   = $deviceName
                            PolicyName   = Get-JsonProp $cs 'displayName'
                            PlatformType = Get-JsonProp $cs 'platformType'
                            State        = Get-JsonProp $cs 'state'
                            SettingCount = Get-JsonProp $cs 'settingCount'
                        })
                    }
                } catch {
                    Write-Log -Level WARNING -Module 'Intune' -Message "Falha ao obter compliance policy states de '$deviceName'." -Exception $_.Exception.Message -DbConnection $Connection
                }
            }

            $done++
            if ($done % 25 -eq 0) {
                Report-Step -StepName 'Intune - Coleta' -Status 'in progress' -Progress ([Math]::Min(95, 50 + [int](45 * $done / $total))) -Info "$done/$total dispositivos"
            }

            if ($lote.Count -ge $batchSize) {
                Flush-Intune -Lote $lote -Connection $Connection -CsvPath $csvPath -StoreSql:$storeSql -StoreCsv:$storeCsv
            }
            if ($loteCompliance.Count -ge $batchSize) {
                Flush-IntuneCompliance -Lote $loteCompliance -Connection $Connection -StoreSql:$storeSql
            }
        }
        Flush-Intune -Lote $lote -Connection $Connection -CsvPath $csvPath -StoreSql:$storeSql -StoreCsv:$storeCsv
        Flush-IntuneCompliance -Lote $loteCompliance -Connection $Connection -StoreSql:$storeSql

        Write-Log -Level SUCCESS -Module 'Intune' -Message "$($resp.value.Count) dispositivos | $riskCount em risco." -DbConnection $Connection
        Report-Step -StepName 'Intune - Coleta' -Status 'completed' -Progress 100 -Info "Total: $($resp.value.Count) | Risco: $riskCount"
        return $true
    }
    catch {
        Write-Log -Level ERROR -Module 'Intune' -Message 'Falha na coleta de Intune.' -Exception $_.Exception.Message -DbConnection $Connection
        Report-Step -StepName 'Intune - Coleta' -Status 'failed' -Progress 100 -Info $_.Exception.Message
        return $false
    }
}

function Flush-Intune {
    param($Lote, $Connection, [string]$CsvPath, [switch]$StoreSql, [switch]$StoreCsv)
    if ($null -eq $Lote -or $Lote.Count -eq 0) { return }
    $arr = $Lote.ToArray()
    if ($StoreCsv) { Write-CsvAppend -Data $arr -Path $CsvPath }
    if ($StoreSql -and $null -ne $Connection) { Save-IntuneDevices -Batch $arr -Connection $Connection | Out-Null }
    $Lote.Clear()
}

function Flush-IntuneCompliance {
    param($Lote, $Connection, [switch]$StoreSql)
    if ($null -eq $Lote -or $Lote.Count -eq 0) { return }
    $arr = $Lote.ToArray()
    if ($StoreSql -and $null -ne $Connection) { Save-IntuneComplianceStates -Batch $arr -Connection $Connection | Out-Null }
    $Lote.Clear()
}
