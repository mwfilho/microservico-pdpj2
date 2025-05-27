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

  // Função segura para executar operações na página
  async safeEvaluate(func, defaultValue = null, description = '') {
    try {
      const result = await this.page.evaluate(func);
      this.logger.info(`✅ ${description} executado com sucesso:`, result);
      return result;
    } catch (error) {
      this.logger.error(`❌ Erro em ${description}:`, error.message);
      return defaultValue;
    }
  }

  // Função segura para obter propriedades da página
  async safePageProperty(property, description = '') {
    try {
      let result;
      switch (property) {
        case 'url':
          result = this.page.url();
          break;
        case 'title':
          result = await this.page.title();
          break;
        case 'content':
          result = await this.page.content();
          break;
        default:
          result = 'Propriedade não reconhecida';
      }
      this.logger.info(`✅ ${description} obtido:`, result || 'VAZIO');
      return result;
    } catch (error) {
      this.logger.error(`❌ Erro ao obter ${description}:`, error.message);
      return null;
    }
  }

  async authenticate(username, password) {
    try {
      this.logger.info('🚀 === ULTRA DEBUG INICIADO ===');
      this.logger.info('📅 Timestamp:', new Date().toISOString());
      this.logger.info('👤 Usuário:', username);
      this.logger.info('🔧 Configuração:', JSON.stringify(this.config, null, 2));
      
      // PASSO 1: Verificar se página existe
      this.logger.info('🔍 PASSO 1: Verificando página...');
      try {
        const pageExists = !!this.page;
        this.logger.info('📄 Página existe:', pageExists);
        
        if (!pageExists) {
          throw new Error('Página não foi criada corretamente');
        }
      } catch (error) {
        this.logger.error('❌ Erro no PASSO 1:', error.message);
        throw error;
      }
      
      // PASSO 2: Tentar navegação com timeout mais baixo
      const targetUrl = `${this.config.pjeUrl}/pje/login.seam`;
      this.logger.info('🌐 PASSO 2: Navegando para:', targetUrl);
      
      let response = null;
      try {
        this.logger.info('⏳ Iniciando navegação...');
        
        response = await this.page.goto(targetUrl, {
          waitUntil: 'networkidle2',
          timeout: 30000 // Timeout reduzido para 30s
        });
        
        this.logger.info('✅ Navegação concluída!');
        
      } catch (error) {
        this.logger.error('❌ Erro na navegação:', error.message);
        this.logger.error('🔍 Tipo do erro:', error.name);
        this.logger.error('📋 Stack:', error.stack);
        
        // Tentar navegação alternativa
        this.logger.info('🔄 Tentando navegação alternativa...');
        try {
          response = await this.page.goto(targetUrl, {
            waitUntil: 'load',
            timeout: 20000
          });
          this.logger.info('✅ Navegação alternativa funcionou!');
        } catch (altError) {
          this.logger.error('❌ Navegação alternativa também falhou:', altError.message);
        }
      }
      
      // PASSO 3: Verificar resposta HTTP
      this.logger.info('🔍 PASSO 3: Verificando resposta HTTP...');
      if (response) {
        try {
          const status = response.status();
          const statusText = response.statusText();
          const headers = response.headers();
          
          this.logger.info('📊 Status HTTP:', status);
          this.logger.info('📝 Status Text:', statusText);
          this.logger.info('📋 Headers importantes:', {
            'content-type': headers['content-type'],
            'location': headers['location'],
            'set-cookie': headers['set-cookie']
          });
          
        } catch (error) {
          this.logger.error('❌ Erro ao verificar resposta:', error.message);
        }
      } else {
        this.logger.error('❌ Resposta é nula!');
      }
      
      // PASSO 4: Aguardar e verificar URL atual
      this.logger.info('🔍 PASSO 4: Verificando estado da página...');
      await this.delay(3000);
      
      const currentUrl = await this.safePageProperty('url', 'URL atual');
      
      if (currentUrl && currentUrl !== targetUrl) {
        this.logger.info('🔀 REDIRECT detectado!');
        this.logger.info('🎯 URL original:', targetUrl);
        this.logger.info('🎯 URL atual:', currentUrl);
      }
      
      // PASSO 5: Verificar título
      this.logger.info('🔍 PASSO 5: Verificando título...');
      const title = await this.safePageProperty('title', 'Título da página');
      
      // PASSO 6: Verificar conteúdo HTML
      this.logger.info('🔍 PASSO 6: Verificando HTML...');
      const htmlContent = await this.safePageProperty('content', 'Conteúdo HTML');
      
      if (htmlContent) {
        const htmlLength = htmlContent.length;
        this.logger.info('📏 Tamanho do HTML:', htmlLength, 'caracteres');
        
        if (htmlLength > 0) {
          this.logger.info('📝 HTML (primeiros 1000 chars):', htmlContent.substring(0, 1000));
          
          // Verificar se contém elementos de login
          const hasLogin = htmlContent.toLowerCase().includes('login') || 
                          htmlContent.toLowerCase().includes('usuario') ||
                          htmlContent.toLowerCase().includes('senha');
          this.logger.info('🔐 Contém elementos de login:', hasLogin);
          
        } else {
          this.logger.error('❌ HTML está vazio!');
        }
      } else {
        this.logger.error('❌ Não foi possível obter HTML!');
      }
      
      // PASSO 7: Verificar DOM
      this.logger.info('🔍 PASSO 7: Verificando DOM...');
      
      const domInfo = await this.safeEvaluate(() => {
        return {
          hasBody: !!document.body,
          bodyChildren: document.body ? document.body.children.length : 0,
          docReadyState: document.readyState,
          docTitle: document.title,
          url: window.location.href
        };
      }, {}, 'Informações do DOM');
      
      // PASSO 8: Contar elementos
      this.logger.info('🔍 PASSO 8: Contando elementos...');
      
      const elementCounts = await this.safeEvaluate(() => {
        return {
          inputs: document.querySelectorAll('input').length,
          buttons: document.querySelectorAll('button').length,
          forms: document.querySelectorAll('form').length,
          links: document.querySelectorAll('a').length,
          divs: document.querySelectorAll('div').length,
          scripts: document.querySelectorAll('script').length,
          allElements: document.querySelectorAll('*').length
        };
      }, {}, 'Contagem de elementos');
      
      // PASSO 9: Verificar console errors
      this.logger.info('🔍 PASSO 9: Verificando erros do console...');
      
      // Configurar listener para erros do console
      this.page.on('console', (msg) => {
        if (msg.type() === 'error') {
          this.logger.error('🚨 Console Error:', msg.text());
        }
      });
      
      this.page.on('pageerror', (error) => {
        this.logger.error('🚨 Page Error:', error.message);
      });
      
      // PASSO 10: Verificar network failures
      this.logger.info('🔍 PASSO 10: Configurando monitoramento de rede...');
      
      this.page.on('requestfailed', (request) => {
        this.logger.error('🌐 Request Failed:', {
          url: request.url(),
          method: request.method(),
          failure: request.failure()?.errorText
        });
      });
      
      this.page.on('response', (response) => {
        if (response.status() >= 400) {
          this.logger.error('🚨 HTTP Error Response:', {
            url: response.url(),
            status: response.status(),
            statusText: response.statusText()
          });
        }
      });
      
      this.logger.info('🏁 === ULTRA DEBUG CONCLUÍDO ===');
      
      // Parar aqui para análise completa
      throw new Error('🛑 ULTRA DEBUG CONCLUÍDO - Análise completa dos logs necessária');

    } catch (error) {
      this.logger.error('💥 Erro durante ultra debug:', error);
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
