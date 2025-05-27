const { createLogger } = require('../utils/logger');
const logger = createLogger('ErrorHandler');

function errorHandler(err, req, res, next) {
  logger.error('Erro não tratado:', err);
  
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Erro interno do servidor',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

module.exports = { errorHandler };
