const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { createLogger } = require('./utils/logger');

// Importar middleware
const authMiddleware = require('./middleware/auth');

// Importar rotas
const webhookRoutes = require('./routes/webhook');

const logger = createLogger('App');
const app = express();

// Configuração de CORS
app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  credentials: true
}));

// Middleware para parsing de JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Configuração de rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // máximo 100 requests por IP
  message: {
    error: 'Muitas tentativas. Tente novamente em 15 minutos.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: process.env.NODE_ENV === 'production' ? 1 : false,
  keyGenerator: (req) => {
    return req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
  }
});

// Aplicar rate limiting
app.use(limiter);

// Middleware de log
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });
  next();
});

// Rota principal
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'PJE Auth Service funcionando',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    routes: [
      'GET /',
      'GET /health',
      'POST /webhook',
      'GET /webhook/health',
      'POST /webhook/auth'
    ]
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    service: 'PJE Auth Service'
  });
});

// Aplicar middleware de auth nas rotas webhook
app.use('/webhook', authMiddleware);

// Registrar rotas
app.use('/webhook', webhookRoutes);

// Tratamento de erros
app.use((err, req, res, next) => {
  logger.error('Erro não tratado:', err);
  res.status(500).json({
    success: false,
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Erro interno'
  });
});

// Rotas não encontradas
app.use('*', (req, res) => {
  logger.warn(`Rota não encontrada: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    error: 'Rota não encontrada',
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
  logger.info(`🚀 Servidor rodando na porta ${PORT}`);
  logger.info(`📡 Ambiente: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM recebido, encerrando...');
  server.close(() => {
    logger.info('Servidor encerrado');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT recebido, encerrando...');
  server.close(() => {
    logger.info('Servidor encerrado');
    process.exit(0);
  });
});

// Cleanup de sessões
const PuppeteerManager = require('./services/puppeteerManager');
const puppeteerManager = new PuppeteerManager();

setInterval(async () => {
  try {
    const cleaned = await puppeteerManager.cleanupExpiredSessions();
    if (cleaned > 0) {
      logger.info(`🧹 Limpas ${cleaned} sessões expiradas`);
    }
  } catch (error) {
    logger.error('Erro na limpeza:', error);
  }
}, 15 * 60 * 1000);

module.exports = app;
