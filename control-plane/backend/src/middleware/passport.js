const passport = require('passport');
const AzureADStrategy = require('passport-azure-ad').OIDCStrategy;
const config = require('../config');
const db = require('../services/database');
const logger = require('../config/logger');
const { v4: uuidv4 } = require('uuid');

// Estratégia 1: Login corporativo (seu tenant)
// Fluxo de autenticação para a equipe interna entrar no painel administrativo
const azureStrategy = new AzureADStrategy(
  {
    identityMetadata: `https://login.microsoftonline.com/${config.AZURE_TENANT_ID}/v2.0/.well-known/openid-configuration`,
    clientID: config.AZURE_CLIENT_ID,
    clientSecret: config.AZURE_CLIENT_SECRET,
    responseType: 'code id_token',
    responseMode: 'form_post',
    redirectUrl: `${process.env.APP_URL || 'http://localhost:3000'}/api/auth/callback`,
    allowHttpForRedirectUrl: process.env.NODE_ENV === 'development',
    passReqToCallback: true,
    scope: ['profile', 'email', 'openid'],
    loggingLevel: 'info'
  },
  async (req, iss, sub, profile, accessToken, refreshToken, done) => {
    try {
      const entraObjectId = profile.oid;
      const email = profile.upn || profile._json.email;
      const nome = profile.displayName || profile.name;

      // Buscar ou criar usuário no banco
      const user = await db.getUserByEntraId(entraObjectId);

      if (user) {
        await db.updateUserLastAccess(user.id);
        return done(null, user);
      }

      // Novo usuário: criar com papel padrão 'viewer' (baixo privilégio)
      const newUserId = uuidv4();
      await db.createUser({
        id: newUserId,
        entra_object_id: entraObjectId,
        nome,
        email,
        papel: 'viewer' // papel padrão, SuperAdmin deve atualizar depois
      });

      const newUser = await db.getUserById(newUserId);
      return done(null, newUser);
    } catch (err) {
      logger.error(`Erro na autenticação Entra ID: ${err.message}`);
      return done(err);
    }
  }
);

// Serialização de usuário para session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await db.getUserById(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

passport.use('azure', azureStrategy);

module.exports = {
  azureStrategy,
  requireRole: (rolesAllowed) => (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    if (!rolesAllowed.includes(req.user.papel)) {
      logger.warn(`Acesso negado a ${req.user.email} - papel: ${req.user.papel}`);
      return res.status(403).json({ error: 'Acesso negado - privilégios insuficientes' });
    }

    next();
  },

  requireTenantAccess: (req, res, next) => {
    // Verifica se o usuário tem acesso ao tenant solicitado
    // Implementado após rota específica conhecer o tenant_id
    next();
  }
};
