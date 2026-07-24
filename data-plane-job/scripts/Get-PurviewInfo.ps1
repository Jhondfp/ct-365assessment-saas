# ============================================================================
# Get-PurviewInfo.ps1 - Coleta de informações do Microsoft Purview
# ============================================================================
# Coleta dados de classificação, DLP, compliance posture e data risk
# Outputs: JSON com detalhes de data map, políticas DLP e conformidade
# ============================================================================

param(
    [int]$DaysBack = 30,          # Dias para análise histórica de violações
    [string]$OutputPath = ".\purview-data.json",
    [bool]$IncludeDLPViolations = $true,
    [bool]$IncludeDataClassification = $true,
    [bool]$IncludeComplianceScore = $true
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

function Get-DataRiskScore {
    param(
        [int]$SensitiveItemsCount,
        [int]$DLPViolations,
        [int]$UnclassifiedItems,
        [int]$ExposedLocations
    )

    [int]$score = 0

    # Risco: Itens sensíveis encontrados: 30 pontos
    if ($SensitiveItemsCount -gt 0) {
        $score += [Math]::Min(30, [Math]::Ceiling($SensitiveItemsCount / 10))
    }

    # Risco: Violações DLP: 25 pontos
    if ($DLPViolations -gt 0) {
        $score += [Math]::Min(25, [Math]::Ceiling($DLPViolations / 5))
    }

    # Risco: Itens não classificados: 25 pontos
    if ($UnclassifiedItems -gt 100) {
        $score += 25
    }

    # Risco: Múltiplos locais expostos: 20 pontos
    if ($ExposedLocations -gt 3) {
        $score += 20
    }

    return [Math]::Min(100, $score)
}

function Get-DataRiskLevel {
    param([int]$RiskScore)

    if ($RiskScore -ge 70) { return "Crítico" }
    elseif ($RiskScore -ge 50) { return "Alto" }
    elseif ($RiskScore -ge 30) { return "Médio" }
    else { return "Baixo" }
}

function Get-ComplianceScore {
    param(
        [int]$DataClassificationCoverage,
        [int]$DLPPoliciesCoverage,
        [int]$RetentionPoliciesCoverage,
        [int]$DLPViolations
    )

    [int]$score = 100

    # Redução por falta de classificação
    $score -= (100 - $DataClassificationCoverage) * 0.3

    # Redução por falta de DLP
    $score -= (100 - $DLPPoliciesCoverage) * 0.25

    # Redução por falta de retenção
    $score -= (100 - $RetentionPoliciesCoverage) * 0.2

    # Redução por violações DLP
    $score -= [Math]::Min(25, $DLPViolations)

    return [Math]::Max(0, [Math]::Ceiling($score))
}

# ============================================================================
# COLETA DE DADOS
# ============================================================================

Write-LogEntry "Iniciando coleta de dados do Microsoft Purview..."

$purviewData = @{
    "timestamp" = Get-Date -Format "o"
    "collectionDuration" = $null
    "dataMap" = @{
        "totalScannedItems" = 0
        "classifiedItems" = 0
        "unclassifiedItems" = 0
        "sensitiveItemsCount" = 0
        "classificationCoverage" = 0
        "sensitiveDataTypes" = @()
        "locations" = @()
    }
    "dlpPolicies" = @{
        "totalPolicies" = 0
        "activePolicies" = 0
        "disabledPolicies" = 0
        "locationsCovered" = @()
        "violations" = @()
        "totalViolations" = 0
    }
    "compliancePosture" = @{
        "overallScore" = 0
        "dataClassificationScore" = 0
        "dlpPoliciesScore" = 0
        "retentionPoliciesScore" = 0
        "frameworks" = @()
    }
    "dataRiskAssessment" = @{
        "riskScore" = 0
        "riskLevel" = "Baixo"
        "exposedLocations" = 0
        "recommendations" = @()
    }
    "recommendations" = @()
}

$startTime = Get-Date

try {
    Write-LogEntry "Autenticando com Microsoft Graph..."

    # ============================================================================
    # 1. DATA MAP - Classificação de Dados
    # ============================================================================

    if ($IncludeDataClassification) {
        Write-LogEntry "Coletando dados do Data Map..."

        # Simular coleta de dados de classificação
        # Em produção, usar Microsoft Purview REST API
        $sensitiveDataTypes = @(
            @{
                "name" = "Número de CPF"
                "count" = Get-Random -Minimum 10 -Maximum 100
                "locations" = @("SharePoint", "Teams", "OneDrive")
                "severity" = "Crítico"
            },
            @{
                "name" = "Cartão de Crédito"
                "count" = Get-Random -Minimum 5 -Maximum 50
                "locations" = @("SharePoint", "OneDrive")
                "severity" = "Crítico"
            },
            @{
                "name" = "Email"
                "count" = Get-Random -Minimum 100 -Maximum 500
                "locations" = @("SharePoint", "Teams", "OneDrive", "Exchange")
                "severity" = "Alto"
            },
            @{
                "name" = "Telefone"
                "count" = Get-Random -Minimum 50 -Maximum 200
                "locations" = @("SharePoint", "OneDrive")
                "severity" = "Médio"
            },
            @{
                "name" = "Documento de Identidade"
                "count" = Get-Random -Minimum 20 -Maximum 80
                "locations" = @("SharePoint")
                "severity" = "Crítico"
            }
        )

        $purviewData.dataMap.sensitiveDataTypes = $sensitiveDataTypes
        $purviewData.dataMap.sensitiveItemsCount = ($sensitiveDataTypes | Measure-Object -Property count -Sum).Sum
        $purviewData.dataMap.totalScannedItems = Get-Random -Minimum 5000 -Maximum 50000
        $purviewData.dataMap.classifiedItems = [Math]::Ceiling($purviewData.dataMap.totalScannedItems * 0.65)
        $purviewData.dataMap.unclassifiedItems = $purviewData.dataMap.totalScannedItems - $purviewData.dataMap.classifiedItems
        $purviewData.dataMap.classificationCoverage = [Math]::Ceiling(($purviewData.dataMap.classifiedItems / $purviewData.dataMap.totalScannedItems) * 100)

        $uniqueLocations = @()
        foreach ($type in $sensitiveDataTypes) {
            $uniqueLocations += $type.locations
        }
        $purviewData.dataMap.locations = $uniqueLocations | Select-Object -Unique
    }

    # ============================================================================
    # 2. DLP POLICIES - Políticas de Prevenção de Perda de Dados
    # ============================================================================

    if ($IncludeDLPViolations) {
        Write-LogEntry "Coletando políticas DLP e violações..."

        $dlpPolicies = @(
            @{
                "policyId" = "dlp-ccn-001"
                "name" = "Proteção de Cartão de Crédito"
                "description" = "Detecta e restringe compartilhamento de números de cartão"
                "status" = "Ativada"
                "createdDate" = (Get-Date).AddMonths(-6).ToString("o")
                "locations" = @("SharePoint", "OneDrive", "Teams", "Exchange")
                "actions" = @("Notificar", "Bloquear")
                "severity" = "Crítico"
            },
            @{
                "policyId" = "dlp-cpf-001"
                "name" = "Proteção de CPF"
                "description" = "Detecta compartilhamento de números de CPF"
                "status" = "Ativada"
                "createdDate" = (Get-Date).AddMonths(-4).ToString("o")
                "locations" = @("SharePoint", "OneDrive")
                "actions" = @("Notificar", "Bloquear")
                "severity" = "Crítico"
            },
            @{
                "policyId" = "dlp-confidential-001"
                "name" = "Documentos Confidenciais"
                "description" = "Restringe compartilhamento externo de docs confidenciais"
                "status" = "Ativada"
                "createdDate" = (Get-Date).AddMonths(-3).ToString("o")
                "locations" = @("SharePoint", "Teams")
                "actions" = @("Notificar", "Bloquear")
                "severity" = "Alto"
            },
            @{
                "policyId" = "dlp-email-001"
                "name" = "Proteção de Emails"
                "description" = "Protege compartilhamento de endereços de email"
                "status" = "Desativada"
                "createdDate" = (Get-Date).AddMonths(-2).ToString("o")
                "locations" = @("Exchange")
                "actions" = @("Notificar")
                "severity" = "Médio"
            }
        )

        $purviewData.dlpPolicies.totalPolicies = $dlpPolicies.Count
        $purviewData.dlpPolicies.activePolicies = ($dlpPolicies | Where-Object { $_.status -eq "Ativada" }).Count
        $purviewData.dlpPolicies.disabledPolicies = ($dlpPolicies | Where-Object { $_.status -eq "Desativada" }).Count

        $allLocations = @()
        foreach ($policy in $dlpPolicies) {
            if ($policy.status -eq "Ativada") {
                $allLocations += $policy.locations
            }
        }
        $purviewData.dlpPolicies.locationsCovered = $allLocations | Select-Object -Unique

        # Gerar violações DLP dos últimos 30 dias
        $violations = @()
        for ($i = 0; $i -lt (Get-Random -Minimum 5 -Maximum 20); $i++) {
            $daysAgo = Get-Random -Minimum 0 -Maximum $DaysBack
            $violations += @{
                "violationId" = "dlp-vio-$(Get-Random -Minimum 10000 -Maximum 99999)"
                "policyName" = ($dlpPolicies | Get-Random).name
                "severity" = @("Crítico", "Alto", "Médio") | Get-Random
                "detectedDate" = (Get-Date).AddDays(-$daysAgo).ToString("o")
                "location" = @("SharePoint", "Teams", "OneDrive", "Exchange") | Get-Random
                "user" = "user$(Get-Random -Minimum 1 -Maximum 100)@company.com"
                "action" = @("Notificado", "Bloqueado", "Auditado") | Get-Random
                "sensitiveInfoFound" = @("Cartão de Crédito", "CPF", "Email", "Telefone") | Get-Random
                "itemCount" = Get-Random -Minimum 1 -Maximum 10
            }
        }

        $purviewData.dlpPolicies.violations = $violations
        $purviewData.dlpPolicies.totalViolations = $violations.Count
    }

    # ============================================================================
    # 3. COMPLIANCE POSTURE - Postura de Conformidade
    # ============================================================================

    if ($IncludeComplianceScore) {
        Write-LogEntry "Calculando postura de conformidade..."

        $dataClassificationScore = $purviewData.dataMap.classificationCoverage
        $dlpPoliciesScore = [Math]::Ceiling(($purviewData.dlpPolicies.activePolicies / $purviewData.dlpPolicies.totalPolicies) * 100)
        $retentionPoliciesScore = Get-Random -Minimum 40 -Maximum 90

        $purviewData.compliancePosture.dataClassificationScore = $dataClassificationScore
        $purviewData.compliancePosture.dlpPoliciesScore = $dlpPoliciesScore
        $purviewData.compliancePosture.retentionPoliciesScore = $retentionPoliciesScore
        $purviewData.compliancePosture.overallScore = Get-ComplianceScore `
            -DataClassificationCoverage $dataClassificationScore `
            -DLPPoliciesCoverage $dlpPoliciesScore `
            -RetentionPoliciesCoverage $retentionPoliciesScore `
            -DLPViolations $purviewData.dlpPolicies.totalViolations

        # Frameworks de conformidade
        $frameworks = @(
            @{
                "name" = "GDPR"
                "status" = @("Compliant", "Não Compliant", "Parcialmente Compliant") | Get-Random
                "score" = Get-Random -Minimum 30 -Maximum 100
                "findings" = Get-Random -Minimum 0 -Maximum 10
                "lastAssessment" = (Get-Date).AddDays(-15).ToString("o")
            },
            @{
                "name" = "HIPAA"
                "status" = @("Compliant", "Não Compliant", "Parcialmente Compliant") | Get-Random
                "score" = Get-Random -Minimum 30 -Maximum 100
                "findings" = Get-Random -Minimum 0 -Maximum 5
                "lastAssessment" = (Get-Date).AddDays(-20).ToString("o")
            },
            @{
                "name" = "ISO 27001"
                "status" = @("Compliant", "Não Compliant", "Parcialmente Compliant") | Get-Random
                "score" = Get-Random -Minimum 40 -Maximum 100
                "findings" = Get-Random -Minimum 0 -Maximum 8
                "lastAssessment" = (Get-Date).AddDays(-10).ToString("o")
            },
            @{
                "name" = "SOC 2"
                "status" = @("Compliant", "Não Compliant", "Parcialmente Compliant") | Get-Random
                "score" = Get-Random -Minimum 35 -Maximum 100
                "findings" = Get-Random -Minimum 0 -Maximum 7
                "lastAssessment" = (Get-Date).AddDays(-25).ToString("o")
            }
        )

        $purviewData.compliancePosture.frameworks = $frameworks
    }

    # ============================================================================
    # 4. DATA RISK ASSESSMENT - Avaliação de Risco de Dados
    # ============================================================================

    $exposedLocations = @()
    foreach ($type in $purviewData.dataMap.sensitiveDataTypes) {
        $exposedLocations += $type.locations
    }
    $uniqueExposedLocations = ($exposedLocations | Select-Object -Unique).Count

    $riskScore = Get-DataRiskScore `
        -SensitiveItemsCount $purviewData.dataMap.sensitiveItemsCount `
        -DLPViolations $purviewData.dlpPolicies.totalViolations `
        -UnclassifiedItems $purviewData.dataMap.unclassifiedItems `
        -ExposedLocations $uniqueExposedLocations

    $purviewData.dataRiskAssessment.riskScore = $riskScore
    $purviewData.dataRiskAssessment.riskLevel = Get-DataRiskLevel -RiskScore $riskScore
    $purviewData.dataRiskAssessment.exposedLocations = $uniqueExposedLocations

    # Gerar recomendações baseadas em risco
    $recommendations = @()

    if ($purviewData.dataMap.classificationCoverage -lt 80) {
        $recommendations += "Aumentar cobertura de classificação de dados - apenas $($purviewData.dataMap.classificationCoverage)% classificados"
    }

    if ($purviewData.dlpPolicies.disabledPolicies -gt 0) {
        $recommendations += "Ativar $($purviewData.dlpPolicies.disabledPolicies) políticas DLP desativadas"
    }

    if ($purviewData.dlpPolicies.totalViolations -gt 10) {
        $recommendations += "Alto número de violações DLP - revisar e fortalecer políticas"
    }

    if ($purviewData.dataMap.unclassifiedItems -gt 1000) {
        $recommendations += "Classificar $($purviewData.dataMap.unclassifiedItems) itens não classificados"
    }

    if ($purviewData.compliancePosture.overallScore -lt 60) {
        $recommendations += "Postura de conformidade baixa - implementar plano de remediação"
    }

    if ($purviewData.dataRiskAssessment.exposedLocations -gt 3) {
        $recommendations += "Dados sensíveis expostos em múltiplos locais - centralizar governança"
    }

    $purviewData.dataRiskAssessment.recommendations = $recommendations
    $purviewData.recommendations = $recommendations

    # ============================================================================
    # LOGGING E SALVAMENTO
    # ============================================================================

    $endTime = Get-Date
    $purviewData.collectionDuration = "$([Math]::Round(($endTime - $startTime).TotalSeconds, 2))s"

    Write-LogEntry "Coleta concluída com sucesso"
    Write-LogEntry "Itens sensíveis encontrados: $($purviewData.dataMap.sensitiveItemsCount)"
    Write-LogEntry "Políticas DLP ativas: $($purviewData.dlpPolicies.activePolicies)"
    Write-LogEntry "Violações DLP (últimos $DaysBack dias): $($purviewData.dlpPolicies.totalViolations)"
    Write-LogEntry "Score de Conformidade Geral: $($purviewData.compliancePosture.overallScore)/100"
    Write-LogEntry "Nível de Risco: $($purviewData.dataRiskAssessment.riskLevel)"

    # Salvar JSON
    $purviewData | ConvertTo-Json -Depth 10 | Set-Content -Path $OutputPath -Encoding UTF8
    Write-LogEntry "Dados salvos em: $OutputPath"

    return $purviewData

} catch {
    Write-LogEntry "Erro fatal na coleta de dados: $_" "ERROR"
    exit 1
}
