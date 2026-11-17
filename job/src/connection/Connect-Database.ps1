# ==============================================================================
# MÓDULO GENÉRICO DE CONEXÃO E PERSISTÊNCIA - SUPORTA SQL SERVER E MYSQL
# ------------------------------------------------------------------------------
# Funcoes genericas reutilizaveis por TODOS os modulos:
#   - New-DbConnection         : abre conexao (escolhe SQL/MySQL com base em auth)
#   - Close-DbConnection       : encerra e libera a conexao
#   - Invoke-DbNonQuery        : executa INSERT/UPDATE/DELETE parametrizado
#   - Invoke-DbScalar          : executa consulta que retorna valor escalar
#   - Invoke-DbReader          : executa SELECT e retorna lista de registros
#   - Invoke-DbBulkInsert      : insere em lote usando SqlBulkCopy (alta perf)
#   - Save-DbBatch             : insere lote generico via VALUES expandido
#   - Test-DbConnection        : testa se a conexao esta viva e a recupera
# ==============================================================================

# Forca uso do System.Data.SqlClient via reflection - mais estavel cross-platform
Add-Type -AssemblyName 'System.Data' -ErrorAction SilentlyContinue

# ------------------------------------------------------------------------------
# FUNCAO INTERNA: monta a connection string conforme o provedor
# ------------------------------------------------------------------------------
function Get-DbConnectionString {
    param(
        [Parameter(Mandatory)] [ValidateSet('sql','mysql')] [string] $Provider,
        [Parameter(Mandatory)] [string] $Server,
        [Parameter(Mandatory)] [string] $Database,
        [string] $Username,
        [string] $Password,
        [int]    $TimeoutSeconds = 60
    )

    switch ($Provider) {
        'sql' {
            # Connection pooling habilitado por default; MARS para o codigo legado
            $sb = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
            $sb['Server']                     = "tcp:$Server,1433"
            $sb['Initial Catalog']            = $Database
            $sb['User ID']                    = $Username
            $sb['Password']                   = $Password
            $sb['Persist Security Info']      = $false
            $sb['MultipleActiveResultSets']   = $true
            $sb['Encrypt']                    = $true
            $sb['TrustServerCertificate']     = $true
            $sb['Connection Timeout']         = $TimeoutSeconds
            $sb['Pooling']                    = $true
            $sb['Max Pool Size']              = 200
            $sb['Min Pool Size']              = 1
            return $sb.ConnectionString
        }
        'mysql' {
            return "server=$Server;port=3306;database=$Database;uid=$Username;pwd=$Password;Pooling=true;ConnectionTimeout=$TimeoutSeconds;"
        }
    }
}

