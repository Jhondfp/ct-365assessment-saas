# CT Assessment 365 — job de coleta (PowerShell 7 + PnP.PowerShell + coletor ct-assessmentspo)
# Uma execução por container: Azure Container Apps Job (produção) ou docker run (dev/manual).
# Build no Azure, sem Docker local:  az acr build -r <registro> -t ctassessment-job:<tag> job/
FROM mcr.microsoft.com/powershell:7.4-ubuntu-22.04

ARG PNP_VERSION=2.12.0
RUN pwsh -NoLogo -NoProfile -Command " \
      Set-PSRepository PSGallery -InstallationPolicy Trusted; \
      Install-Module PnP.PowerShell -RequiredVersion ${PNP_VERSION} -Scope AllUsers -Force; \
      Import-Module PnP.PowerShell; if (-not (Get-Module PnP.PowerShell)) { throw 'PnP.PowerShell nao instalou' }; \
      Write-Host ('PnP ' + (Get-Module PnP.PowerShell).Version)"

WORKDIR /app
COPY src ./src
COPY Invoke-SaasAssessment.ps1 Invoke-SaasHygiene.ps1 Invoke-SaasBatches.ps1 Invoke-SaasDelete.ps1 Invoke-SaasRepair.ps1 Start-Worker.ps1 ./
# higienização (limpeza de versões etc.) — scripts que ALTERAM o tenant; ver job/hygiene
COPY hygiene ./hygiene

# o coletor grava logs/ e src/progress/ relativos à raiz do projeto
RUN mkdir -p logs src/progress && useradd -r -u 10001 -m collector && chown -R collector /app
USER collector
ENV POWERSHELL_TELEMETRY_OPTOUT=1 PNPPOWERSHELL_UPDATECHECK=Off PNPPOWERSHELL_DISABLETELEMETRY=true

# Padrão: uma coleta, com ASSESSMENT_ID, CALLBACK_URL e CALLBACK_TOKEN (docker run / Container Apps Job).
# Worker de fila (produção sem RBAC): command = /app/Start-Worker.ps1, com PORTAL_URL e WORKER_TOKEN.
ENTRYPOINT ["pwsh", "-NoLogo", "-NoProfile", "-NonInteractive", "-File"]
CMD ["/app/Invoke-SaasAssessment.ps1"]
