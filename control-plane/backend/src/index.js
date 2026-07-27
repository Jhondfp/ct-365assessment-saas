require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const session = require('express-session');
const passport = require('passport');
const logger = require('./config/logger');
const config = require('./config');
const { runMigrations } = require('./migrations');
const rotasAutenticacao = require('./routes/auth');
const rotasClientes = require('./routes/clients');
const rotasInquilinos = require('./routes/tenants');
const rotasExecucoes = require('./routes/executions');
const rotasPainel = require('./routes/dashboard');
const rotasRecursos = require('./routes/features');
const rotasAdmin = require('./routes/admin');
const rotasFaturamento = require('./routes/billing');
const rotasLicencas = require('./routes/licenses');
const rotasGovernanca = require('./routes/governance');
const rotasGovernancaCompleta = require('./routes/completeGovernance');
const rotasTimes = require('./routes/teams');
const rotasPurview = require('./routes/purview');

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
// SESSÃO E AUTENTICAÇÃO
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
// MIDDLEWARE DE REGISTRO
// ======================================
app.use((req, res, next) => {
  const inicio = Date.now();
  res.on('finish', () => {
    const duracao = Date.now() - inicio;
    logger.info({
      metodo: req.method,
      caminho: req.path,
      status: res.statusCode,
      duracao: `${duracao}ms`,
      usuario: req.user?.email || 'anonimo'
    });
  });
  next();
});

// ======================================
// ROTAS PÚBLICAS
// ======================================
app.use('/api/auth', rotasAutenticacao);

// Verificação de saúde
app.get('/saude', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Aceitação de convite de usuário (público)
const servicoUsuario = require('./services/userService');
app.post('/api/auth/aceitar-convite', async (req, res) => {
  try {
    const { token, name, password_hash, telefone } = req.body;

    if (!token || !name || !password_hash) {
      return res.status(400).json({ erro: 'Campos obrigatórios faltando' });
    }

    const resultado = await servicoUsuario.acceptInvitation(token, {
      name,
      password_hash,
      telefone,
    });

    res.status(201).json({
      usuario: resultado.user,
      mensagem: 'Conta de usuário criada com sucesso',
    });
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});

// ======================================
// MIDDLEWARE DE AUTENTICAÇÃO
// ======================================
const requerAutenticacao = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ erro: 'Não autenticado' });
  }
  next();
};

// ======================================
// ROTAS PROTEGIDAS
// ======================================
app.use('/api/clientes', requerAutenticacao, rotasClientes);
app.use('/api/inquilinos', requerAutenticacao, rotasInquilinos);
app.use('/api/execucoes', requerAutenticacao, rotasExecucoes);
app.use('/api/painel', requerAutenticacao, rotasPainel);
app.use('/api', requerAutenticacao, rotasRecursos);
app.use('/api/admin', requerAutenticacao, rotasAdmin);
app.use('/api/faturamento', requerAutenticacao, rotasFaturamento);
app.use('/api/licencas', requerAutenticacao, rotasLicencas);
app.use('/api/governanca', requerAutenticacao, rotasGovernanca);
app.use('/api/governanca', requerAutenticacao, rotasGovernancaCompleta);
app.use('/api/governanca', requerAutenticacao, rotasTimes);
app.use('/api/governanca', requerAutenticacao, rotasPurview);

// ======================================
// TRATAMENTO DE ERROS
// ======================================
app.use((erro, req, res, next) => {
  logger.error({
    erro: erro.message,
    stack: erro.stack,
    caminho: req.path,
    metodo: req.method
  });

  if (erro.status) {
    return res.status(erro.status).json({ erro: erro.message });
  }

  res.status(500).json({
    erro: 'Erro interno do servidor',
    mensagem: process.env.NODE_ENV === 'development' ? erro.message : undefined
  });
});

// ======================================
// MANIPULADOR 404
// ======================================
app.use((req, res) => {
  res.status(404).json({ erro: 'Rota não encontrada' });
});

// ======================================
// INICIALIZAÇÃO
// ======================================
const PORTA = process.env.PORT || 3000;

async function startServer() {
  try {
    // Run database migrations
    logger.info('Running database migrations...');
    const migrationsOk = await runMigrations();
    if (!migrationsOk) {
      logger.error('Database migrations failed');
      process.exit(1);
    }

    // Start server after migrations complete
    const servidor = app.listen(PORTA, () => {
      logger.info(`✓ Plano de Controle iniciado na porta ${PORTA}`);
      logger.info(`  Ambiente: ${process.env.NODE_ENV}`);
      logger.info(`  Banco de dados: ${config.CP_DB_SERVER}:${config.CP_DB_PORT}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM recebido, encerrando graciosamente...');
      servidor.close(() => {
        logger.info('Servidor encerrado');
        process.exit(0);
      });
    });
  } catch (err) {
    logger.error(`Erro ao iniciar servidor: ${err.message}`);
    process.exit(1);
  }
}

startServer();

module.exports = app;
