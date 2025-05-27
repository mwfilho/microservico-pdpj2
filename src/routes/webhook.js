const express = require('express');
const router = express.Router();
const { createLogger } = require('../utils/logger');

const logger = createLogger('WebhookRoute');

// ✅ IMPORTAÇÃO ROBUSTA COM TRY/CATCH
let PuppeteerManager;
try {
  PuppeteerManager = require('../services/puppeteerManager');
  logger.info('PuppeteerManager importado com sucesso');
} catch (error) {
  logger.error('Erro ao importar PuppeteerManager:', error);
  throw error;
}

// Criar uma instância global do PuppeteerManager
let puppeteerManager;
try {
  puppeteerManager = new PuppeteerManager();
  logger.info('PuppeteerManager instanciado com sucesso');
} catch (error) {
  logger.error('Erro ao instanciar PuppeteerManager:', error);
  
  // Fallback: criar função que retorna erro
  puppeteerManager = {
    createSession: async () => {
      throw new Error('PuppeteerManager não pôde ser inicializado');
    },
    getStats: () => ({
      error: 'PuppeteerManager não pôde ser inicializado'
    })
  };
}

// Middleware de validação para todas as rotas POST
const validateAuthRequest = (req, res, next) => {
  if (req.method === 'POST') {
    const { username, password } = req.body;
    
    if (!username || !password) {
      logger.warn('Dados de entrada inválidos', { 
        username: username ? 'presente' : 'ausente', 
        password: password ? 'presente' : 'ausente',
        ip: req.ip
      });
      
      return res.status(400).json({
        success: false,
        error: 'Dados inválidos',
        message: 'Username e password são obrigatórios',
        timestamp: new Date().toISOString()
      });
    }
  }
  
  next();
};

// Aplicar validação em todas as rotas POST
router.use(validateAuthRequest);

// POST /webhook - Rota principal de autenticação
router.post('/', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { username, password } = req.body;
    
    logger.info('Requisição de autenticação recebida', {
      username: username,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    // Verificar se puppeteerManager está OK
    if (!puppeteerManager || !puppeteerManager.createSession) {
      throw new Error('PuppeteerManager não está disponível');
    }

    // Criar nova sessão
    const result = await puppeteerManager.createSession(username, password);

    const duration = Date.now() - startTime;
    
    logger.info('Autenticação bem-sucedida', {
      username: username,
      sessionId: result.sessionId,
      duration: `${duration}ms`,
      ip: req.ip
    });
    
    res.json({
      success: true,
      sessionId: result.sessionId,
      token: result.token,
      message: result.message || 'Autenticação realizada com sucesso',
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('Erro na autenticação', {
      error: error.message,
      duration: `${duration}ms`,
      ip: req.ip,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      error: error.message,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });
  }
});

// POST /webhook/auth - Rota alternativa
router.post('/auth', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { username, password } = req.body;
    
    logger.info('Requisição de autenticação recebida (rota /auth)', {
      username: username,
      ip: req.ip
    });

    // Verificar se puppeteerManager está OK
    if (!puppeteerManager || !puppeteerManager.createSession) {
      throw new Error('PuppeteerManager não está disponível');
    }

    const result = await puppeteerManager.createSession(username, password);

    const duration = Date.now() - startTime;

    res.json({
      success: true,
      sessionId: result.sessionId,
      token: result.token,
      message: result.message || 'Autenticação realizada com sucesso',
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('Erro na autenticação (rota /auth)', {
      error: error.message,
      duration: `${duration}ms`,
      ip: req.ip
    });
    
    res.status(500).json({
      success: false,
      error: error.message,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });
  }
});

// GET /webhook/health - Health check do webhook
router.get('/health', (req, res) => {
  try {
    const stats = puppeteerManager ? puppeteerManager.getStats() : { error: 'PuppeteerManager não disponível' };
    
    res.json({
      status: 'ok',
      service: 'PJE Auth Webhook',
      timestamp: new Date().toISOString(),
      sessions: stats,
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// GET /webhook/sessions - Estatísticas das sessões (só em dev)
router.get('/sessions', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      success: false,
      error: 'Acesso negado em produção'
    });
  }
  
  try {
    const stats = puppeteerManager ? puppeteerManager.getStats() : { error: 'PuppeteerManager não disponível' };
    
    res.json({
      success: true,
      sessions: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /webhook/cleanup - Limpar sessões manualmente (só em dev)
router.post('/cleanup', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      success: false,
      error: 'Acesso negado em produção'
    });
  }
  
  try {
    if (!puppeteerManager || !puppeteerManager.cleanupExpiredSessions) {
      throw new Error('PuppeteerManager não disponível');
    }
    
    const cleaned = await puppeteerManager.cleanupExpiredSessions();
    
    res.json({
      success: true,
      message: `${cleaned} sessões limpas`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
