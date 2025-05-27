
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
      timeout: parseInt(process.env.TIMEOUT) || 90000,
      headless: process.env.HEADLESS !== 'false'
    };
  }

  async initialize() {
    try {
      this.browser = await puppeteer.launch({
        headless: this.config.headless,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
        args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
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

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async authenticate(username, password) {
    try {
      this.logger.info('Iniciando autenticação para usuário:', username);
      
      // Navegar para a página de login do PJe
      this.logger.info('🌐 Navegando para:', `${this.config.pjeUrl}/pje/login.seam`);
      
      const response = await this.page.goto(`${this.config.pjeUrl}/pje/login.seam`, {
        waitUntil: 'networkidle2',
        timeout: this.config.timeout
      });

      // === DEBUG MELHORADO ===
      this.logger.info('=== INICIANDO DEBUG MELHORADO ===');
      
      // Status da resposta HTTP
      this.logger.info('🔥 Status HTTP:', response?.status() || 'N/A');
      
      // URL atual com valor
      const currentUrl = this.page.url();
      this.logger.info('🌐 URL atual:', currentUrl);

      // Aguardar página carregar
      await this.delay(5000);
      
      // Título da página com tratamento de erro
      try {
        const title = await this.page.title();
        this.logger.info('📄 Título da página:', title || 'TÍTULO VAZIO');
      } catch (e) {
        this.logger.error('❌ Erro ao obter título:', e.message);
      }
      
      // URL após delay
      const urlAfterDelay = this.page.url();
      this.logger.info('🔄 URL após delay:', urlAfterDelay);
      
      // Verificar se houve redirect
      if (currentUrl !== urlAfterDelay) {
        this.logger.info('🔀 REDIRECT DETECTADO!');
      }
      
      // Capturar HTML da página (primeiros 1000 chars)
      try {
        const htmlContent = await this.page.content();
        this.logger.info('📝 HTML (1000 chars):', htmlContent.substring(0, 1000));
      } catch (e) {
        this.logger.error('❌ Erro ao obter HTML:', e.message);
      }
      
      // Verificar se página carregou
      try {
        const bodyExists = await this.page.$('body');
        this.logger.info('🎯 Body existe:', !!bodyExists);
      } catch (e) {
        this.logger.error('❌ Erro ao verificar body:', e.message);
      }
      
      // Conteúdo visível da página
      try {
        const bodyText = await this.page.evaluate(() => {
          return document.body ? document.body.innerText.substring(0, 500) : 'BODY NÃO ENCONTRADO';
        });
        this.logger.info('📖 Texto visível (500 chars):', bodyText);
      } catch (e) {
        this.logger.error('❌ Erro ao obter texto:', e.message);
      }
      
      // Verificar inputs com mais detalhes
      try {
        const inputs = await this.page.$$eval('input', els => 
          els.map(el => ({
            name: el.name || 'N/A',
            id: el.id || 'N/A',
            type: el.type || 'N/A',
            placeholder: el.placeholder || 'N/A',
            class: el.className || 'N/A',
            value: el.value || 'N/A'
          }))
        );
        this.logger.info('🔍 Total de inputs:', inputs.length);
        this.logger.info('📋 Inputs detalhados:', JSON.stringify(inputs, null, 2));
      } catch (e) {
        this.logger.error('❌ Erro ao obter inputs:', e.message);
      }
      
      // Verificar todos os elementos form
      try {
        const forms = await this.page.$$eval('form', els => 
          els.map(el => ({
            action: el.action || 'N/A',
            method: el.method || 'N/A',
            id: el.id || 'N/A',
            class: el.className || 'N/A'
          }))
        );
        this.logger.info('📝 Total de forms:', forms.length);
        this.logger.info('📋 Forms encontrados:', JSON.stringify(forms, null, 2));
      } catch (e) {
        this.logger.error('❌ Erro ao obter forms:', e.message);
      }
      
      // Verificar frames
      const frames = await this.page.frames();
      this.logger.info('🖼️ Total de frames:', frames.length);
      
      if (frames.length > 1) {
        for (let i = 0; i < frames.length; i++) {
          try {
            const frameUrl = frames[i].url();
            this.logger.info(`🖼️ Frame ${i}:`, frameUrl);
          } catch (e) {
            this.logger.info(`🖼️ Frame ${i}: Erro ao obter URL`);
          }
        }
      }
      
      // Verificar se há mensagens de erro na página
      try {
        const errorMessages = await this.page.$$eval('.error, .alert-danger, .message-error', els => 
          els.map(el => el.textContent)
        );
        if (errorMessages.length > 0) {
          this.logger.info('⚠️ Mensagens de erro encontradas:', errorMessages);
        }
      } catch (e) {
        // Sem elementos de erro
      }
      
      // Tentar seletores alternativos
      const possibleSelectors = [
        'input[name="username"]',
        'input[id="username"]', 
        'input[name="login"]',
        'input[id="login"]',
        'input[name="user"]',
        'input[type="text"]',
        'input[placeholder*="usuário"]',
        'input[placeholder*="CPF"]',
        'input[name="j_username"]',
        'input[id="j_username"]'
      ];
      
      this.logger.info('🔍 Testando seletores...');
      for (const selector of possibleSelectors) {
        try {
          const found = await this.page.$(selector);
          this.logger.info(`✅ Seletor ${selector}:`, found ? 'ENCONTRADO' : 'NÃO ENCONTRADO');
        } catch (e) {
          this.logger.info(`❌ Seletor ${selector}: ERRO -`, e.message);
        }
      }
      
      // === FIM DEBUG MELHORADO ===
      
      throw new Error('🛑 DEBUG CONCLUÍDO - Parando execução para análise');

    } catch (error) {
      this.logger.error('Erro durante autenticação:', error);
      throw error;
    }
  }

  async checkLoginSuccess() {
    try {
      const url = this.page.url();
      const isLoggedIn = !url.includes('login') && 
                        (url.includes('home') || url.includes('painel') || url.includes('processo'));
      
      if (!isLoggedIn) {
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

      const cookies = await this.page.cookies();
      const tokenCookie = cookies.find(c => 
        c.name.toLowerCase().includes('token') || 
        c.name.toLowerCase().includes('auth')
      );

      if (tokenCookie) {
        this.logger.info('Token encontrado nos cookies');
        return tokenCookie.value;
      }

      if (this.capturedToken) {
        this.logger.info('Usando token capturado da rede');
        return this.capturedToken;
      }

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
      await this.page.setExtraHTTPHeaders({
        'Authorization': `Bearer ${token}`
      });

      await this.page.goto(`${this.config.portalUrl}/consulta`, {
        waitUntil: 'networkidle2',
        timeout: this.config.timeout
      });

      const isAuthorized = await this.page.evaluate(() => {
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
      await this.page.setExtraHTTPHeaders({
        'Authorization': `Bearer ${token}`
      });

      await this.page.goto(`${this.config.portalUrl}/consulta`, {
        waitUntil: 'networkidle2'
      });

      await this.page.waitForSelector('input[name="numeroProcesso"], input[id="numeroProcesso"]', {
        timeout: this.config.timeout
      });

      await this.page.type('input[name="numeroProcesso"], input[id="numeroProcesso"]', processNumber);

      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle2' }),
        this.page.click('button[type="submit"], button#btnBuscar')
      ]);

      await this.page.waitForSelector('table.resultados, div.processo-info', {
        timeout: this.config.timeout
      });

      const processData = await this.page.evaluate(() => {
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
