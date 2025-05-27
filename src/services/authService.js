
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
      this.logger.info('🚀 Iniciando autenticação para usuário:', username);
      
      // ✅ USAR URL CORRETA!
      const loginUrl = `${this.config.pjeUrl}/1g/login.seam`;
      this.logger.info('🌐 Navegando para URL CORRETA:', loginUrl);
      
      const response = await this.page.goto(loginUrl, {
        waitUntil: 'networkidle2',
        timeout: this.config.timeout
      });

      this.logger.info('✅ Página carregada com sucesso!');
      this.logger.info('📊 Status HTTP:', response?.status());
      this.logger.info('🌐 URL atual:', this.page.url());

      // Aguardar página carregar completamente
      await this.delay(3000);
      
      // Verificar título da página
      const title = await this.page.title();
      this.logger.info('📄 Título da página:', title);

      // Aguardar por campos de login
      this.logger.info('🔍 Aguardando campos de login...');
      
      try {
        await this.page.waitForSelector('input[name="j_username"], input[id="j_username"], input[name="username"]', {
          timeout: 30000
        });
        this.logger.info('✅ Campo de username encontrado!');
      } catch (error) {
        this.logger.error('❌ Timeout aguardando campo de username');
        
        // Debug: listar todos os inputs
        const inputs = await this.page.$$eval('input', els => 
          els.map(el => ({
            name: el.name || 'N/A',
            id: el.id || 'N/A',
            type: el.type || 'N/A',
            placeholder: el.placeholder || 'N/A'
          }))
        );
        this.logger.info('🔍 Inputs encontrados:', inputs);
        
        throw new Error('Campo de username não encontrado após timeout');
      }

      // Tentar diferentes seletores para username
      const usernameSelectors = [
        'input[name="j_username"]',
        'input[id="j_username"]', 
        'input[name="username"]',
        'input[id="username"]',
        'input[type="text"]'
      ];

      let usernameInput = null;
      for (const selector of usernameSelectors) {
        try {
          usernameInput = await this.page.$(selector);
          if (usernameInput) {
            this.logger.info('✅ Campo username encontrado com seletor:', selector);
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (!usernameInput) {
        throw new Error('Nenhum campo de username encontrado na página');
      }

      // Tentar diferentes seletores para password
      const passwordSelectors = [
        'input[name="j_password"]',
        'input[id="j_password"]',
        'input[name="password"]',
        'input[id="password"]',
        'input[type="password"]'
      ];

      let passwordInput = null;
      for (const selector of passwordSelectors) {
        try {
          passwordInput = await this.page.$(selector);
          if (passwordInput) {
            this.logger.info('✅ Campo password encontrado com seletor:', selector);
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (!passwordInput) {
        throw new Error('Nenhum campo de password encontrado na página');
      }

      // Preencher credenciais
      this.logger.info('📝 Preenchendo credenciais...');
      
      await usernameInput.click({ clickCount: 3 }); // Selecionar tudo
      await this.page.keyboard.type(username);
      await this.delay(500);

      await passwordInput.click({ clickCount: 3 }); // Selecionar tudo  
      await this.page.keyboard.type(password);
      await this.delay(500);

      this.logger.info('✅ Credenciais preenchidas');

      // Procurar botão de login
      const loginButtonSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:contains("Entrar")',
        'button:contains("Login")',
        'input[value*="Entrar"]',
        'input[value*="Login"]'
      ];

      let loginButton = null;
      for (const selector of loginButtonSelectors) {
        try {
          loginButton = await this.page.$(selector);
          if (loginButton) {
            this.logger.info('✅ Botão login encontrado com seletor:', selector);
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (!loginButton) {
        // Tentar submit do form
        this.logger.info('🔍 Tentando submit do formulário...');
        await this.page.keyboard.press('Enter');
      } else {
        this.logger.info('🔘 Clicando no botão de login...');
        await loginButton.click();
      }

      // Aguardar navegação ou resposta
      this.logger.info('⏳ Aguardando resposta do login...');
      
      try {
        await Promise.race([
          this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
          this.page.waitForSelector('.error, .alert-danger, .message-error', { timeout: 5000 })
        ]);
      } catch (e) {
        // Timeout é normal, continuar
      }

      await this.delay(3000);

      // Verificar se login foi bem-sucedido
      const currentUrl = this.page.url();
      this.logger.info('🌐 URL após login:', currentUrl);

      const isLoginSuccessful = await this.checkLoginSuccess();
      
      if (!isLoginSuccessful) {
        // Verificar se há mensagens de erro
        const errorMessages = await this.page.$$eval('.error, .alert-danger, .message-error', els => 
          els.map(el => el.textContent.trim()).filter(text => text.length > 0)
        );
        
        if (errorMessages.length > 0) {
          this.logger.error('❌ Erro de login:', errorMessages);
          throw new Error(`Falha no login: ${errorMessages.join(', ')}`);
        }
        
        throw new Error('Login não foi bem-sucedido - ainda na página de login');
      }

      this.logger.info('✅ Login bem-sucedido!');

      // Tentar extrair token
      const token = await this.extractToken();
      
      if (!token) {
        this.logger.warn('⚠️ Token não encontrado, mas login foi bem-sucedido');
        // Retornar um token mock ou identificador de sessão
        return {
          success: true,
          token: 'session_authenticated',
          message: 'Login bem-sucedido sem token específico'
        };
      }

      this.logger.info('🎯 Token extraído com sucesso');
      
      return {
        success: true,
        token: token,
        message: 'Autenticação realizada com sucesso'
      };

    } catch (error) {
      this.logger.error('❌ Erro durante autenticação:', error.message);
      throw error;
    }
  }

  async checkLoginSuccess() {
    try {
      const url = this.page.url();
      
      // Verificar se não está mais na página de login
      const isNotLoginPage = !url.includes('login.seam');
      
      if (isNotLoginPage) {
        this.logger.info('✅ Não está mais na página de login');
        return true;
      }
      
      // Verificar elementos que indicam login bem-sucedido
      const successIndicators = [
        'span.usuario-logado',
        'div.user-info', 
        'a[href*="logout"]',
        '.menu-principal',
        '.painel-usuario'
      ];
      
      for (const selector of successIndicators) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            this.logger.info('✅ Indicador de sucesso encontrado:', selector);
            return true;
          }
        } catch (e) {
          continue;
        }
      }
      
      return false;
    } catch (error) {
      this.logger.error('Erro ao verificar sucesso do login:', error);
      return false;
    }
  }

  async extractToken() {
    try {
      // Verificar localStorage
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

      // Verificar sessionStorage
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

      // Verificar cookies
      const cookies = await this.page.cookies();
      const tokenCookie = cookies.find(c => 
        c.name.toLowerCase().includes('token') || 
        c.name.toLowerCase().includes('auth') ||
        c.name.toLowerCase().includes('session')
      );

      if (tokenCookie) {
        this.logger.info('Token encontrado nos cookies:', tokenCookie.name);
        return tokenCookie.value;
      }

      // Token capturado via interceptação
      if (this.capturedToken) {
        this.logger.info('Usando token capturado da rede');
        return this.capturedToken;
      }

      // Verificar Keycloak
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

      this.logger.info('Nenhum token específico encontrado');
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
