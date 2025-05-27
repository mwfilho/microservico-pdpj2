const express = require('express');
const router = express.Router();
const PuppeteerManager = require('../services/puppeteerManager');
const { createLogger } = require('../utils/logger');

const logger = createLogger('WebhookRoute');

// POST /webhook - Rota principal de autenticação
router.post('/', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Validar dados de entrada
    if (!username || !password) {
      logger.warn('Dados de entrada inválidos', { username: username ? 'presente' : 'ausente', password: password ? 'presente' : 'ausente' });
      return res.status(400).json({
        success: false,
        error: 'Username e password são obrigatórios'
      });
    }

    logger.info('Requisição de autenticação recebida para usuário:', username);

    // Criar nova sessão
    const puppeteerManager = new PuppeteerManager();
    const result = await puppeteerManager.createSession(username, password);

    logger.info('Autenticação bem-sucedida para usuário:', username);
    
    res.json({
      success: true,
      sessionId: result.sessionId,
      token: result.token,
      message: 'Autenticação realizada com sucesso'
    });

  } catch (error) {
    logger.error('Erro na autenticação:', error.message);
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /webhook/health - Health check
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'PJE Auth Webhook'
  });
});

// POST /webhook/auth - Rota alternativa (para compatibilidade)
router.post('/auth', async (req, res) => {
  // Redirecionar para a rota principal
  req.url = '/';
  router.handle(req, res);
});

module.exports = router;
