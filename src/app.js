const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { createLogger } = require('./utils/logger');

const app = express();
const logger = createLogger('App');

// ==============================================================================
// CONFIGURAÇÕES BÁSICAS
// ==============================================================================

// Trust proxy ANTES de tudo (Railway/Heroku/etc)
app.set('trust proxy', 1);

// Configurações de ambiente
const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';

// ==============================================================================
// MIDDLEWARES DE SEGURANÇA E PARSING
// ==============================================================================

// CORS - Configuração permissiva para desenvolvimento, restritiva para produção
const corsOptions = {
  origin: NODE_ENV === 'production' 
    ? ['https://portaldeservicos.pdpj.jus.br', 'https://pje.cloud.tjpe.jus.br'] 
    : true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400 // 24 horas
};

app.use(cors(corsOptions));

// Rate Limiting - Configurado APÓS trust proxy
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: NODE_ENV === 'production' ? 100 : 1000, // Limite por IP
  message: {
    error: 'Muitas requisições deste IP, tente novamente em 15 minutos.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Key generator otimizado para Railway
  keyGenerator: (req) => {
    return req.ip || 
           req.headers['x-forwarded-for']?.split(',')[0] || 
           req.headers['x-real-ip'] || 
           req.connection.remoteAddress ||
           'unknown';
  },
  // Handler customizado para rate limit
  handler: (req, res) => {
    logger.warn('Rate limit atingido', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path
    });
    
    res.status(429).json({
      success: false,
      error: 'Rate limit exceeded',
      message: 'Muitas requisições deste IP, tente novamente em 15 minutos.',
      retryAfter: '15 minutes',
      timestamp: new Date().toISOString()
    });
  }
});

app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ==============================================================================
// LOGGING MIDDLEWARE
// ==============================================================================

// Request logging
app.use((req, res, next) => {
  const startTime = Date.now();
  
  // Log da requisição
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length')
  });
  
  // Log da resposta quando completar
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - startTime;
    
    logger.info(`${req.method} ${req.path} - ${res.statusCode}`, {
      duration: `${duration}ms`,
      statusCode: res.statusCode,
      ip: req.ip
    });
    
    return originalSend.call(this, data);
  };
  
  next();
});

// ==============================================================================
// IMPORTAR ROTAS (COM VERIFICAÇÃO DE ERRO)
// ==============================================================================

let webhookRoutes;
let authMiddleware;

try {
  // Tentar importar das rotas
  webhookRoutes = require('./routes/webhook');
  authMiddleware = require('./middleware/auth');
  
  logger.info('Rotas e middlewares importados com sucesso');
} catch (error) {
  logger.error('Erro ao importar rotas:', error.message);
  
  // Fallback - criar rotas básicas
  webhookRoutes = express.Router();
  webhookRoutes.get('/health', (req, res) => {
    res.json({
      status: 'error',
      message: 'Rotas não puderam ser carregadas',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  });
  
  authMiddleware = (req, res, next) => next(); // Middleware vazio
}

// ==============================================================================
// ROTAS PRINCIPAIS
// ==============================================================================

// Health check simples
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'PJE Auth Service funcionando',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: NODE_ENV,
    node: process.version,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    routes: [
      'GET /',
      'GET /health', 
      'POST /webhook',
      'GET /webhook/health',
      'POST /webhook/auth'
    ]
  });
});

// Health check detalhado
app.get('/health', (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    service: 'PJE Auth Service',
    version: '1.0.0',
    environment: NODE_ENV,
    node: process.version,
    platform: process.platform,
    pid: process.pid
  };
  
  res.json(health);
});

// ==============================================================================
// APLICAR ROTAS COM VERIFICAÇÃO DE TIPO
// ==============================================================================

// Verificar se webhookRoutes é realmente um router/função
if (typeof webhookRoutes === 'function') {
  app.use('/webhook', webhookRoutes);
  logger.info('Rotas /webhook aplicadas com sucesso');
} else {
  logger.error('webhookRoutes não é uma função válida:', typeof webhookRoutes);
  
  // Criar rota de fallback
  app.use('/webhook', (req, res) => {
    res.status(500).json({
      success: false,
      error: 'Webhook routes não disponíveis',
      timestamp: new Date().toISOString()
    });
  });
}

// ==============================================================================
// ERROR HANDLERS
// ==============================================================================

// 404 Handler
app.use('*', (req, res) => {
  logger.warn('Rota não encontrada', { 
    path: req.originalUrl, 
    method: req.method,
    ip: req.ip 
  });
  
  res.status(404).json({
    success: false,
    error: 'Endpoint não encontrado',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
    availableRoutes: [
      'GET /',
      'GET /health',
      'POST /webhook',
      'GET /webhook/health'
    ]
  });
});

// Global Error Handler
app.use((error, req, res, next) => {
  logger.error('Erro não tratado:', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    ip: req.ip
  });
  
  res.status(500).json({
    success: false,
    error: NODE_ENV === 'production' ? 'Erro interno do servidor' : error.message,
    timestamp: new Date().toISOString()
  });
});

// ==============================================================================
// INICIALIZAÇÃO DO SERVIDOR
// ==============================================================================

const server = app.listen(PORT, HOST, () => {
  logger.info('🚀 Servidor iniciado com sucesso', {
    port: PORT,
    host: HOST,
    environment: NODE_ENV,
    node: process.version,
    pid: process.pid,
    trustProxy: app.get('trust proxy')
  });
  
  logger.info('📡 Configurações carregadas:', {
    pjeUrl: process.env.PJE_URL || 'https://pje.cloud.tjpe.jus.br/1g/login.seam',
    portalUrl: process.env.PORTAL_URL || 'https://portaldeservicos.pdpj.jus.br',
    maxSessions: process.env.MAX_SESSIONS || 10,
    sessionTimeout: process.env.SESSION_TIMEOUT || 1800000
  });
});

// ==============================================================================
// GRACEFUL SHUTDOWN
// ==============================================================================

const gracefulShutdown = async (signal) => {
  logger.info(`Recebido sinal ${signal}, iniciando shutdown graceful...`);
  
  server.close(async () => {
    logger.info('Servidor HTTP fechado');
    
    try {
      // Tentar fechar sessões do Puppeteer se disponível
      const PuppeteerManager = require('./services/puppeteerManager');
      const puppeteerManager = new PuppeteerManager();
      await puppeteerManager.closeAllSessions();
      logger.info('Sessões Puppeteer fechadas');
    } catch (error) {
      logger.warn('Erro ao fechar sessões Puppeteer:', error.message);
    }
    
    logger.info('Shutdown concluído');
    process.exit(0);
  });
  
  // Forçar saída após 30 segundos
  setTimeout(() => {
    logger.error('Forçando saída após timeout');
    process.exit(1);
  }, 30000);
};

// Handlers para sinais de shutdown
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handlers para erros não tratados
process.on('uncaughtException', (error) => {
  logger.error('Exceção não tratada:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Promise rejeitada não tratada:', { reason, promise });
  gracefulShutdown('unhandledRejection');
});

module.exports = app;
