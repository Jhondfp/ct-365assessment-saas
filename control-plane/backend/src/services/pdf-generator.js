const crypto = require('crypto');
const logger = require('../config/logger');
const { BlobServiceClient } = require('@azure/storage-blob');
const config = require('../config');

let blobServiceClient = null;

const getBlobServiceClient = () => {
  if (!blobServiceClient && config.AZURE_STORAGE_CONNECTION_STRING) {
    blobServiceClient = BlobServiceClient.fromConnectionString(
      config.AZURE_STORAGE_CONNECTION_STRING
    );
  }
  return blobServiceClient;
};

// Gerar HTML do relatório de assessment
const generateReportHtml = (executionData) => {
  const {
    client_name,
    tenant_name,
    gb_processado,
    custo_real,
    findings_json,
    sites_analisados,
    iniciado_em,
    finalizado_em
  } = executionData;

  const findings = typeof findings_json === 'string' ? JSON.parse(findings_json) : findings_json || [];
  const sites = typeof sites_analisados === 'string' ? JSON.parse(sites_analisados) : sites_analisados || [];
  const duration = finalizado_em ? Math.round((new Date(finalizado_em) - new Date(iniciado_em)) / 1000) : 0;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Relatório de Assessment - ${client_name}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          color: #333;
          line-height: 1.6;
          padding: 40px;
        }
        .page-break { page-break-after: always; margin-bottom: 40px; }
        .header {
          background: linear-gradient(135deg, #c94d16 0%, #6b3fa0 100%);
          color: white;
          padding: 40px;
          border-radius: 8px;
          margin-bottom: 40px;
        }
        .header h1 { font-size: 28px; margin-bottom: 10px; }
        .header p { opacity: 0.9; }
        .section { margin-bottom: 40px; }
        .section h2 {
          color: #c94d16;
          font-size: 20px;
          margin-bottom: 20px;
          border-bottom: 2px solid #c94d16;
          padding-bottom: 10px;
        }
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
          margin-bottom: 30px;
        }
        .summary-card {
          background: #f5f5f5;
          padding: 20px;
          border-radius: 8px;
          border-left: 4px solid #6b3fa0;
        }
        .summary-card .label {
          color: #999;
          font-size: 12px;
          text-transform: uppercase;
          margin-bottom: 5px;
        }
        .summary-card .value {
          font-size: 24px;
          font-weight: bold;
          color: #6b3fa0;
        }
        .findings-list { margin-top: 20px; }
        .finding-item {
          background: white;
          border: 1px solid #ddd;
          border-left: 4px solid #c94d16;
          padding: 15px;
          margin-bottom: 15px;
          border-radius: 4px;
        }
        .finding-severity {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 3px;
          font-size: 12px;
          font-weight: bold;
          margin-bottom: 10px;
        }
        .severity-high { background: #fccccb; color: #b71c1c; }
        .severity-medium { background: #ffe0b2; color: #e65100; }
        .severity-low { background: #c8e6c9; color: #2e7d32; }
        .table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        .table th {
          background: #6b3fa0;
          color: white;
          padding: 12px;
          text-align: left;
          font-weight: 600;
        }
        .table td {
          padding: 12px;
          border-bottom: 1px solid #ddd;
        }
        .table tr:nth-child(even) { background: #f9f9f9; }
        .footer {
          margin-top: 60px;
          padding-top: 20px;
          border-top: 1px solid #ddd;
          font-size: 12px;
          color: #999;
        }
        @media print {
          body { padding: 0; }
          .page-break { page-break-after: always; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Relatório de Assessment</h1>
        <p>Microsoft 365 - Análise de Compartilhamentos e Dados</p>
      </div>

      <div class="section">
        <h2>Informações Gerais</h2>
        <div class="summary-grid">
          <div class="summary-card">
            <div class="label">Cliente</div>
            <div class="value">${client_name}</div>
          </div>
          <div class="summary-card">
            <div class="label">Tenant</div>
            <div class="value">${tenant_name}</div>
          </div>
          <div class="summary-card">
            <div class="label">Dados Processados</div>
            <div class="value">${(gb_processado || 0).toFixed(2)} GB</div>
          </div>
          <div class="summary-card">
            <div class="label">Tempo de Execução</div>
            <div class="value">${duration} seg</div>
          </div>
        </div>
      </div>

      <div class="section">
        <h2>Resumo de Achados</h2>
        <p>Total de achados identificados: <strong>${findings.length}</strong></p>
        ${findings.length > 0 ? `
          <div class="findings-list">
            ${findings.slice(0, 10).map((finding, idx) => `
              <div class="finding-item">
                <span class="finding-severity severity-${finding.severity || 'medium'}">
                  ${(finding.severity || 'medium').toUpperCase()}
                </span>
                <h4>${finding.title || 'Achado ' + (idx + 1)}</h4>
                <p>${finding.description || 'Sem descrição'}</p>
                ${finding.impact ? `<p><strong>Impacto:</strong> ${finding.impact}</p>` : ''}
                ${finding.recommendation ? `<p><strong>Recomendação:</strong> ${finding.recommendation}</p>` : ''}
              </div>
            `).join('')}
            ${findings.length > 10 ? `<p style="text-align: center; color: #999; margin-top: 20px;">... e mais ${findings.length - 10} achados</p>` : ''}
          </div>
        ` : '<p>Nenhum achado identificado.</p>'}
      </div>

      <div class="section">
        <h2>SharePoint Sites Analisados</h2>
        ${sites.length > 0 ? `
          <table class="table">
            <thead>
              <tr>
                <th>URL do Site</th>
                <th>Tipo</th>
              </tr>
            </thead>
            <tbody>
              ${sites.slice(0, 20).map((site, idx) => `
                <tr>
                  <td>${site.url || site}</td>
                  <td>${site.type || 'SharePoint'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          ${sites.length > 20 ? `<p style="color: #999; margin-top: 10px;">... e mais ${sites.length - 20} sites</p>` : ''}
        ` : '<p>Nenhum site analisado.</p>'}
      </div>

      <div class="section">
        <h2>Análise Financeira</h2>
        <div class="summary-grid">
          <div class="summary-card">
            <div class="label">Custo Estimado</div>
            <div class="value">R$ ${(custo_real || 0).toFixed(2)}</div>
          </div>
          <div class="summary-card">
            <div class="label">Custo por GB</div>
            <div class="value">R$ ${(gb_processado && custo_real) ? (custo_real / gb_processado).toFixed(2) : '0.00'}</div>
          </div>
        </div>
      </div>

      <div class="footer">
        <p>
          <strong>Gerado em:</strong> ${new Date().toLocaleString('pt-BR')}<br>
          <strong>Período do Assessment:</strong> ${new Date(iniciado_em).toLocaleString('pt-BR')}
          até ${new Date(finalizado_em).toLocaleString('pt-BR')}
        </p>
        <p style="margin-top: 20px;">
          © 2026 CT Assessment SaaS. Relatório confidencial.
        </p>
      </div>
    </body>
    </html>
  `;
};

// Converter HTML para PDF (usando biblioteca simples)
const htmlToPdf = async (htmlContent) => {
  try {
    // TODO: Implementar conversão HTML → PDF
    // Opções:
    // 1. html-pdf (simples, sem dependências pesadas)
    // 2. puppeteer (mais robusto, requer Chrome)
    // 3. wkhtmltopdf (binário externo)

    // Placeholder - retornar buffer vazio
    // Em produção, usar uma dessas bibliotecas
    logger.warn('PDF conversion not yet implemented. Using placeholder.');
    return Buffer.from(htmlContent, 'utf-8');
  } catch (error) {
    logger.error(`Error converting HTML to PDF: ${error.message}`);
    throw error;
  }
};

// Upload para Azure Blob Storage
const uploadPdfToBlob = async (pdfBuffer, executionId) => {
  try {
    const client = getBlobServiceClient();
    if (!client) {
      throw new Error('Azure Storage not configured');
    }

    const containerName = 'reports';
    const containerClient = client.getContainerClient(containerName);

    // Criar container se não existir
    try {
      await containerClient.create({ access: 'container' });
      logger.info(`Container created: ${containerName}`);
    } catch (err) {
      if (err.code !== 'ContainerAlreadyExists') throw err;
    }

    // Nome do blob
    const blobName = `assessment-${executionId}-${Date.now()}.pdf`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    // Upload
    await blockBlobClient.upload(pdfBuffer, pdfBuffer.length);
    logger.info(`PDF uploaded to blob: ${blobName}`);

    // Gerar SAS token (válido por 24h)
    const { generateBlobSASQueryParameters, BlobSASPermissions } = require('@azure/storage-blob');

    const permissions = new BlobSASPermissions({ read: true });
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const sasToken = generateBlobSASQueryParameters(
      {
        containerName,
        blobName,
        permissions,
        expiresOn: expiresAt
      },
      // Nota: em produção, usar storage account key
      // Este é um placeholder
    );

    const blobUrl = `${blockBlobClient.url}?${sasToken}`;
    const md5Hash = crypto.createHash('md5').update(pdfBuffer).digest('hex');

    return {
      url: blobUrl,
      sas_token: sasToken?.toString() || null,
      size_bytes: pdfBuffer.length,
      hash_md5: md5Hash,
      expires_at: expiresAt
    };
  } catch (error) {
    logger.error(`Error uploading PDF to blob: ${error.message}`);
    throw error;
  }
};

const generateAndUploadPdf = async (executionData) => {
  try {
    logger.info(`Generating PDF for execution: ${executionData.id}`);

    // Gerar HTML
    const htmlContent = generateReportHtml(executionData);

    // Converter para PDF
    const pdfBuffer = await htmlToPdf(htmlContent);

    // Upload para blob (se configurado)
    let blobInfo = null;
    if (config.AZURE_STORAGE_CONNECTION_STRING) {
      blobInfo = await uploadPdfToBlob(pdfBuffer, executionData.id);
    }

    logger.info(`PDF generated successfully for execution: ${executionData.id}`);

    return {
      success: true,
      html: htmlContent,
      pdf: pdfBuffer,
      blob: blobInfo
    };
  } catch (error) {
    logger.error(`Error generating PDF: ${error.message}`);
    throw error;
  }
};

module.exports = {
  generateReportHtml,
  htmlToPdf,
  uploadPdfToBlob,
  generateAndUploadPdf
};
