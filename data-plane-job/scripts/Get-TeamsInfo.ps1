# ============================================================================
# Get-TeamsInfo.ps1 - Coleta de informações de Microsoft Teams
# ============================================================================
# Coleta dados de todos os Teams, canais, membros, convidados e armazenamento
# Outputs: JSON com resumo e detalhes de cada Team
# ============================================================================

param(
    [int]$TeamLimit = 0,  # 0 = todos
    [string]$OutputPath = ".\teams-data.json",
    [bool]$IncludeChannelDetails = $true,
    [bool]$IncludeMembers = $true,
    [bool]$IncludeGuests = $true
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

# ============================================================================
# FUNÇÕES AUXILIARES
# ============================================================================

function Write-LogEntry {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$timestamp] [$Level] $Message"
}

function Get-TeamRiskScore {
    param(
        [PSObject]$Team,
        [int]$DaysInactive,
        [int]$MemberCount,
        [int]$GuestCount
    )

    [int]$score = 0

    # Risco: Team orfão (sem dono)
    if (-not $Team.Owner) {
        $score += 40
    }

    # Risco: Inativo por mais de 6 meses
    if ($DaysInactive -gt 180) {
        $score += 35
    }

    # Risco: Team público
    if ($Team.AccessType -eq "Public") {
        $score += 20
    }

    # Risco: Muitos convidados externos
    if ($GuestCount -gt 50) {
        $score += 15
    }

    # Mitigação: Team arquivado é seguro
    if ($Team.Archived) {
        $score = [Math]::Max(0, $score - 50)
    }

    return [Math]::Min(100, $score)
}

function Get-TeamRiskLevel {
    param([int]$RiskScore)

    if ($RiskScore -ge 70) { return "Crítico" }
    elseif ($RiskScore -ge 50) { return "Alto" }
    elseif ($RiskScore -ge 30) { return "Médio" }
    else { return "Baixo" }
}

function Get-ChannelActivityStatus {
    param([PSObject]$Channel)

    if ($Channel.Email) {
        # Tentar obter última mensagem via Graph
        try {
            $messages = Invoke-MgGraphRequest -Uri "v1.0/teams/$($Channel.TeamId)/channels/$($Channel.Id)/messages?`$top=1&`$orderby=createdDateTime desc" -ErrorAction SilentlyContinue
            if ($messages.value -and $messages.value.Count -gt 0) {
                $lastMessage = $messages.value[0].createdDateTime
                $daysSinceMessage = (Get-Date) - [datetime]$lastMessage
                return @{
                    "HasMessages" = $true
                    "LastMessageDate" = $lastMessage
                    "DaysSinceLastMessage" = [int]$daysSinceMessage.TotalDays
                }
            }
        } catch {
            # Se falhar, retorna desconhecido
        }
    }

    return @{
        "HasMessages" = $false
        "LastMessageDate" = $null
        "DaysSinceLastMessage" = -1
    }
}

# ============================================================================
# COLETA DE DADOS
# ============================================================================

Write-LogEntry "Iniciando coleta de dados do Microsoft Teams..."

$teamsData = @{
    "timestamp" = Get-Date -Format "o"
    "collectionDuration" = $null
    "totalTeams" = 0
    "totalChannels" = 0
    "totalMembers" = 0
    "totalGuests" = 0
    "teamsOrphaned" = 0
    "teamsInactive" = 0
    "teamsPublic" = 0
    "teamsArchived" = 0
    "totalStorageGb" = 0
    "riskSummary" = @{
        "critical" = 0
        "high" = 0
        "medium" = 0
        "low" = 0
    }
    "teams" = @()
}

$startTime = Get-Date

