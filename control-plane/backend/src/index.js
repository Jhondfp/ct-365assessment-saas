require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const session = require('express-session');
const passport = require('passport');
const logger = require('./config/logger');
const config = require('./config');
const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/clients');
const tenantRoutes = require('./routes/tenants');
const executionRoutes = require('./routes/executions');
const dashboardRoutes = require('./routes/dashboard');
const featuresRoutes = require('./routes/features');

const app = express();

// ======================================
// MIDDLEWARE DE SEGURANÇA
// ======================================
app.use(helmet());
app.use(cors({
  origin: config.CORS_ORIGINS.split(','),
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ======================================
// SESSION & AUTENTICAÇÃO
// ======================================
app.use(session({
  secret: config.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 horas
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// ======================================
// LOGGING MIDDLEWARE
// ======================================
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      user: req.user?.email || 'anonymous'
    });
  });
  next();
});

// ======================================
// ROTAS PÚBLICAS
// ======================================
app.use('/api/auth', authRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ======================================
// MIDDLEWARE DE AUTENTICAÇÃO
// ======================================
const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Não autenticado' });
  }
  next();
};

// ======================================
// ROTAS PROTEGIDAS
// ======================================
app.use('/api/clients', requireAuth, clientRoutes);
app.use('/api/tenants', requireAuth, tenantRoutes);
app.use('/api/executions', requireAuth, executionRoutes);
app.use('/api/dashboard', requireAuth, dashboardRoutes);
app.use('/api', requireAuth, featuresRoutes);

// ======================================
// ERROR HANDLING
// ======================================
app.use((err, req, res, next) => {
  logger.error({
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  if (err.status) {
    return res.status(err.status).json({ error: err.message });
  }

  res.status(500).json({
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ======================================
// 404 HANDLER
// ======================================
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// ======================================
// INICIALIZAÇÃO
// ======================================
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  logger.info(`✓ Control Plane iniciado na porta ${PORT}`);
  logger.info(`  Ambiente: ${process.env.NODE_ENV}`);
  logger.info(`  Base de dados: ${config.CP_DB_SERVER}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM recebido, encerrando gracefully...');
  server.close(() => {
    logger.info('Servidor encerrado');
    process.exit(0);
  });
});

module.exports = app;
