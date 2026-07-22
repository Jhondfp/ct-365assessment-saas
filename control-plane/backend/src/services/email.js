const config = require('../config');
const logger = require('../config/logger');
const sgMail = require('@sendgrid/mail');

// Configurar SendGrid
if (config.SENDGRID_API_KEY) {
  sgMail.setApiKey(config.SENDGRID_API_KEY);
}

// Template: Email de conclusão de assessment
const getCompletionEmailHtml = (executionData, reportUrl) => {
  const { client_name, tenant_name, gb_processado, custo_real, iniciado_em } = executionData;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #c94d16 0%, #6b3fa0 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
        .button { background: #c94d16; color: white; padding: 12px 30px; border-radius: 4px; text-decoration: none; display: inline-block; margin-top: 20px; }
        .summary { background: white; padding: 20px; border-left: 4px solid #c94d16; margin: 20px 0; }
        .summary-item { margin: 10px 0; }
        .summary-item strong { color: #6b3fa0; }
        .footer { color: #999; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Assessment Concluído ✓</h1>
          <p>Seu assessment de dados de Microsoft 365 foi concluído com sucesso!</p>
        </div>

        <div class="content">
          <p>Olá,</p>

          <p>O assessment solicitado para <strong>${client_name}</strong> foi finalizado.</p>

          <div class="summary">
            <div class="summary-item">
              <strong>Tenant:</strong> ${tenant_name}
            </div>
            <div class="summary-item">
              <strong>Dados processados:</strong> ${gb_processado || 'N/A'} GB
            </div>
            <div class="summary-item">
              <strong>Custo estimado:</strong> R$ ${(custo_real || 0).toFixed(2)}
            </div>
            <div class="summary-item">
              <strong>Iniciado em:</strong> ${new Date(iniciado_em).toLocaleString('pt-BR')}
            </div>
          </div>

          <p>Clique no botão abaixo para visualizar o relatório completo:</p>

          <a href="${reportUrl}" class="button">Visualizar Relatório</a>

          <p style="margin-top: 30px; color: #666; font-size: 14px;">
            Este link é válido por 24 horas. Após expirar, você poderá acessar o relatório através do painel de controle.
          </p>

          <div class="footer">
            <p>© 2026 CT Assessment SaaS. Todos os direitos reservados.</p>
            <p>Esse é um email automatizado. Não responda este email.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
};

const sendCompletionEmail = async (recipientEmail, executionData, reportUrl) => {
  try {
    if (!config.SENDGRID_API_KEY) {
      logger.warn('SendGrid API key not configured. Email not sent.');
      return false;
    }

    const htmlContent = getCompletionEmailHtml(executionData, reportUrl);

    const msg = {
      to: recipientEmail,
      from: config.SENDGRID_FROM_EMAIL || 'noreply@ctassessment.com.br',
      subject: `[CT Assessment] Relatório de Assessment - ${executionData.client_name}`,
      html: htmlContent,
      replyTo: config.SENDGRID_REPLY_TO || 'support@ctassessment.com.br'
    };

    await sgMail.send(msg);
    logger.info(`Email sent to: ${recipientEmail}`);
    return true;
  } catch (error) {
    logger.error(`Error sending email: ${error.message}`);
    throw error;
  }
};

const sendCustomEmail = async (recipientEmail, subject, htmlContent) => {
  try {
    if (!config.SENDGRID_API_KEY) {
      logger.warn('SendGrid API key not configured. Email not sent.');
      return false;
    }

    const msg = {
      to: recipientEmail,
      from: config.SENDGRID_FROM_EMAIL || 'noreply@ctassessment.com.br',
      subject,
      html: htmlContent,
      replyTo: config.SENDGRID_REPLY_TO || 'support@ctassessment.com.br'
    };

    await sgMail.send(msg);
    logger.info(`Custom email sent to: ${recipientEmail}`);
    return true;
  } catch (error) {
    logger.error(`Error sending custom email: ${error.message}`);
    throw error;
  }
};

module.exports = {
  sendCompletionEmail,
  sendCustomEmail,
  getCompletionEmailHtml
};
