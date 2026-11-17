# ==============================================================================
# MODULO: VALIDACAO DE CAIXAS DE EMAIL - EXCHANGE ONLINE (Microsoft Graph Reports API)
# ------------------------------------------------------------------------------
# Traz, por usuario: tamanho da caixa ATIVA (Storage Used), quotas, contagem
# de itens e indicador de ARCHIVE habilitado. Mesma fonte/formato de
# Get-ActivityInfo.ps1 (reports/getMailboxUsageDetail) - requer
# Reports.Read.All (Application), com admin consent (mesma permissao ja
# usada por process_adoption_info, nenhuma permissao nova necessaria).
#
# LIMITACAO CONHECIDA (decisao tomada com o usuario): o Graph Reports API NAO
# expoe o TAMANHO do archive mailbox, so o indicador "Has Archive"
# (true/false) - storage_used_bytes aqui e sempre o da caixa PRINCIPAL/ativa.
# Pra ter o tamanho numerico do archive seria necessario Exchange Online
# PowerShell (Get-EXOMailboxStatistics -Archive), que exige modulo
# (ExchangeOnlineManagement), permissao (Exchange.ManageAsApp) e role group
# no tenant diferentes dos ja usados neste projeto - fora do escopo desta
# versao.
#
# Mesmo aviso de Get-ActivityInfo.ps1: o endpoint so responde CSV
# ($format=application/json da 400 "JSON format is not supported") e, se
# "Conceal user names in reports" estiver habilitado no tenant, User
# Principal Name vem anonimizado (GUID) ate o admin desligar essa opcao.
# ==============================================================================

function Get-JsonProp {
    param($Object, [Parameter(Mandatory)] [string] $Name)
    if ($null -ne $Object -and $Object.PSObject.Properties[$Name]) { return $Object.$Name }
    return $null
}

function ToInt64Safe {
    param($Value)
    if ($null -eq $Value) { return 0 }
    $s = "$Value".Trim()
    if ($s -eq '') { return 0 }
    $parsed = 0L
    if ([int64]::TryParse($s, [ref]$parsed)) { return $parsed }
    return 0
}

function ToDateSafe {
    param($Value)
    if ($null -eq $Value) { return $null }
    $s = "$Value".Trim()
    if ($s -eq '') { return $null }
    $parsed = [datetime]::MinValue
    if ([datetime]::TryParse($s, [ref]$parsed)) { return $parsed }
    return $null
}

function Get-MailboxInfo {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$false)] $Connection = $null
    )

    Write-Log -Level INFO -Module 'Mailbox' -Message 'Iniciando coleta de caixas de email (Exchange).' -DbConnection $Connection
    Report-Step -StepName 'Coleta de Caixas de Email' -Status 'in progress' -Progress 0 -Info 'Consultando relatorio do Graph'

    $executionId = $global:executionId
    $storeSql    = $global:params.store_in_sql
    $storeCsv    = $global:params.store_in_csv
    $batchSize   = if ($global:params.sql_batch_size) { [int]$global:params.sql_batch_size } else { 500 }
    $csvPath     = Get-CsvOutputPath -ModuleName 'mailbox' -FileName 'mailbox_info.csv'

    # Sem $format=application/json de proposito - esse relatorio so responde
    # CSV (ver comentario no topo do arquivo). Period='D7' nao afeta o
    # snapshot de storage (nao e metrica de atividade), so delimita a janela
    # de "Last Activity Date" retornada.
    $uri = "https://graph.microsoft.com/v1.0/reports/getMailboxUsageDetail(period='D7')"

    $lote  = New-Object System.Collections.Generic.List[object]
    $total = 0

    try {
        $csvText = Invoke-GraphRequest -Uri $uri
        $rows = if ($csvText -is [string] -and $csvText.Trim() -ne '') { @($csvText | ConvertFrom-Csv) } else { @() }

        Write-Log -Level INFO -Module 'Mailbox' -Message "$($rows.Count) caixas no relatorio." -DbConnection $Connection

        foreach ($row in $rows) {
            $isDeleted  = "$(Get-JsonProp $row 'Is Deleted')".Trim() -eq 'True'
            $hasArchive = "$(Get-JsonProp $row 'Has Archive')".Trim() -eq 'True'

            $lote.Add([PSCustomObject]@{
                ExecutionId                   = $executionId
                UserPrincipalName             = Get-JsonProp $row 'User Principal Name'
                DisplayName                   = Get-JsonProp $row 'Display Name'
                ItemCount                     = ToInt64Safe (Get-JsonProp $row 'Item Count')
                StorageUsedBytes              = ToInt64Safe (Get-JsonProp $row 'Storage Used (Byte)')
                IssueWarningQuotaBytes        = ToInt64Safe (Get-JsonProp $row 'Issue Warning Quota (Byte)')
                ProhibitSendQuotaBytes        = ToInt64Safe (Get-JsonProp $row 'Prohibit Send Quota (Byte)')
                ProhibitSendReceiveQuotaBytes = ToInt64Safe (Get-JsonProp $row 'Prohibit Send/Receive Quota (Byte)')
                DeletedItemCount              = ToInt64Safe (Get-JsonProp $row 'Deleted Item Count')
                DeletedItemSizeBytes          = ToInt64Safe (Get-JsonProp $row 'Deleted Item Size (Byte)')
                HasArchive                    = $hasArchive
                LastActivityDate              = ToDateSafe (Get-JsonProp $row 'Last Activity Date')
                IsDeleted                     = $isDeleted
            })
            $total++

            if ($lote.Count -ge $batchSize) {
                Flush-Mailbox -Lote $lote -Connection $Connection -CsvPath $csvPath -StoreSql:$storeSql -StoreCsv:$storeCsv
            }
        }
        Flush-Mailbox -Lote $lote -Connection $Connection -CsvPath $csvPath -StoreSql:$storeSql -StoreCsv:$storeCsv

        Write-Log -Level SUCCESS -Module 'Mailbox' -Message "Coleta de caixas concluida. $total caixas processadas." -DbConnection $Connection
        Report-Step -StepName 'Coleta de Caixas de Email' -Status 'completed' -Progress 100 -Info "$total caixas"
        return $true
    }
    catch {
        Write-Log -Level ERROR -Module 'Mailbox' -Message 'Falha na coleta de caixas de email (permissao Reports.Read.All concedida?).' -Exception $_.Exception.Message -DbConnection $Connection
        Report-Step -StepName 'Coleta de Caixas de Email' -Status 'failed' -Progress 100 -Info $_.Exception.Message
        return $false
    }
}

function Flush-Mailbox {
    param($Lote, $Connection, [string]$CsvPath, [switch]$StoreSql, [switch]$StoreCsv)
    if ($null -eq $Lote -or $Lote.Count -eq 0) { return }
    $arr = $Lote.ToArray()
    if ($StoreCsv) { Write-CsvAppend -Data $arr -Path $CsvPath }
    if ($StoreSql -and $null -ne $Connection) { Save-MailboxInfo -Batch $arr -Connection $Connection | Out-Null }
    $Lote.Clear()
}
