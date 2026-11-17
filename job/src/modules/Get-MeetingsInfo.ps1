# ==============================================================================
# MODULO: COLETA DE REUNIOES DO TEAMS / CALENDARIO (Microsoft Graph)
# ------------------------------------------------------------------------------
# Bugs corrigidos:
#   - $EndDT = :Parse($End)  -> [datetime]::Parse($End)
#   - [math]::Round((...).Total)  -> [math]::Round((...).TotalMinutes)
#   - URL com $filter precisa estar entre aspas simples e com $ escapado
# ==============================================================================

function Get-MeetingsInfo {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$false)] $Connection = $null
    )

    Write-Log -Level INFO -Module 'Meetings' -Message 'Iniciando coleta de reunioes.' -DbConnection $Connection
    Report-Step -StepName 'Coleta de Reunioes' -Status 'in progress' -Progress 0 -Info 'Autenticando no Graph'

    $executionId = $global:executionId
    $storeSql = $global:params.store_in_sql
    $storeCsv = $global:params.store_in_csv
    $users    = @($global:params.users_meeting)
    $tenantName = $global:auth.spo_tenant
    $csvPath  = Get-CsvOutputPath -ModuleName 'meetings' -FileName 'meetings_info.csv'

    if ($null -eq $users -or $users.Count -eq 0) {
        Write-Log -Level WARNING -Module 'Meetings' -Message 'Parametro users_meeting vazio - nada a coletar.' -DbConnection $Connection
        Report-Step -StepName 'Coleta de Reunioes' -Status 'completed' -Progress 100 -Info 'Sem usuarios configurados'
        return $true
    }

    $categoriaAlvo = 'Projeto'
    $endDate   = (Get-Date).ToUniversalTime()
    $startDate = $endDate.AddDays(-7)
    $startStr  = $startDate.ToString('yyyy-MM-ddTHH:mm:ssZ')
    $endStr    = $endDate.ToString('yyyy-MM-ddTHH:mm:ssZ')

    $resultados = New-Object System.Collections.Generic.List[object]

    foreach ($userEmail in $users) {
        Write-Log -Level INFO -Module 'Meetings' -Message "Buscando reunioes de $userEmail" -DbConnection $Connection

        # URL bem-formada com $ escapado (necessario em string aspas duplas)
        $calendarUri = "https://graph.microsoft.com/v1.0/users/$userEmail/calendarView" +
                       "?startDateTime=$startStr&endDateTime=$endStr" +
                       "&`$select=subject,start,end,categories,organizer,onlineMeeting"

        try {
            $resp = Invoke-GraphRequest -Uri $calendarUri -All
        } catch {
            Write-Log -Level WARNING -Module 'Meetings' -Message "Falha ao buscar reunioes de $userEmail" -Exception $_.Exception.Message -DbConnection $Connection
            continue
        }

        if (-not $resp.value) { continue }

        foreach ($event in $resp.value) {
            $categories = $event.categories
            if (-not ($categories -contains $categoriaAlvo)) { continue }

            $duracao = $null
            try {
                $startDT = [datetime]::Parse($event.start.dateTime)
                $endDT   = [datetime]::Parse($event.end.dateTime)
                $duracao = [int][math]::Round(($endDT - $startDT).TotalMinutes)
            } catch {
                $duracao = $null
            }

            $organizerEmail = $event.organizer.emailAddress.address
            $tipoReuniao = if ($null -ne $organizerEmail -and $organizerEmail.ToLower().Contains($tenantName.ToLower())) {
                'Interna'
            } else { 'Externa' }

            $presenca = Get-MeetingAttendance -OnlineMeeting $event.onlineMeeting -TipoReuniao $tipoReuniao

            $resultados.Add([PSCustomObject]@{
                ExecutionId = $executionId
                Usuario     = $userEmail
                Assunto     = $event.subject
                Inicio      = $event.start.dateTime
                Fim         = $event.end.dateTime
                DuracaoMin  = $duracao
                Categorias  = if ($categories) { $categories -join ', ' } else { 'Nenhuma' }
                Tipo        = $tipoReuniao
                Presenca    = $presenca
            })
        }
    }

    if ($resultados.Count -gt 0) {
        $arr = $resultados.ToArray()
        if ($storeCsv) { Write-CsvAppend -Data $arr -Path $csvPath }
        if ($storeSql -and $null -ne $Connection) { Save-MeetingsInfo -Batch $arr -Connection $Connection | Out-Null }
    }

    Write-Log -Level SUCCESS -Module 'Meetings' -Message "$($resultados.Count) reunioes coletadas." -DbConnection $Connection
    Report-Step -StepName 'Coleta de Reunioes' -Status 'completed' -Progress 100 -Info "$($resultados.Count) eventos"
    return $true
}

# ------------------------------------------------------------------------------
# Helper: consulta relatorio de presenca apenas para reunioes internas com joinUrl
# ------------------------------------------------------------------------------
function Get-MeetingAttendance {
    param($OnlineMeeting, [string] $TipoReuniao)
    if (-not $OnlineMeeting -or $TipoReuniao -ne 'Interna') { return 'Nao verificado' }
    $joinUrl = $OnlineMeeting.joinUrl
    if (-not $joinUrl) { return 'JoinUrl indisponivel' }

    try {
        $filter = "JoinWebUrl eq '$joinUrl'"
        $lookupUri = "https://graph.microsoft.com/beta/me/onlineMeetings?`$filter=" + [Uri]::EscapeDataString($filter)
        $resp = Invoke-GraphRequest -Uri $lookupUri
        if (-not $resp.value -or $resp.value.Count -eq 0) { return 'MeetingId nao encontrado' }
        $meetingId = $resp.value[0].id

        $attUri = "https://graph.microsoft.com/beta/communications/onlineMeetings/$meetingId/attendanceReports"
        $att    = Invoke-GraphRequest -Uri $attUri
        if (-not $att.value -or $att.value.Count -eq 0) { return 'Sem relatorio' }

        $records = $att.value[0].attendanceRecords
        if ($null -ne $records -and $records.Count -gt 0) { return 'Sim' } else { return 'Nao' }
    } catch {
        return 'Erro ao consultar presenca'
    }
}
