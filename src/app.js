const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { createLogger } = require('./utils/logger');

// Importar rotas
const webhookRoutes = require('./routes/webhook');

const logger = createLogger('App');
const app = express();

// Configuração de CORS
app.use(cors({
  origin: true, // Permitir qualquer origem em desenvolvimento
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Middleware para parsing de JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Configuração de rate limiting com trust proxy corrigido
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // máximo 100 requests por IP por janela
  message: {
    error: 'Muitas tentativas. Tente novamente em 15 minutos.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // CORREÇÃO: Configurar trust proxy corretamente
  trustProxy: false, // Mudado de true para false para evitar o warning
  keyGenerator: (req) => {
    // Usar IP real ou fallback para IP local
    return req.ip || req.connection.remoteAddress || 'unknown';
  }
});

// Aplicar rate limiting apenas em produção
if (process.env.NODE_ENV === 'production') {
  app.use(limiter);
  logger.info('Rate limiting ativo');
} else {
  logger.info('Rate limiting desabilitado (desenvolvimento)');
}

// Middleware de log de requisições
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });
  next();
});

// Rota principal - Health check
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'PJE Auth Service funcionando',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Registrar rotas do webhook
app.use('/webhook', webhookRoutes);

// Rota de health check global
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    service: 'PJE Auth Service'
  });
});

// Middleware de tratamento de erros
app.use((err, req, res, next) => {
  logger.error('Erro não tratado:', err);
  
  res.status(500).json({
    success: false,
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Erro interno'
  });
});

// Middleware para rotas não encontradas
app.use('*', (req, res) => {
  logger.warn(`Rota não encontrada: ${req.method} ${req.originalUrl}`);
  
  res.status(404).json({
    success: false,
    error: 'Rota não encontrada',
    message: `${req.method} ${req.originalUrl} não existe`,
    availableRoutes: [
      'GET /',
      'GET /health',
      'POST /webhook',
      'GET /webhook/health',
      'POST /webhook/auth'
    ]
  });
});

// Iniciar servidor
const PORT = process.env.PORT || 8080;

const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Servidor rodando na porta ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM recebido, encerrando gracefully...');
  server.close(() => {
    logger.info('Servidor encerrado');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT recebido, encerrando gracefully...');
  server.close(() => {
    logger.info('Servidor encerrado');
    process.exit(0);
  });
});

module.exports = app;
