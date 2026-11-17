# ==============================================================================
# MODULO: ADOCAO / ATIVIDADE DE USUARIOS (Microsoft Graph - Reports API)
# ------------------------------------------------------------------------------
# Le os relatorios de atividade por usuario (ultimos 30 dias - "D30") pra
# SharePoint, OneDrive, Exchange (email) e Teams - mesma fonte de dados do
# dashboard "Analise de Utilizacao do Microsoft 365" da propria Microsoft
# (https://learn.microsoft.com/microsoft-365/admin/usage-analytics).
#
# IMPORTANTE: esses relatorios ("...ActivityUserDetail") SO retornam CSV -
# "?$format=application/json" da 400 "JSON format is not supported." (erro
# real, confirmado em producao). Invoke-GraphRequest (Invoke-RestMethod por
# baixo) nao auto-parseia CSV como faz com JSON, entao a resposta volta como
# STRING bruta - convertida aqui via ConvertFrom-Csv. Os headers do CSV usam
# nomes com espaco (ex.: "User Principal Name", nao "userPrincipalName") e
# TODOS os valores vem como string (datas e numeros inclusive) - por isso
# ToInt64Safe/ToDateSafe abaixo, em vez de cast direto (string vazia "" em
# campo numerico quebra com [int64]"" direto).
#
# Requer a permissao Reports.Read.All (Application) no App Registration, com
# admin consent - nao esta nas permissoes usadas pelos outros modulos. Cada
# relatorio tem seu proprio try/catch: se a permissao nao estiver concedida
# ou 1 relatorio falhar, os outros continuam normalmente.
#
# Set-StrictMode -Version 3.0 (main.ps1) faz acessar propriedade inexistente
# no objeto virar erro em vez de $null - por isso Get-JsonProp guarda cada
# leitura (mesmo padrao de Get-IntuneInfo.ps1).
#
# AVISO: se o tenant tiver "Conceal user names in reports" habilitado (padrao
# em tenants novos), o valor de "User Principal Name" vem anonimizado (um
# GUID) em vez do e-mail real. A coleta funciona normalmente - so os nomes na
# aba Adocao ficam anonimos ate o admin do tenant desligar essa opcao.
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

function Get-ActivityInfo {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$false)] $Connection = $null
    )

    Write-Log -Level INFO -Module 'Activity' -Message 'Iniciando coleta de atividade de usuarios (D30).' -DbConnection $Connection
    Report-Step -StepName 'Coleta de Adocao' -Status 'in progress' -Progress 0 -Info 'Consultando relatorios do Graph'

    $executionId = $global:executionId
    $storeSql    = $global:params.store_in_sql
    $batchSize   = if ($global:params.sql_batch_size) { [int]$global:params.sql_batch_size } else { 500 }

    # Sem $format=application/json de proposito (ver comentario no topo do
    # arquivo) - esses relatorios so respondem CSV.
    $reports = @(
        @{ Service = 'SharePoint'; Uri = "https://graph.microsoft.com/v1.0/reports/getSharePointActivityUserDetail(period='D30')"; CountCol = 'Viewed Or Edited File Count' }
        @{ Service = 'OneDrive';   Uri = "https://graph.microsoft.com/v1.0/reports/getOneDriveActivityUserDetail(period='D30')";   CountCol = 'Viewed Or Edited File Count' }
        @{ Service = 'Exchange';   Uri = "https://graph.microsoft.com/v1.0/reports/getEmailActivityUserDetail(period='D30')";      CountCol = 'Send Count' }
        @{ Service = 'Teams';      Uri = "https://graph.microsoft.com/v1.0/reports/getTeamsUserActivityUserDetail(period='D30')";  CountCol = $null }
    )

    $lote      = New-Object System.Collections.Generic.List[object]
    $totalRows = 0

    try {
        foreach ($r in $reports) {
            try {
                $csvText = Invoke-GraphRequest -Uri $r.Uri
                $rows = if ($csvText -is [string] -and $csvText.Trim() -ne '') { @($csvText | ConvertFrom-Csv) } else { @() }

                Write-Log -Level INFO -Module 'Activity' -Message "$($r.Service): $($rows.Count) usuarios no relatorio." -DbConnection $Connection

                foreach ($row in $rows) {
                    $upn          = Get-JsonProp $row 'User Principal Name'
                    $lastActivity = ToDateSafe (Get-JsonProp $row 'Last Activity Date')
                    $isDeleted    = "$(Get-JsonProp $row 'Is Deleted')".Trim() -eq 'True'

                    # Cada relatorio tem colunas de contagem diferentes - usa a
                    # mais representativa de "uso" por servico. Teams soma 4
                    # colunas em vez de 1 so.
                    $activityCount = if ($r.Service -eq 'Teams') {
                        (ToInt64Safe (Get-JsonProp $row 'Team Chat Message Count')) +
                        (ToInt64Safe (Get-JsonProp $row 'Private Chat Message Count')) +
                        (ToInt64Safe (Get-JsonProp $row 'Call Count')) +
                        (ToInt64Safe (Get-JsonProp $row 'Meeting Count'))
                    } else {
                        ToInt64Safe (Get-JsonProp $row $r.CountCol)
                    }

                    $lote.Add([PSCustomObject]@{
                        ExecutionId       = $executionId
                        UserPrincipalName = $upn
                        Service           = $r.Service
                        LastActivityDate  = $lastActivity
                        ActivityCount     = $activityCount
                        IsDeleted         = $isDeleted
                    })
                    $totalRows++

                    if ($lote.Count -ge $batchSize) {
                        Flush-Activity -Lote $lote -Connection $Connection -StoreSql:$storeSql
                    }
                }
            } catch {
                Write-Log -Level WARNING -Module 'Activity' -Message "Falha ao coletar relatorio de $($r.Service) (permissao Reports.Read.All concedida?)." -Exception $_.Exception.Message -DbConnection $Connection
            }
        }
        Flush-Activity -Lote $lote -Connection $Connection -StoreSql:$storeSql

        Write-Log -Level SUCCESS -Module 'Activity' -Message "Coleta de adocao concluida. $totalRows registros." -DbConnection $Connection
        Report-Step -StepName 'Coleta de Adocao' -Status 'completed' -Progress 100 -Info "$totalRows registros"
        return $true
    }
    catch {
        Write-Log -Level ERROR -Module 'Activity' -Message 'Falha na coleta de adocao.' -Exception $_.Exception.Message -DbConnection $Connection
        Report-Step -StepName 'Coleta de Adocao' -Status 'failed' -Progress 100 -Info $_.Exception.Message
        return $false
    }
}

function Flush-Activity {
    param($Lote, $Connection, [switch]$StoreSql)
    if ($null -eq $Lote -or $Lote.Count -eq 0) { return }
    $arr = $Lote.ToArray()
    if ($StoreSql -and $null -ne $Connection) { Save-UserActivity -Batch $arr -Connection $Connection | Out-Null }
    $Lote.Clear()
}
