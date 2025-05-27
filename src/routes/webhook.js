const express = require('express');
const router = express.Router();
const puppeteerManager = require('../services/puppeteerManager');
const { validateWebhookAuth } = require('../middleware/auth');
const { createLogger } = require('../utils/logger');
const crypto = require('crypto');

const logger = createLogger('WebhookRoute');

// Middleware de validação para webhooks do N8N
router.use(validateWebhookAuth);

// Endpoint de autenticação
router.post('/auth', async (req, res) => {
  const { username, password, sessionId } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: 'Username e password são obrigatórios'
    });
  }

  const effectiveSessionId = sessionId || crypto.randomBytes(16).toString('hex');

  try {
    logger.info(`Requisição de autenticação recebida para usuário: ${username}`);
    
    const authResult = await puppeteerManager.createSession(effectiveSessionId, {
      username,
      password
    });

    res.json({
      success: true,
      sessionId: effectiveSessionId,
      token: authResult.token,
      tokenType: authResult.tokenType,
      expiresIn: authResult.expiresIn,
      portalAccess: authResult.portalAccess
    });

  } catch (error) {
    logger.error('Erro na autenticação:', error);
    res.status(401).json({
      success: false,
      error: error.message
    });
  }
});

// Endpoint de consulta de processo
router.post('/consulta-processo', async (req, res) => {
  const { sessionId, numeroProcesso, token } = req.body;

  if (!sessionId && !token) {
    return res.status(400).json({
      success: false,
      error: 'SessionId ou token é obrigatório'
    });
  }

  if (!numeroProcesso) {
    return res.status(400).json({
      success: false,
      error: 'Número do processo é obrigatório'
    });
  }

  try {
    let processData;

    if (sessionId) {
      // Usar sessão existente
      processData = await puppeteerManager.executeInSession(
        sessionId,
        async (authService, sessionToken) => {
          return await authService.searchProcess(numeroProcesso, sessionToken);
        }
      );
    } else {
      // Criar sessão temporária com token fornecido
      // Implementar lógica para uso direto do token
      return res.status(501).json({
        success: false,
        error: 'Uso direto de token ainda não implementado'
      });
    }

    res.json({
      success: true,
      processo: processData
    });

  } catch (error) {
    logger.error('Erro na consulta de processo:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Endpoint para fechar sessão
router.post('/logout', async (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({
      success: false,
      error: 'SessionId é obrigatório'
    });
  }

  try {
    await puppeteerManager.closeSession(sessionId);
    
    res.json({
      success: true,
      message: 'Sessão encerrada com sucesso'
    });

  } catch (error) {
    logger.error('Erro ao fechar sessão:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Endpoint de health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
