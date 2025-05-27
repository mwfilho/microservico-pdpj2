const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createLogger } = require('../utils/logger');

puppeteer.use(StealthPlugin());

class PDPJAuthService {
  constructor() {
    this.browser = null;
    this.page = null;
    this.logger = createLogger('PDPJAuthService');
    this.config = {
      pjeUrl: process.env.PJE_URL || 'https://pje.cloud.tjpe.jus.br',
      portalUrl: process.env.PORTAL_URL || 'https://portaldeservicos.pdpj.jus.br',
      timeout: parseInt(process.env.TIMEOUT) || 30000,
      headless: process.env.HEADLESS !== 'false'
    };
  }

  async initialize() {
    try {
      this.browser = await puppeteer.launch({
        headless: this.config.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process'
        ]
      });
      
      this.page = await this.browser.newPage();
      
      // Configurar interceptadores de rede para capturar tokens
      await this.setupNetworkInterceptors();
      
      // Configurar viewport e user-agent
      await this.page.setViewport({ width: 1920, height: 1080 });
      await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      
      this.logger.info('Browser inicializado com sucesso');
    } catch (error) {
      this.logger.error('Erro ao inicializar browser:', error);
      throw error;
    }
  }

  async setupNetworkInterceptors() {
    // Interceptar requisições para capturar tokens
    this.page.on('request', (request) => {
      const headers = request.headers();
      if (headers['authorization']) {
        this.capturedToken = headers['authorization'].replace('Bearer ', '');
        this.logger.info('Token capturado via interceptação de rede');
      }
    });

    // Interceptar respostas para capturar tokens de resposta
    this.page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('token') || url.includes('auth')) {
        try {
          const json = await response.json();
          if (json.access_token) {
            this.capturedToken = json.access_token;
            this.logger.info('Token capturado da resposta:', url);
          }
        } catch (e) {
          // Ignorar respostas não-JSON
        }
      }
    });
  }

  async authenticate(username, password) {
    try {
      this.logger.info('Iniciando autenticação para usuário:', username);
      
      // Navegar para a página de login do PJe
      await this.page.goto(`${this.config.pjeUrl}/pje/login.seam`, {
        waitUntil: 'networkidle2',
        timeout: this.config.timeout
      });

      // Aguardar campos de login
      await this.page.waitForSelector('input[name="username"], input[id="username"]', {
        timeout: this.config.timeout
      });

      // Preencher credenciais
      await this.page.type('input[name="username"], input[id="username"]', username);
      await this.page.type('input[name="password"], input[id="password"]', password);

      // Submeter formulário
      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle2' }),
        this.page.click('button[type="submit"], input[type="submit"]')
      ]);

      // Verificar se login foi bem-sucedido
      const loginSuccess = await this.checkLoginSuccess();
      
      if (!loginSuccess) {
        throw new Error('Falha na autenticação - credenciais inválidas ou erro no sistema');
      }

      // Capturar token do localStorage ou sessionStorage
      const token = await this.extractToken();
      
      if (!token) {
        throw new Error('Token não encontrado após autenticação');
      }

      // Validar acesso ao Portal de Serviços
      const portalAccess = await this.validatePortalAccess(token);
      
      return {
        success: true,
        token: token,
        portalAccess: portalAccess,
        expiresIn: 3600, // 1 hora padrão
        tokenType: 'Bearer'
      };

    } catch (error) {
      this.logger.error('Erro durante autenticação:', error);
      throw error;
    }
  }

  async checkLoginSuccess() {
    try {
      // Verificar se foi redirecionado para página principal ou se existe elemento de usuário logado
      const url = this.page.url();
      const isLoggedIn = !url.includes('login') && 
                        (url.includes('home') || url.includes('painel') || url.includes('processo'));
      
      if (!isLoggedIn) {
        // Verificar por elementos que indicam login bem-sucedido
        const userElement = await this.page.$('span.usuario-logado, div.user-info, a[href*="logout"]');
        return !!userElement;
      }
      
      return isLoggedIn;
    } catch (error) {
      return false;
    }
  }

  async extractToken() {
    try {
      // Tentar múltiplas estratégias para obter o token
      
      // 1. Verificar localStorage
      const localStorageToken = await this.page.evaluate(() => {
        const keys = ['access_token', 'accessToken', 'token', 'auth_token'];
        for (const key of keys) {
          const value = localStorage.getItem(key);
          if (value) return value;
        }
        return null;
      });

      if (localStorageToken) {
        this.logger.info('Token encontrado no localStorage');
        return localStorageToken;
      }

      // 2. Verificar sessionStorage
      const sessionStorageToken = await this.page.evaluate(() => {
        const keys = ['access_token', 'accessToken', 'token', 'auth_token'];
        for (const key of keys) {
          const value = sessionStorage.getItem(key);
          if (value) return value;
        }
        return null;
      });

      if (sessionStorageToken) {
        this.logger.info('Token encontrado no sessionStorage');
        return sessionStorageToken;
      }

      // 3. Verificar cookies
      const cookies = await this.page.cookies();
      const tokenCookie = cookies.find(c => 
        c.name.toLowerCase().includes('token') || 
        c.name.toLowerCase().includes('auth')
      );

      if (tokenCookie) {
        this.logger.info('Token encontrado nos cookies');
        return tokenCookie.value;
      }

      // 4. Usar token capturado pela interceptação de rede
      if (this.capturedToken) {
        this.logger.info('Usando token capturado da rede');
        return this.capturedToken;
      }

      // 5. Tentar extrair do Keycloak se disponível
      const keycloakToken = await this.page.evaluate(() => {
        if (window.keycloak && window.keycloak.token) {
          return window.keycloak.token;
        }
        return null;
      });

      if (keycloakToken) {
        this.logger.info('Token encontrado no Keycloak');
        return keycloakToken;
      }

      return null;
    } catch (error) {
      this.logger.error('Erro ao extrair token:', error);
      return null;
    }
  }

  async validatePortalAccess(token) {
    try {
      // Navegar para o Portal de Serviços com o token
      await this.page.setExtraHTTPHeaders({
        'Authorization': `Bearer ${token}`
      });

      await this.page.goto(`${this.config.portalUrl}/consulta`, {
        waitUntil: 'networkidle2',
        timeout: this.config.timeout
      });

      // Verificar se o acesso foi autorizado
      const isAuthorized = await this.page.evaluate(() => {
        // Verificar se não foi redirecionado para login
        const url = window.location.href;
        return !url.includes('login') && !url.includes('unauthorized');
      });

      return isAuthorized;
    } catch (error) {
      this.logger.error('Erro ao validar acesso ao portal:', error);
      return false;
    }
  }

  async searchProcess(processNumber, token) {
    try {
      // Configurar headers com token
      await this.page.setExtraHTTPHeaders({
        'Authorization': `Bearer ${token}`
      });

      // Navegar para página de consulta
      await this.page.goto(`${this.config.portalUrl}/consulta`, {
        waitUntil: 'networkidle2'
      });

      // Aguardar campo de busca
      await this.page.waitForSelector('input[name="numeroProcesso"], input[id="numeroProcesso"]', {
        timeout: this.config.timeout
      });

      // Inserir número do processo
      await this.page.type('input[name="numeroProcesso"], input[id="numeroProcesso"]', processNumber);

      // Clicar no botão de busca
      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle2' }),
        this.page.click('button[type="submit"], button#btnBuscar')
      ]);

      // Aguardar resultados
      await this.page.waitForSelector('table.resultados, div.processo-info', {
        timeout: this.config.timeout
      });

      // Extrair dados do processo
      const processData = await this.page.evaluate(() => {
        // Implementar extração específica baseada na estrutura do portal
        const data = {
          numero: document.querySelector('.numero-processo')?.textContent,
          partes: Array.from(document.querySelectorAll('.parte')).map(el => el.textContent),
          movimentacoes: Array.from(document.querySelectorAll('.movimentacao')).map(el => ({
            data: el.querySelector('.data')?.textContent,
            descricao: el.querySelector('.descricao')?.textContent
          }))
        };
        return data;
      });

      return processData;
    } catch (error) {
      this.logger.error('Erro ao buscar processo:', error);
      throw error;
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.logger.info('Browser fechado');
    }
  }
}

module.exports = PDPJAuthService;
