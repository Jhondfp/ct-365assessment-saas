const logger = require('../config/logger');

const requireAuth = (req, res, next) => {
  if (!req.user) {
    logger.warn('Unauthorized access attempt to protected route', {
      path: req.path,
      method: req.method,
      ip: req.ip,
    });
    return res.status(401).json({ error: 'Não autenticado' });
  }
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  if (req.user.tipo !== 'admin') {
    logger.warn('Unauthorized admin access attempt', {
      path: req.path,
      method: req.method,
      user_id: req.user.id,
      user_type: req.user.tipo,
    });
    return res.status(403).json({ error: 'Acesso negado' });
  }

  next();
};

const requireClientAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  // Get clientId from route or body
  const clientId = req.params.clientId || req.body.client_id;

  // Admin users can access any client
  if (req.user.tipo === 'admin') {
    return next();
  }

  // Customer users can only access their own client
  if (req.user.client_id === clientId) {
    return next();
  }

  logger.warn('Unauthorized client access attempt', {
    path: req.path,
    method: req.method,
    user_id: req.user.id,
    user_client_id: req.user.client_id,
    requested_client_id: clientId,
  });

  res.status(403).json({ error: 'Acesso negado' });
};

module.exports = {
  requireAuth,
  requireAdmin,
  requireClientAdmin,
};
