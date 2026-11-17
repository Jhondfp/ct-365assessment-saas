# ==============================================================================
# MODULO: STATUS DE DONOS DE SITE (Microsoft Graph)
# ------------------------------------------------------------------------------
# Roda depois de Get-SitesInfo (precisa de sites_info.administrators ja
# coletado). Levanta os e-mails de administrador UNICOS (nao 1 chamada por
# site, nem por arquivo) e verifica no Entra ID via Graph se a conta ainda
# existe e esta habilitada - usado pelo dashboard (sp_dash_orphaned_sites)
# para sinalizar sites sem dono ativo. Sequencial (nao paralelo): o volume
# tipico e de dezenas/centenas de administradores unicos, nao milhoes.
# ==============================================================================

function Get-OwnerStatus {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$false)] $Connection = $null
    )

    Write-Log -Level INFO -Module 'OwnerStatus' -Message 'Iniciando verificacao de donos ativos dos sites.' -DbConnection $Connection
    Report-Step -StepName 'Verificacao de Donos Ativos' -Status 'in progress' -Progress 0 -Info 'Levantando administradores unicos'

    if ($null -eq $Connection) {
        Write-Log -Level WARNING -Module 'OwnerStatus' -Message 'Sem conexao DB - etapa pulada (store_in_sql=false?).'
        Report-Step -StepName 'Verificacao de Donos Ativos' -Status 'completed' -Progress 100 -Info 'Pulado (sem DB)'
        return $false
    }

    $execId = $global:executionId

    try {
        $rows = @(Invoke-DbReader -Connection $Connection -Parameters @{ '@eid' = $execId } -Query @"
SELECT DISTINCT LTRIM(RTRIM(value)) AS owner_mail
FROM dbo.sites_info s
CROSS APPLY STRING_SPLIT(ISNULL(s.administrators,''), ';')
WHERE s.execution_id = @eid AND LTRIM(RTRIM(value)) <> ''
"@)
    } catch {
        Write-Log -Level WARNING -Module 'OwnerStatus' -Message 'Falha ao levantar administradores (proc/coluna ainda nao disponivel?).' -Exception $_.Exception.Message -DbConnection $Connection
        Report-Step -StepName 'Verificacao de Donos Ativos' -Status 'completed' -Progress 100 -Info 'Pulado (erro ao consultar)'
        return $false
    }

    $emails = @($rows | ForEach-Object { $_.owner_mail } | Where-Object { $_ })
    if ($emails.Count -eq 0) {
        Write-Log -Level WARNING -Module 'OwnerStatus' -Message 'Nenhum administrador coletado para verificar.' -DbConnection $Connection
        Report-Step -StepName 'Verificacao de Donos Ativos' -Status 'completed' -Progress 100 -Info 'Sem administradores'
        return $true
    }

    Write-Log -Level INFO -Module 'OwnerStatus' -Message "$($emails.Count) administradores unicos a verificar no Graph." -DbConnection $Connection

    # Em sites conectados a grupo M365/Teams o "administrador" que o PnP
    # devolve e o e-mail do GRUPO, nao de uma pessoa - /users/{mail} da 404
    # e o site virava falso orfao (foi o caso de ~300 dos 481 administradores
    # no tenant CT). Carrega os grupos com e-mail 1 vez (mail + proxyAddresses
    # -> id) e, para esses, o dono "ativo" passa a ser: o grupo tem pelo menos
    # 1 owner (usuario) habilitado. Requer Directory.Read.All (ja exigida).
    $groupByMail = New-Object 'System.Collections.Generic.Dictionary[string,string]' ([System.StringComparer]::OrdinalIgnoreCase)
    try {
        $groups = Invoke-GraphRequest -All -Uri "https://graph.microsoft.com/v1.0/groups?`$filter=mailEnabled eq true&`$select=id,mail,proxyAddresses&`$top=999"
        foreach ($g in @($groups.value)) {
            if ($g.mail) { $groupByMail[$g.mail] = $g.id }
            foreach ($pa in @($g.proxyAddresses)) {
                if ($pa -match '^smtp:(.+)$') { $groupByMail[$Matches[1]] = $g.id }
            }
        }
        Write-Log -Level INFO -Module 'OwnerStatus' -Message "$($groupByMail.Count) enderecos de grupo carregados para resolver donos de sites de grupo." -DbConnection $Connection
    } catch {
        Write-Log -Level WARNING -Module 'OwnerStatus' -Message 'Falha ao carregar grupos - sites de grupo podem aparecer como orfaos.' -Exception $_.Exception.Message -DbConnection $Connection
    }

    $results = New-Object System.Collections.Generic.List[object]
    $done = 0
    foreach ($email in $emails) {
        $exists  = $false
        $enabled = $null
        try {
            if ($groupByMail.ContainsKey($email)) {
                $owners = Invoke-GraphRequest -All -Uri "https://graph.microsoft.com/v1.0/groups/$($groupByMail[$email])/owners?`$select=id,accountEnabled"
                $userOwners = @($owners.value | Where-Object { $_.'@odata.type' -eq '#microsoft.graph.user' })
                $exists  = $true
                $enabled = [bool](@($userOwners | Where-Object { $_.accountEnabled -eq $true }).Count -gt 0)
            } else {
                $u = $null
                try {
                    $u = Invoke-GraphRequest -Uri "https://graph.microsoft.com/v1.0/users/$([uri]::EscapeDataString($email))?`$select=accountEnabled"
                } catch {
                    # _Invoke-GraphCall reempacota o erro (pra anexar o corpo da
                    # resposta) - o Response original fica na InnerException.
                    $statusCode = 0
                    try { $statusCode = [int]$_.Exception.Response.StatusCode } catch { }
                    if ($statusCode -eq 0) { try { $statusCode = [int]$_.Exception.InnerException.Response.StatusCode } catch { } }
                    if ($statusCode -ne 404) { throw }
                    # 404 por UPN: o e-mail pode nao ser o UPN (mail <> UPN,
                    # convidado com UPN #EXT#) - tenta pelo atributo mail
                    # antes de concluir que a conta nao existe.
                    $filter = [uri]::EscapeDataString("mail eq '$($email.Replace("'", "''"))'")
                    $found  = Invoke-GraphRequest -Uri "https://graph.microsoft.com/v1.0/users?`$filter=$filter&`$select=accountEnabled"
                    $u = @($found.value) | Select-Object -First 1
                }
                # Sem resultado = conta nao existe mais no Entra ID -> exists=false, possivel orfao
                if ($u) { $exists = $true; $enabled = [bool]$u.accountEnabled }
            }
        } catch {
            Write-Log -Level WARNING -Module 'OwnerStatus' -Message "Falha ao verificar $email no Graph." -Exception $_.Exception.Message -DbConnection $Connection
        }
        $results.Add([PSCustomObject]@{
            ExecutionId    = $execId
            OwnerMail      = $email
            AccountExists  = [bool]$exists
            AccountEnabled = $enabled
        })

        $done++
        if ($done % 25 -eq 0 -or $done -eq $emails.Count) {
            $pct = [Math]::Min(99, [Math]::Round(($done / $emails.Count) * 100))
            Report-Step -StepName 'Verificacao de Donos Ativos' -Status 'in progress' -Progress $pct -Info "$done de $($emails.Count) administradores verificados"
        }
    }

    try {
        Save-SiteOwnerStatus -Batch $results.ToArray() -Connection $Connection | Out-Null
    } catch {
        Write-Log -Level WARNING -Module 'OwnerStatus' -Message 'Falha ao salvar site_owner_status (tabela ainda nao existe? rode docs/migration_003_governance.sql).' -Exception $_.Exception.Message -DbConnection $Connection
        Report-Step -StepName 'Verificacao de Donos Ativos' -Status 'completed' -Progress 100 -Info 'Falha ao salvar - ver log'
        return $false
    }

    Write-Log -Level SUCCESS -Module 'OwnerStatus' -Message 'Verificacao de donos ativos finalizada.' -DbConnection $Connection
    Report-Step -StepName 'Verificacao de Donos Ativos' -Status 'completed' -Progress 100 -Info 'OK'
    return $true
}
