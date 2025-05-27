const PDPJAuthService = require('./authService');
const { createLogger } = require('../utils/logger');

class PuppeteerManager {
  constructor() {
    this.sessions = new Map();
    this.logger = createLogger('PuppeteerManager');
    this.maxSessions = parseInt(process.env.MAX_SESSIONS) || 5;
  }

  async createSession(sessionId, credentials) {
    try {
      // Verificar limite de sessões
      if (this.sessions.size >= this.maxSessions) {
        throw new Error('Limite máximo de sessões atingido');
      }

      // Criar nova instância do serviço de autenticação
      const authService = new PDPJAuthService();
      await authService.initialize();

      // Realizar autenticação
      const authResult = await authService.authenticate(
        credentials.username,
        credentials.password
      );

      // Armazenar sessão
      this.sessions.set(sessionId, {
        authService,
        token: authResult.token,
        createdAt: new Date(),
        lastUsed: new Date(),
        authResult
      });

      this.logger.info(`Sessão criada: ${sessionId}`);

      return authResult;
    } catch (error) {
      this.logger.error(`Erro ao criar sessão ${sessionId}:`, error);
      throw error;
    }
  }

  async getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Sessão não encontrada');
    }

    // Atualizar timestamp de último uso
    session.lastUsed = new Date();
    
    return session;
  }

  async executeInSession(sessionId, callback) {
    const session = await this.getSession(sessionId);
    
    try {
      return await callback(session.authService, session.token);
    } catch (error) {
      this.logger.error(`Erro ao executar em sessão ${sessionId}:`, error);
      throw error;
    }
  }

  async closeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      await session.authService.close();
      this.sessions.delete(sessionId);
      this.logger.info(`Sessão fechada: ${sessionId}`);
    }
  }

  async cleanupExpiredSessions() {
    const now = new Date();
    const expirationTime = parseInt(process.env.SESSION_EXPIRATION) || 3600000; // 1 hora

    for (const [sessionId, session] of this.sessions) {
      const sessionAge = now - session.lastUsed;
      if (sessionAge > expirationTime) {
        await this.closeSession(sessionId);
        this.logger.info(`Sessão expirada removida: ${sessionId}`);
      }
    }
  }

  async closeAllSessions() {
    for (const sessionId of this.sessions.keys()) {
      await this.closeSession(sessionId);
    }
  }
}

module.exports = new PuppeteerManager();
