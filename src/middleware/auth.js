const { createLogger } = require('../utils/logger');
const logger = createLogger('AuthMiddleware');

function validateWebhookAuth(req, res, next) {
  const webhookSecret = req.headers['x-webhook-secret'];
  
  if (!webhookSecret || webhookSecret !== process.env.WEBHOOK_SECRET) {
    logger.warn('Tentativa de acesso não autorizada ao webhook');
    return res.status(401).json({
      success: false,
      error: 'Não autorizado'
    });
  }
  
  next();
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Token não fornecido'
    });
  }
  
  // Implementar validação do token conforme necessário
  // Por enquanto, apenas verifica se existe
  req.token = token;
  next();
}

module.exports = {
  validateWebhookAuth,
  authenticateToken
};
