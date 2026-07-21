const express = require('express');
const passport = require('passport');
const router = express.Router();
const logger = require('../config/logger');

// ======================================
// Fluxo 1: Login Corporativo
// Entra ID single-tenant (equipe interna)
// ======================================

// Iniciar login
router.get('/login', passport.authenticate('azure', {
  scope: ['profile', 'email', 'openid']
}), (req, res) => {
  // Será redirecionado para o Entra ID
});

// Callback do Entra ID
router.post('/callback',
  passport.authenticate('azure', {
    failureRedirect: '/login-failure',
    failureMessage: true
  }),
  (req, res) => {
    logger.info(`✓ Login bem-sucedido: ${req.user.email}`);
    // Redirecionar para o painel
    res.redirect(process.env.FRONTEND_URL || 'http://localhost:3000/dashboard');
  }
);

// Logout
router.get('/logout', (req, res) => {
  const user = req.user?.email || 'unknown';
  req.logout((err) => {
    if (err) {
      logger.error(`Erro no logout: ${err.message}`);
      return res.status(500).json({ error: 'Erro ao fazer logout' });
    }
    logger.info(`✓ Logout: ${user}`);
    res.json({ message: 'Logout bem-sucedido' });
  });
});

// Status da sessão
router.get('/me', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Não autenticado' });
  }
  res.json({
    id: req.user.id,
    nome: req.user.nome,
    email: req.user.email,
    papel: req.user.papel
  });
});

// ======================================
// Fluxo 2: Onboarding do Cliente
// Entra ID multi-tenant (autorização de cliente)
// ======================================

/**
 * GET /api/auth/customer-consent
 * Inicia o fluxo de consentimento de administrador para o tenant do cliente.
 * Retorna a URL de consentimento do Azure que deve ser aberta em um navegador.
 */
router.get('/customer-consent', (req, res) => {
  const config = require('../config');

  const state = Buffer.from(JSON.stringify({
    clientId: req.query.client_id,
    returnUrl: req.query.return_url || '/dashboard'
  })).toString('base64');

  const params = new URLSearchParams({
    client_id: config.CUSTOMER_APP_REGISTRATION_ID,
    response_type: 'code',
    redirect_uri: `${process.env.APP_URL || 'http://localhost:3000'}/api/auth/customer-consent-callback`,
    scope: 'https://graph.microsoft.com/.default',
    state,
    prompt: 'admin_consent'
  });

  const consentUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;

  res.json({
    consent_url: consentUrl,
    message: 'Abra esta URL em um navegador para autorizar o acesso ao seu tenant'
  });
});

/**
 * POST /api/auth/customer-consent-callback
 * Callback após consentimento do administrador.
 * Troca o código de autorização por um token de acesso.
 */
router.post('/customer-consent-callback', async (req, res) => {
  try {
    const { code, state } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Código de autorização não fornecido' });
    }

    const stateData = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
    const clientId = stateData.clientId;

    // TODO: Implementar troca do código por token usando MSAL/axios
    // Esta é uma simplificação; a implementação real precisará:
    // 1. Trocar o código por um access token
    // 2. Obter as permissões concedidas
    // 3. Provisionar um novo tenant no control plane

    logger.info(`Consentimento recebido para client: ${clientId}`);

    res.json({
      success: true,
      message: 'Consentimento registrado. Seu tenant está sendo provisionado.',
      client_id: clientId
    });
  } catch (err) {
    logger.error(`Erro no callback de consentimento: ${err.message}`);
    res.status(500).json({ error: 'Erro ao processar consentimento' });
  }
});

module.exports = router;
