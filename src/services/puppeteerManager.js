const PDPJAuthService = require('./authService');
const { createLogger } = require('../utils/logger');
const crypto = require('crypto');

class PuppeteerManager {
  constructor() {
    this.logger = createLogger('PuppeteerManager');
    this.sessions = new Map();
    this.maxSessions = parseInt(process.env.MAX_SESSIONS) || 10;
    this.sessionTimeout = parseInt(process.env.SESSION_TIMEOUT) || 30 * 60 * 1000; // 30 min
    
    this.logger.info('PuppeteerManager inicializado', {
      maxSessions: this.maxSessions,
      sessionTimeout: this.sessionTimeout
    });
  }

  // Gerar ID único para sessão
  generateSessionId() {
    return crypto.randomBytes(16).toString('hex');
  }

  // Criar nova sessão de autenticação
  async createSession(username, password) {
    const sessionId = this.generateSessionId();
    
    try {
      // Verificar limite de sessões
      if (this.sessions.size >= this.maxSessions) {
        this.logger.warn('Limite de sessões atingido, limpando antigas...');
        await this.cleanupOldestSession();
      }
      
      this.logger.info('Criando nova sessão', { sessionId, username });
      
      // Criar nova instância do serviço
      const authService = new PDPJAuthService();
      
      // Inicializar browser
      await authService.initialize();
      
      // Realizar autenticação
      const authResult = await authService.authenticate(username, password);
      
      // Armazenar sessão
      this.sessions.set(sessionId, {
        authService,
        username,
        createdAt: new Date(),
        lastUsed: new Date(),
        token: authResult.token,
        authenticated: authResult.success
      });
      
      this.logger.info('Sessão criada com sucesso', { 
        sessionId, 
        totalSessions: this.sessions.size 
      });
      
      return {
        sessionId,
        token: authResult.token,
        success: authResult.success,
        message: authResult.message
      };
      
    } catch (error) {
      this.logger.error(`Erro ao criar sessão ${sessionId}:`, error.message);
      
      // Limpar recursos em caso de erro
      await this.cleanupSession(sessionId);
      
      throw error;
    }
  }

  // Obter sessão existente
  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    
    if (session) {
      // Verificar se sessão não expirou
      const now = new Date();
      const inactiveTime = now - session.lastUsed;
      
      if (inactiveTime > this.sessionTimeout) {
        this.logger.info('Sessão expirada', { sessionId, inactiveTime });
        this.cleanupSession(sessionId);
        return null;
      }
      
      session.lastUsed = now;
      this.logger.info('Sessão acessada', { sessionId });
      return session;
    }
    
    this.logger.warn('Sessão não encontrada', { sessionId });
    return null;
  }

  // Buscar processo usando sessão existente
  async searchProcess(sessionId, processNumber) {
    const session = this.getSession(sessionId);
    
    if (!session) {
      throw new Error('Sessão não encontrada ou expirada');
    }
    
    try {
      this.logger.info('Buscando processo', { sessionId, processNumber });
      
      const result = await session.authService.searchProcess(processNumber, session.token);
      
      session.lastUsed = new Date();
      
      return result;
      
    } catch (error) {
      this.logger.error(`Erro ao buscar processo na sessão ${sessionId}:`, error.message);
      throw error;
    }
  }

  // Limpar sessão específica
  async cleanupSession(sessionId) {
    const session = this.sessions.get(sessionId);
    
    if (session) {
      try {
        await session.authService.close();
        this.logger.info('Browser fechado para sessão', { sessionId });
      } catch (error) {
        this.logger.error('Erro ao fechar browser', { sessionId, error: error.message });
      }
      
      this.sessions.delete(sessionId);
      this.logger.info('Sessão removida', { 
        sessionId, 
        totalSessions: this.sessions.size 
      });
    }
  }

  // Limpar sessão mais antiga
  async cleanupOldestSession() {
    if (this.sessions.size === 0) return;
    
    let oldestSessionId = null;
    let oldestTime = new Date();
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.createdAt < oldestTime) {
        oldestTime = session.createdAt;
        oldestSessionId = sessionId;
      }
    }
    
    if (oldestSessionId) {
      this.logger.info('Removendo sessão mais antiga', { sessionId: oldestSessionId });
      await this.cleanupSession(oldestSessionId);
    }
  }

  // Limpar sessões expiradas
  async cleanupExpiredSessions() {
    const now = new Date();
    const expiredSessions = [];
    
    for (const [sessionId, session] of this.sessions.entries()) {
      const inactiveTime = now - session.lastUsed;
      
      if (inactiveTime > this.sessionTimeout) {
        expiredSessions.push(sessionId);
      }
    }
    
    // Limpar sessões expiradas
    for (const sessionId of expiredSessions) {
      this.logger.info('Limpando sessão expirada', { sessionId });
      await this.cleanupSession(sessionId);
    }
    
    return expiredSessions.length;
  }

  // Fechar todas as sessões
  async closeAllSessions() {
    const sessionIds = Array.from(this.sessions.keys());
    
    this.logger.info('Fechando todas as sessões', { total: sessionIds.length });
    
    for (const sessionId of sessionIds) {
      await this.cleanupSession(sessionId);
    }
    
    this.logger.info('Todas as sessões fechadas');
  }

  // Obter estatísticas das sessões
  getStats() {
    const sessions = Array.from(this.sessions.values());
    const now = new Date();
    
    const activeSessions = sessions.filter(s => {
      const inactiveTime = now - s.lastUsed;
      return inactiveTime < 5 * 60 * 1000; // 5 minutos
    });
    
    const stats = {
      totalSessions: sessions.length,
      activeSessions: activeSessions.length,
      maxSessions: this.maxSessions,
      sessionTimeout: this.sessionTimeout,
      oldestSession: sessions.length > 0 ? Math.min(...sessions.map(s => s.createdAt.getTime())) : null,
      newestSession: sessions.length > 0 ? Math.max(...sessions.map(s => s.createdAt.getTime())) : null,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime()
    };
    
    return stats;
  }
}

// ✅ EXPORTAÇÃO CORRETA
module.exports = PuppeteerManager;