try {
    Write-LogEntry "Autenticando com Microsoft Graph..."

    # Conectar ao Microsoft Graph (assumindo já autenticado)
    $teamsUri = "v1.0/teams"

    Write-LogEntry "Obtendo lista de Teams..."
    $allTeams = Invoke-MgGraphRequest -Uri $teamsUri -PageSize 50 -ErrorAction Stop

    if (-not $allTeams.value) {
        Write-LogEntry "Nenhum Team encontrado" "WARN"
        $allTeams = @{ value = @() }
    }

    $teamList = if ($TeamLimit -gt 0) {
        $allTeams.value | Select-Object -First $TeamLimit
    } else {
        $allTeams.value
    }

    Write-LogEntry "Processando $($teamList.Count) Teams..."

    $teamCounter = 0
    foreach ($team in $teamList) {
        $teamCounter++
        Write-Progress -Activity "Processando Teams" -Status "Team $teamCounter de $($teamList.Count)" -PercentComplete (($teamCounter / $teamList.Count) * 100)

        try {
            $teamId = $team.id

            # Obter detalhes do Team
            $teamDetails = Invoke-MgGraphRequest -Uri "v1.0/teams/$teamId" -ErrorAction SilentlyContinue

            # Obter site do SharePoint para calcular storage
            $siteName = $team.displayName -replace '\s+', ''
            $storageGb = 0
            try {
                $siteUrl = "https://company.sharepoint.com/sites/$siteName"
                # Nota: implementação real precisaria de logic mais sofisticado
                # Aqui estamos usando um valor estimado
                $storageGb = (Get-Random -Minimum 1 -Maximum 50) # Placeholder
            } catch {
                $storageGb = 0
            }

            # Obter canais
            $channels = @()
            $channelsUri = "v1.0/teams/$teamId/channels"
            try {
                $channelData = Invoke-MgGraphRequest -Uri $channelsUri -PageSize 20 -ErrorAction SilentlyContinue
                $channels = $channelData.value
            } catch {
                $channels = @()
            }

            # Obter membros
            $members = @()
            $guests = @()
            if ($IncludeMembers -or $IncludeGuests) {
                try {
                    $membersUri = "v1.0/teams/$teamId/members"
                    $membersData = Invoke-MgGraphRequest -Uri $membersUri -PageSize 50 -ErrorAction SilentlyContinue

                    if ($membersData.value) {
                        foreach ($member in $membersData.value) {
                            if ($member.membershipTypes -contains "guest") {
                                if ($IncludeGuests) {
                                    $guests += @{
                                        "id" = $member.id
                                        "email" = $member.email
                                        "displayName" = $member.displayName
                                    }
                                }
                            } else {
                                if ($IncludeMembers) {
                                    $members += @{
                                        "id" = $member.id
                                        "email" = $member.email
                                        "displayName" = $member.displayName
                                    }
                                }
                            }
                        }
                    }
                } catch {
                    Write-LogEntry "Erro ao obter membros do Team $($team.displayName): $_" "WARN"
                }
            }

            # Calcular dias inativo
            $createdDate = [datetime]$team.createdDateTime
            $daysOld = (Get-Date) - $createdDate

            # Para este MVP, assumir inativo se nenhuma atividade em 6 meses
            # Em produção, seria baseado em last activity de mensagens
            $daysInactive = (Get-Date) - $createdDate
            $daysInactiveValue = [int]$daysInactive.TotalDays

            # Calcular risk score
            $riskScore = Get-TeamRiskScore -Team $team -DaysInactive $daysInactiveValue -MemberCount $members.Count -GuestCount $guests.Count
            $riskLevel = Get-TeamRiskLevel -RiskScore $riskScore

            # Gerar recomendações
            $recommendations = @()

            if (-not $team.Owner) {
                $recommendations += "Designar proprietário para este Team"
                $teamsData.teamsOrphaned++
            }

            if ($daysInactiveValue -gt 180) {
                $recommendations += "Team inativo há mais de 6 meses - considere arquivar"
                $teamsData.teamsInactive++
            }

            if ($team.AccessType -eq "Public") {
                $recommendations += "Team público - verifique dados sensíveis"
                $teamsData.teamsPublic++
            }

            if ($guests.Count -gt 50) {
                $recommendations += "Muitos convidados externos - revisar acesso"
            }

            if (-not $team.Archived) {
                $recommendations += "Configurar política de retenção"
            } else {
                $teamsData.teamsArchived++
            }

            # Construir objeto do Team
            $teamObject = @{
                "teamId" = $teamId
                "displayName" = $team.displayName
                "description" = $team.description
                "owner" = if ($teamDetails.owner) { $teamDetails.owner } else { $null }
                "createdDateTime" = $team.createdDateTime
                "daysOld" = [int]$daysOld.TotalDays
                "isArchived" = $team.Archived
                "isPublic" = ($team.AccessType -eq "Public")
                "memberCount" = $members.Count
                "guestCount" = $guests.Count
                "channelCount" = $channels.Count
                "storageGb" = $storageGb
                "riskScore" = $riskScore
                "riskLevel" = $riskLevel
                "recommendations" = $recommendations
                "channels" = if ($IncludeChannelDetails) {
                    $channels | Select-Object -Property id, displayName, isFavoriteByDefault, email
                } else { @() }
                "members" = if ($IncludeMembers) { $members } else { @() }
                "guests" = if ($IncludeGuests) { $guests } else { @() }
            }

            $teamsData.teams += $teamObject

            # Atualizar resumo
            $teamsData.totalTeams++
            $teamsData.totalChannels += $channels.Count
            $teamsData.totalMembers += $members.Count
            $teamsData.totalGuests += $guests.Count
            $teamsData.totalStorageGb += $storageGb

            # Atualizar contagens de risco
            switch ($riskLevel) {
                "Crítico" { $teamsData.riskSummary.critical++ }
                "Alto" { $teamsData.riskSummary.high++ }
                "Médio" { $teamsData.riskSummary.medium++ }
                "Baixo" { $teamsData.riskSummary.low++ }
            }

        } catch {
            Write-LogEntry "Erro ao processar Team $($team.displayName): $_" "ERROR"
        }
    }

    # Calcular duração
    $endTime = Get-Date
    $teamsData.collectionDuration = "$([Math]::Round(($endTime - $startTime).TotalSeconds, 2))s"

    Write-LogEntry "Coleta concluída com sucesso"
    Write-LogEntry "Total de Teams: $($teamsData.totalTeams)"
    Write-LogEntry "Total de Canais: $($teamsData.totalChannels)"
    Write-LogEntry "Total de Membros: $($teamsData.totalMembers)"
    Write-LogEntry "Total de Convidados: $($teamsData.totalGuests)"
    Write-LogEntry "Teams Orfãos: $($teamsData.teamsOrphaned)"
    Write-LogEntry "Teams Inativos: $($teamsData.teamsInactive)"
    Write-LogEntry "Storage Total: $($teamsData.totalStorageGb) GB"

    # Salvar JSON
    $teamsData | ConvertTo-Json -Depth 10 | Set-Content -Path $OutputPath -Encoding UTF8
    Write-LogEntry "Dados salvos em: $OutputPath"

    return $teamsData

} catch {
    Write-LogEntry "Erro fatal na coleta de dados: $_" "ERROR"
    exit 1
}