# ------------------------------------------------------------------------------
# Abre uma nova conexao com o banco configurado em auth.json
# Cada thread/runspace DEVE chamar isto para obter sua propria conexao,
# pois SqlConnection NAO eh thread-safe.
# ------------------------------------------------------------------------------
function New-DbConnection {
    param(
        [Parameter(Mandatory=$false)] [hashtable] $AuthOverride = $null,
        [Parameter(Mandatory=$false)] [int]       $MaxRetries   = 8
    )

    $authData = if ($null -ne $AuthOverride) { $AuthOverride } else { $global:auth }
    if ($null -eq $authData) {
        throw "Configuracao de autenticacao (global:auth) nao foi carregada."
    }

    $provider = if ($authData.connection) { $authData.connection.ToLower() } else { 'sql' }
    $cs = Get-DbConnectionString `
            -Provider $provider `
            -Server   $authData.server `
            -Database $authData.database `
            -Username $authData.database_username `
            -Password $authData.database_password

    # Erros que indicam Azure SQL em auto-pause ou transiente — requerem wait longo
    $azureTransientCodes = @(40613, 40501, 40197, 49918, 49919, 49920, 4060, 4221)
    $azureTransientMsgs  = @('not currently available','actively refused','auto-pause',
                              'server is not found','temporarily unavailable','please retry')

    $lastError = $null
    for ($attempt = 1; $attempt -le $MaxRetries; $attempt++) {
        try {
            $conn = $null
            if ($provider -eq 'sql') {
                $conn = New-Object System.Data.SqlClient.SqlConnection($cs)
            } else {
                $mysqlDll = Join-Path $PSScriptRoot 'MySql.Data.dll'
                if (Test-Path $mysqlDll) { Add-Type -Path $mysqlDll }
                $conn = New-Object MySql.Data.MySqlClient.MySqlConnection($cs)
            }
            $conn.Open()
            return $conn
        }
        catch {
            $lastError = $_
            if ($attempt -ge $MaxRetries) { break }

            $msg    = $_.Exception.Message.ToLower()
            $errNum = if ($_.Exception.InnerException) { $_.Exception.InnerException.Number } else { 0 }

            # Azure SQL auto-pause/transiente: espera longa com backoff
            $isTransient = ($azureTransientCodes -contains $errNum) -or
                           ($azureTransientMsgs | Where-Object { $msg -like "*$_*" })
            if ($isTransient) {
                $waitSec = [math]::Min(10 * $attempt, 60)
                Write-Host "[DB] Banco indisponivel (tentativa $attempt/$MaxRetries) — aguardando ${waitSec}s para wake-up..." -ForegroundColor Yellow
                Start-Sleep -Seconds $waitSec
            } else {
                Start-Sleep -Milliseconds (500 * $attempt)
            }
        }
    }
    throw "Falha ao conectar no banco apos $MaxRetries tentativas: $($lastError.Exception.Message)"
}

# ------------------------------------------------------------------------------
# Encerra a conexao com seguranca
# ------------------------------------------------------------------------------
function Close-DbConnection {
    param(
        [Parameter(Mandatory=$false)] $Connection
    )
    if ($null -eq $Connection) { return }
    try {
        if ($Connection.State -eq [System.Data.ConnectionState]::Open) { $Connection.Close() }
    } catch { }
    try {
        if ($Connection -is [System.IDisposable]) { $Connection.Dispose() }
    } catch { }
}

# ------------------------------------------------------------------------------
# Verifica se a conexao esta aberta; se nao estiver, tenta reabrir
# ------------------------------------------------------------------------------
function Test-DbConnection {
    param(
        [Parameter(Mandatory)] $Connection
    )
    if ($null -eq $Connection) { return $false }
    try {
        if ($Connection.State -ne [System.Data.ConnectionState]::Open) {
            $Connection.Open()
        }
        return $Connection.State -eq [System.Data.ConnectionState]::Open
    } catch {
        return $false
    }
}

# ------------------------------------------------------------------------------
# Executa NonQuery (INSERT/UPDATE/DELETE) com PARAMETROS - previne SQL Injection
# Aceita um hashtable @{ '@p1' = valor; '@p2' = ... } no parametro -Parameters
# ------------------------------------------------------------------------------
function Invoke-DbNonQuery {
    param(
        [Parameter(Mandatory)] [string]    $Query,
        [Parameter(Mandatory)] $Connection,
        [Parameter(Mandatory=$false)] [hashtable] $Parameters = @{},
        [Parameter(Mandatory=$false)] [int] $TimeoutSeconds = 120,
        [Parameter(Mandatory=$false)] [int] $MaxRetries     = 3
    )

    if (-not (Test-DbConnection -Connection $Connection)) {
        throw "Conexao com banco esta fechada e nao foi possivel reabri-la."
    }

    $attempt = 0
    while ($true) {
        $attempt++
        $cmd = $null
        try {
            $cmd = $Connection.CreateCommand()
            $cmd.CommandText    = $Query
            $cmd.CommandTimeout = $TimeoutSeconds
            foreach ($key in $Parameters.Keys) {
                $val = $Parameters[$key]
                if ($null -eq $val) { $val = [DBNull]::Value }
                [void]$cmd.Parameters.AddWithValue($key, $val)
            }
            return $cmd.ExecuteNonQuery()
        }
        catch {
            if ($attempt -ge $MaxRetries) {
                Write-Host "[DB] Falha apos $attempt tentativas: $($_.Exception.Message)" -ForegroundColor Red
                throw
            }
            Start-Sleep -Milliseconds (200 * $attempt)
        }
        finally {
            if ($null -ne $cmd) { $cmd.Dispose() }
        }
    }
}

# ------------------------------------------------------------------------------
# Executa consulta escalar (retorna unico valor) - parametrizado
# ------------------------------------------------------------------------------
function Invoke-DbScalar {
    param(
        [Parameter(Mandatory)] [string]    $Query,
        [Parameter(Mandatory)] $Connection,
        [Parameter(Mandatory=$false)] [hashtable] $Parameters = @{}
    )
    if (-not (Test-DbConnection -Connection $Connection)) {
        throw "Conexao com banco nao esta disponivel."
    }
    $cmd = $Connection.CreateCommand()
    try {
        $cmd.CommandText = $Query
        foreach ($key in $Parameters.Keys) {
            $val = $Parameters[$key]
            if ($null -eq $val) { $val = [DBNull]::Value }
            [void]$cmd.Parameters.AddWithValue($key, $val)
        }
        return $cmd.ExecuteScalar()
    }
    finally { $cmd.Dispose() }
}

# ------------------------------------------------------------------------------
# Executa SELECT e retorna lista de PSCustomObject
# ------------------------------------------------------------------------------
function Invoke-DbReader {
    param(
        [Parameter(Mandatory)] [string]    $Query,
        [Parameter(Mandatory)] $Connection,
        [Parameter(Mandatory=$false)] [hashtable] $Parameters = @{},
        [Parameter(Mandatory=$false)] [int] $TimeoutSeconds = 30
    )
    if (-not (Test-DbConnection -Connection $Connection)) {
        throw "Conexao com banco nao esta disponivel."
    }
    $cmd    = $Connection.CreateCommand()
    $reader = $null
    try {
        $cmd.CommandText    = $Query
        $cmd.CommandTimeout = $TimeoutSeconds
        foreach ($key in $Parameters.Keys) {
            $val = $Parameters[$key]
            if ($null -eq $val) { $val = [DBNull]::Value }
            [void]$cmd.Parameters.AddWithValue($key, $val)
        }
        $reader = $cmd.ExecuteReader()
        $resultados = New-Object System.Collections.Generic.List[object]
        while ($reader.Read()) {
            $obj = [ordered]@{}
            for ($i = 0; $i -lt $reader.FieldCount; $i++) {
                $obj[$reader.GetName($i)] = if ($reader.IsDBNull($i)) { $null } else { $reader.GetValue($i) }
            }
            $resultados.Add([PSCustomObject]$obj)
        }
        # A virgula unaria evita que o PowerShell "desembrulhe" o array no
        # retorno da funcao - sem ela, uma consulta que retorna exatamente 1
        # linha vira um PSCustomObject solto (nao um array de 1 item) e uma
        # que retorna 0 linhas vira $null, quebrando qualquer chamador que
        # espere .Count/.Contains/foreach consistentes independente da
        # quantidade de linhas. Confirmado na pratica: Get-CompletedSiteUrls
        # (Repository.ps1) tomou "The property 'Count' cannot be found" com 0
        # linhas antes deste fix.
        return ,$resultados.ToArray()
    }
    finally {
        if ($null -ne $reader) { $reader.Dispose() }
        $cmd.Dispose()
    }
}

# ------------------------------------------------------------------------------
# Bulk Insert de alta performance via SqlBulkCopy
# Recebe um DataTable preenchido com colunas mapeadas pelo chamador.
# Indicado para volumes acima de 1.000 registros.
# ------------------------------------------------------------------------------
function Invoke-DbBulkInsert {
    param(
        [Parameter(Mandatory)] $Connection,
        [Parameter(Mandatory)] [System.Data.DataTable] $DataTable,
        [Parameter(Mandatory)] [string] $DestinationTable,
        [Parameter(Mandatory=$false)] [int] $BatchSize      = 5000,
        [Parameter(Mandatory=$false)] [int] $TimeoutSeconds = 300
    )

    if ($null -eq $DataTable -or $DataTable.Rows.Count -eq 0) { return 0 }
    if (-not (Test-DbConnection -Connection $Connection)) {
        throw "Conexao com banco nao esta disponivel para BulkCopy."
    }

    # Funciona apenas para SQL Server - MySQL usaria MySqlBulkLoader
    if ($Connection -isnot [System.Data.SqlClient.SqlConnection]) {
        throw "BulkInsert atualmente eh suportado apenas em SQL Server."
    }

    $bulk = New-Object System.Data.SqlClient.SqlBulkCopy($Connection)
    try {
        $bulk.DestinationTableName = $DestinationTable
        $bulk.BatchSize            = $BatchSize
        $bulk.BulkCopyTimeout      = $TimeoutSeconds

        # Mapeia automaticamente colunas pelo nome
        foreach ($col in $DataTable.Columns) {
            [void]$bulk.ColumnMappings.Add($col.ColumnName, $col.ColumnName)
        }

        $bulk.WriteToServer($DataTable)
        return $DataTable.Rows.Count
    }
    finally {
        $bulk.Close()
    }
}

# ------------------------------------------------------------------------------
# Salva um lote generico montando INSERT ... VALUES (...) com parameterizacao.
# Aceita:
#   $TableName    = nome da tabela destino
#   $ColumnMap    = ordered/hashtable @{ 'coluna_sql' = 'PropriedadeNoObjeto' }
#   $Batch        = array de PSCustomObject
#   $Connection   = conexao ativa
#   $Provider     = 'sql' ou 'mysql' (default = $global:auth.connection)
#   $ChunkSize    = quantos registros por INSERT (default $global:params.sql_batch_size)
# Insere com PARAMETROS para evitar SQL Injection e problemas de encoding.
# ------------------------------------------------------------------------------
function Save-DbBatch {
    param(
        [Parameter(Mandatory)] [string]    $TableName,
        [Parameter(Mandatory)] [hashtable] $ColumnMap,
        [Parameter(Mandatory)] $Batch,
        [Parameter(Mandatory)] $Connection,
        [Parameter(Mandatory=$false)] [string] $Provider  = $null,
        [Parameter(Mandatory=$false)] [int]    $ChunkSize = 0
    )

    if ($null -eq $Batch -or $Batch.Count -eq 0) { return 0 }
    if ([string]::IsNullOrEmpty($Provider)) {
        $Provider = if ($global:auth.connection) { $global:auth.connection } else { 'sql' }
    }
    if ($ChunkSize -le 0) {
        $ChunkSize = if ($global:params.sql_batch_size) { [int]$global:params.sql_batch_size } else { 500 }
    }

    $columns = @($ColumnMap.Keys)

    # SQL Server limita 2100 parametros por query. Garante que nunca ultrapassamos.
    if ($Provider -eq 'sql' -and $columns.Count -gt 0) {
        $maxByParams = [math]::Floor(2000 / $columns.Count)
        if ($ChunkSize -gt $maxByParams) { $ChunkSize = $maxByParams }
    }
    $columnList = ($columns | ForEach-Object {
        if ($Provider -eq 'sql') { "[$_]" } else { "``$_``" }
    }) -join ','

    $total = 0
    for ($offset = 0; $offset -lt $Batch.Count; $offset += $ChunkSize) {
        $end = [Math]::Min($offset + $ChunkSize - 1, $Batch.Count - 1)
        $chunk = $Batch[$offset..$end]

        $paramSet  = @{}
        $valueRows = New-Object System.Collections.Generic.List[string]
        $rowIndex  = 0
        foreach ($obj in $chunk) {
            $placeholders = New-Object System.Collections.Generic.List[string]
            foreach ($col in $columns) {
                $propName = $ColumnMap[$col]
                $value = $null
                if ($obj.PSObject.Properties.Name -contains $propName) {
                    $value = $obj.$propName
                }
                $pname = "@p_${rowIndex}_$col"
                $placeholders.Add($pname)
                $paramSet[$pname] = $value
            }
            $valueRows.Add("(" + ($placeholders -join ',') + ")")
            $rowIndex++
        }

        $sql = "INSERT INTO $TableName ($columnList) VALUES $(($valueRows -join ','))"
        Invoke-DbNonQuery -Query $sql -Connection $Connection -Parameters $paramSet | Out-Null
        $total += $chunk.Count
    }
    return $total
}

# ------------------------------------------------------------------------------
# Converte um array de PSCustomObject em DataTable com tipagem inferida.
# Util para passar ao Invoke-DbBulkInsert.
# ------------------------------------------------------------------------------
function ConvertTo-DataTable {
    param(
        [Parameter(Mandatory)] $InputObject,
        [Parameter(Mandatory=$false)] [hashtable] $ColumnTypes = $null
    )
    $dt = New-Object System.Data.DataTable
    if ($null -eq $InputObject -or $InputObject.Count -eq 0) { return $dt }

    # Cria colunas a partir do primeiro objeto (ou da definicao de tipos)
    $primeiro = $InputObject[0]
    foreach ($prop in $primeiro.PSObject.Properties) {
        $colType = [string]
        if ($null -ne $ColumnTypes -and $ColumnTypes.ContainsKey($prop.Name)) {
            $colType = $ColumnTypes[$prop.Name]
        } elseif ($null -ne $prop.Value) {
            $colType = $prop.Value.GetType()
        }
        [void]$dt.Columns.Add($prop.Name, $colType)
    }

    foreach ($obj in $InputObject) {
        $row = $dt.NewRow()
        foreach ($col in $dt.Columns) {
            $val = $obj.($col.ColumnName)
            $row[$col.ColumnName] = if ($null -eq $val) { [DBNull]::Value } else { $val }
        }
        $dt.Rows.Add($row)
    }
    return ,$dt
}
