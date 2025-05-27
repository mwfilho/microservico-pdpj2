const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const webhookRoutes = require('./routes/webhook');
const apiRoutes = require('./routes/api');
const { errorHandler } = require('./middleware/errorHandler');
const { createLogger } = require('./utils/logger');
const puppeteerManager = require('./services/puppeteerManager');

const app = express();
const logger = createLogger('App');

// Segurança
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*'
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100 // limite de requisições
});
app.use('/webhook', limiter);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rotas
app.use('/webhook', webhookRoutes);
app.use('/api', apiRoutes);

// Health check na raiz
app.get('/', (req, res) => {
  res.json({
    service: 'PDPJ Authentication Microservice',
    version: '1.0.0',
    status: 'running'
  });
});

// Error handler
app.use(errorHandler);

// Inicialização
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Servidor rodando na porta ${PORT}`);
});

// Cleanup ao desligar
process.on('SIGTERM', async () => {
  logger.info('SIGTERM recebido, encerrando gracefully...');
  await puppeteerManager.closeAllSessions();
  process.exit(0);
});
