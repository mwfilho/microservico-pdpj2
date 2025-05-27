const express = require('express');
const router = express.Router();
const puppeteerManager = require('../services/puppeteerManager');
const { authenticateToken } = require('../middleware/auth');

// Aplicar autenticação em todas as rotas
router.use(authenticateToken);

// Rota para obter documentos de um processo
router.post('/documentos', async (req, res) => {
  const { sessionId, numeroProcesso, tipoDocumento } = req.body;

  try {
    const documentos = await puppeteerManager.executeInSession(
      sessionId,
      async (authService, token) => {
        // Implementar lógica de download de documentos
        return await authService.downloadDocuments(numeroProcesso, tipoDocumento, token);
      }
    );

    res.json({
      success: true,
      documentos
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Rota para obter movimentações
router.post('/movimentacoes', async (req, res) => {
  const { sessionId, numeroProcesso, dataInicio, dataFim } = req.body;

  try {
    const movimentacoes = await puppeteerManager.executeInSession(
      sessionId,
      async (authService, token) => {
        return await authService.getMovimentacoes(numeroProcesso, { dataInicio, dataFim }, token);
      }
    );

    res.json({
      success: true,
      movimentacoes
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Rota para informações detalhadas do processo
router.post('/processo-detalhes', async (req, res) => {
  const { sessionId, numeroProcesso } = req.body;

  try {
    const detalhes = await puppeteerManager.executeInSession(
      sessionId,
      async (authService, token) => {
        return await authService.getProcessDetails(numeroProcesso, token);
      }
    );

    res.json({
      success: true,
      detalhes
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
