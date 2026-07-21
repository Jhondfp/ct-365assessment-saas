# Imagem base: PowerShell no Ubuntu
FROM mcr.microsoft.com/powershell:latest

# Instalar dependências
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Criar diretório de trabalho
WORKDIR /app

# Copiar scripts
COPY scripts/ /app/scripts/
COPY entrypoint.ps1 /app/

# Dar permissão de execução
RUN chmod +x /app/entrypoint.ps1

# Volumes
VOLUME /data

# Argumentos que serão passados ao iniciar o container
# Exemplo: docker run ... ct-job:latest \
#   -TenantId "xxx" -M365TenantId "yyy" -SqlServer "zzz" -SqlDatabase "www" -KeyVaultUri "aaa"

ENTRYPOINT [ "pwsh", "-File", "/app/entrypoint.ps1" ]
