#Requires -Version 7.0

<#
.SYNOPSIS
    Coleta informações de licenças Microsoft 365 — Multi-Tenant

.DESCRIPTION
    Script que coleta dados de licenças, utilização, serviços habilitados
    e gera análise de custos e oportunidades de otimização.

.PARAMETER TenantId
    ID do tenant Microsoft 365 (GUID)

.PARAMETER AccessToken
    Token de acesso para Microsoft Graph API

.PARAMETER Verbose
    Exibir mensagens de debug

#>

param(
    [Parameter(Mandatory=$true)]
    [string]$TenantId,

    [Parameter(Mandatory=$true)]
    [string]$AccessToken,

    [bool]$IncludeActivityData = $true
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ======================================
# SETUP
# ======================================
$GraphBaseUrl = "https://graph.microsoft.com/v1.0"
$skus = @{}
$licenseDataByUser = @{}
$serviceActivity = @{}
$findings = @()

function Invoke-GraphRequest {
    param(
        [string]$Uri,
        [string]$Method = "GET"
    )

    try {
        $response = Invoke-RestMethod -Uri $Uri -Method $Method -Headers @{
            "Authorization" = "Bearer $AccessToken"
            "Content-Type" = "application/json"
        } -ErrorAction Stop

        return $response
    } catch {
        Write-Warning "Graph API Error: $($_.Exception.Message)"
        return $null
    }
}

function Get-AllPages {
    param(
        [string]$Uri
    )

    $results = @()
    $currentUri = $Uri

    do {
        $response = Invoke-GraphRequest -Uri $currentUri

        if ($response.value) {
            $results += $response.value
        }

        $currentUri = $response.'@odata.nextLink'
    } while ($currentUri)

    return $results
}

# ======================================
# 1. COLETAR PLANOS DE LICENÇA
# ======================================
Write-Host "Coletando planos de licença..."

try {
    $licensesUri = "$GraphBaseUrl/subscribedSkus"
    $licenses = Get-AllPages -Uri $licensesUri

    foreach ($license in $licenses) {
        $skus[$license.skuId] = @{
            skuId = $license.skuId
            skuPartNumber = $license.skuPartNumber
            displayName = $license.displayName
            servicePlans = $license.servicePlans
            totalLicenses = $license.prepaidUnits.enabled
            consumedLicenses = $license.prepaidUnits.enabled - $license.prepaidUnits.suspended
            suspendedLicenses = $license.prepaidUnits.suspended
        }
    }

    Write-Host "✓ $($skus.Count) tipos de licença encontrados"
} catch {
    Write-Warning "Erro ao coletar planos de licença: $_"
}

# ======================================
# 2. COLETAR USUÁRIOS E SUAS LICENÇAS
# ======================================
Write-Host "Coletando licenças por usuário..."

try {
    $usersUri = "$GraphBaseUrl/users?`$select=id,userPrincipalName,displayName,mail,accountEnabled&`$top=999"
    $users = Get-AllPages -Uri $usersUri

    $userCount = 0
    $usersWithLicenses = 0

    foreach ($user in $users) {
        $userCount++

        try {
            $assignedLicensesUri = "$GraphBaseUrl/users/$($user.id)/licenseDetails"
            $userLicenses = Get-AllPages -Uri $assignedLicensesUri

            if ($userLicenses.Count -gt 0) {
                $usersWithLicenses++
                $licenseDataByUser[$user.id] = @{
                    userPrincipalName = $user.userPrincipalName
                    displayName = $user.displayName
                    mail = $user.mail
                    accountEnabled = $user.accountEnabled
                    licenses = @()
                    totalLicenses = $userLicenses.Count
                }

                foreach ($license in $userLicenses) {
                    $licenseDataByUser[$user.id].licenses += @{
                        skuId = $license.skuId
                        skuPartNumber = $license.skuPartNumber
                        displayName = $license.displayName
                        servicePlans = $license.servicePlans
                    }
                }
            }
        } catch {
            Write-Warning "Erro ao obter licenças do usuário $($user.userPrincipalName): $_"
        }
    }

    Write-Host "✓ $usersWithLicenses de $userCount usuários têm licenças"
} catch {
    Write-Warning "Erro ao coletar usuários: $_"
}

# ======================================
# 3. ANALISAR UTILIZAÇÃO (Se disponível)
# ======================================
Write-Host "Analisando utilização de licenças..."

if ($IncludeActivityData) {
    try {
        # Coletar activity data dos últimos 30/90 dias
        $reportsUri = "$GraphBaseUrl/reports/getM365AppUserDetail(period='D30')/content"
        $activityReport = Invoke-RestMethod -Uri $reportsUri -Method GET -Headers @{
            "Authorization" = "Bearer $AccessToken"
        } -ErrorAction SilentlyContinue

        if ($activityReport) {
            $activityLines = $activityReport -split "`n"
            $headers = $activityLines[0] -split ','

            for ($i = 1; $i -lt $activityLines.Count; $i++) {
                if ($activityLines[$i].Trim() -eq "") { continue }

                $values = $activityLines[$i] -split ','
                if ($values.Count -ge 2) {
                    $userEmail = $values[1]
                    $serviceActivity[$userEmail] = @{
                        teams = [int]($values | Select-String -Pattern '(Teams|1)' -Raw | Select-Object -First 1)
                        sharepoint = [int]($values | Select-String -Pattern '(SharePoint|1)' -Raw | Select-Object -First 1)
                        exchange = [int]($values | Select-String -Pattern '(Exchange|1)' -Raw | Select-Object -First 1)
                        onedrive = [int]($values | Select-String -Pattern '(OneDrive|1)' -Raw | Select-Object -First 1)
                    }
                }
            }
        }

        Write-Host "✓ Dados de atividade coletados"
    } catch {
        Write-Host "⚠ Dados de atividade não disponíveis: $_"
    }
}

# ======================================
# 4. ANÁLISE DE CUSTOS
# ======================================
Write-Host "Calculando análise de custos..."

$costAnalysis = @{
    totalUsers = $licenseDataByUser.Count
    totalLicenses = 0
    totalSkuTypes = $skus.Count
    licensesByType = @{}
    usersByLicenseType = @{}
    unusedLicenses = 0
    underutilizedLicenses = 0
    recommendations = @()
}

foreach ($userId in $licenseDataByUser.Keys) {
    $user = $licenseDataByUser[$userId]

    foreach ($license in $user.licenses) {
        $costAnalysis.totalLicenses++

        if (-not $costAnalysis.licensesByType.ContainsKey($license.skuPartNumber)) {
            $costAnalysis.licensesByType[$license.skuPartNumber] = 0
            $costAnalysis.usersByLicenseType[$license.skuPartNumber] = @()
        }

        $costAnalysis.licensesByType[$license.skuPartNumber]++
        $costAnalysis.usersByLicenseType[$license.skuPartNumber] += $user.userPrincipalName
    }
}

# ======================================
# 5. DETECTAR OPORTUNIDADES
# ======================================
Write-Host "Detectando oportunidades de otimização..."

foreach ($userId in $licenseDataByUser.Keys) {
    $user = $licenseDataByUser[$userId]

    # Verificar inatividade de conta
    if (-not $user.accountEnabled) {
        $costAnalysis.recommendations += @{
            type = "disabled_account"
            severity = "high"
            user = $user.userPrincipalName
            description = "Conta de usuário desabilitada mas ainda com licenças ativas"
            licenses = $user.licenses.Count
            potentialSavings = "Revisar e remover licenças"
        }
        $costAnalysis.unusedLicenses += $user.licenses.Count
    }

    # Verificar atividade
    if ($serviceActivity.ContainsKey($user.mail)) {
        $activity = $serviceActivity[$user.mail]
        $activeServices = @($activity.Keys | Where-Object { $activity[$_] -eq 1 }).Count

        if ($activeServices -eq 0) {
            $costAnalysis.recommendations += @{
                type = "no_activity"
                severity = "high"
                user = $user.userPrincipalName
                description = "Nenhuma atividade nos últimos 30 dias"
                licenses = $user.licenses.Count
                potentialSavings = "Considerar remover licenças não utilizadas"
            }
        } elseif ($activeServices -lt ($user.licenses.Count / 2)) {
            $costAnalysis.underutilizedLicenses++
            $costAnalysis.recommendations += @{
                type = "underutilized"
                severity = "medium"
                user = $user.userPrincipalName
                description = "Usuário utiliza apenas $activeServices de $($user.licenses.Count) serviços disponíveis"
                licenses = $user.licenses.Count
                potentialSavings = "Oportunidade de downgrade"
            }
        }
    }
}

# ======================================
# 6. GERAR RELATÓRIO
# ======================================
Write-Host "Gerando relatório..."

$report = @{
    executionDate = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    summary = @{
        totalUsers = $costAnalysis.totalUsers
        totalLicenses = $costAnalysis.totalLicenses
        totalSkuTypes = $costAnalysis.totalSkuTypes
        licensesPerUser = if ($costAnalysis.totalUsers -gt 0) { $costAnalysis.totalLicenses / $costAnalysis.totalUsers } else { 0 }
        unusedLicenses = $costAnalysis.unusedLicenses
        underutilizedLicenses = $costAnalysis.underutilizedLicenses
        utilizationRate = if ($costAnalysis.totalUsers -gt 0) { (($costAnalysis.totalUsers - $costAnalysis.unusedLicenses) / $costAnalysis.totalUsers * 100) } else { 0 }
    }
    licensesByType = $costAnalysis.licensesByType
    usersByLicenseType = $costAnalysis.usersByLicenseType
    recommendations = $costAnalysis.recommendations | Sort-Object -Property @{Expression={
        switch ($_.severity) {
            'high' { 1 }
            'medium' { 2 }
            'low' { 3 }
            default { 4 }
        }
    }} | Select-Object -First 20
    detailedLicenseData = @()
}

# Adicionar dados detalhados
foreach ($userId in $licenseDataByUser.Keys) {
    $user = $licenseDataByUser[$userId]
    $report.detailedLicenseData += @{
        userPrincipalName = $user.userPrincipalName
        displayName = $user.displayName
        mail = $user.mail
        licenses = @($user.licenses | Select-Object @{N='sku';E={$_.skuPartNumber}},displayName)
        totalLicenses = $user.totalLicenses
        accountEnabled = $user.accountEnabled
    }
}

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════"
Write-Host "RESUMO DE LICENÇAS"
Write-Host "════════════════════════════════════════════════════════════"
Write-Host "Usuários: $($report.summary.totalUsers)"
Write-Host "Total de Licenças: $($report.summary.totalLicenses)"
Write-Host "Tipos de SKU: $($report.summary.totalSkuTypes)"
Write-Host "Taxa de Utilização: $([Math]::Round($report.summary.utilizationRate, 1))%"
Write-Host "Licenças Não Utilizadas: $($report.summary.unusedLicenses)"
Write-Host "Licenças Subutilizadas: $($report.summary.underutilizedLicenses)"
Write-Host "════════════════════════════════════════════════════════════"
Write-Host ""

# Retornar resultado como JSON
Write-Output ($report | ConvertTo-Json -Depth 10)
exit 0
