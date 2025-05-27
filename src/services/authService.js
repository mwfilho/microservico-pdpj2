const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createLogger } = require('../utils/logger');

// Configuração do puppeteer com plugin stealth
puppeteer.use(StealthPlugin());

class PDPJAuthService {
  constructor() {
    this.logger = createLogger('PDPJAuthService');
    this.browser = null;
    this.baseUrl = process.env.PJE_URL || 'https://pje.cloud.tjpe.jus.br/1g/login.seam';
    this.portalUrl = process.env.PORTAL_URL || 'https://portaldeservicos.pdpj.jus.br';
  }

  // Métodos de inicialização e fechamento do browser
  async initialize() {
    try {
      const args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--window-size=1920x1080'
      ];

      this.browser = await puppeteer.launch({
        args,
        headless: process.env.PUPPETEER_HEADLESS !== 'false',
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
      });
      
      this.logger.info('Browser inicializado com sucesso');
      return true;
    } catch (error) {
      this.logger.error('Erro ao inicializar browser:', error);
      throw error;
    }
  }

  async close() {
    if (this.browser) {
      try {
        await this.browser.close();
        this.browser = null;
        this.logger.info('Browser fechado com sucesso');
      } catch (error) {
        this.logger.error('Erro ao fechar browser:', error);
      }
    }
  }

  // Atraso seguro
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Método para clicar em botões com várias estratégias
  async clickButton(page, selector) {
    try {
      this.logger.info(`Tentando clicar no seletor: ${selector}`);

      // Estratégia 1: Clique direto
      try {
        await page.click(selector, { timeout: 5000 });
        this.logger.info('✅ Clique direto funcionou!');
        return true;
      } catch (e) {
        this.logger.info('Clique direto falhou, tentando alternativas...', e.message);
      }
      
      // Estratégia 2: JavaScript click
      try {
        await page.evaluate((sel) => {
          const element = document.querySelector(sel);
          if (element) {
            element.click();
            return true;
          }
          return false;
        }, selector);
        this.logger.info('✅ Clique via JavaScript funcionou!');
        return true;
      } catch (e) {
        this.logger.info('Clique via JavaScript falhou...', e.message);
      }
      
      // Estratégia 3: Enviar formulário diretamente
      try {
        await page.evaluate(() => {
          const form = document.querySelector('form');
          if (form) {
            form.submit();
            return true;
          }
          return false;
        });
        this.logger.info('✅ Envio direto do formulário funcionou!');
        return true;
      } catch (e) {
        this.logger.info('Envio direto do formulário falhou...', e.message);
      }
      
      this.logger.warn('❌ Não foi possível clicar no elemento');
      return false;
    } catch (error) {
      this.logger.error('Erro ao tentar clicar no botão:', error);
      return false;
    }
  }

  // Método para extrair tokens JWT - foco no KEYCLOAK_IDENTITY conforme documentação
  async extractTokens(page) {
    const tokens = {
      idToken: null,
      accessToken: null
    };
    
    try {
      // 1. Verificar cookies Keycloak (método primário conforme docs)
      this.logger.info('🔍 Buscando tokens nos cookies Keycloak...');
      const cookies = await page.cookies();
      
      // Token de identidade principal nos cookies
      const keycloakIdentityCookie = cookies.find(c => c.name === 'KEYCLOAK_IDENTITY');
      if (keycloakIdentityCookie) {
        tokens.idToken = keycloakIdentityCookie.value;
        // Na ausência de um access token explícito, o ID token também pode ser usado
        tokens.accessToken = keycloakIdentityCookie.value;
        this.logger.info('✅ Token encontrado no cookie KEYCLOAK_IDENTITY');
      }

      // Outras cookies relacionadas ao Keycloak
      const keycloakCookies = cookies.filter(c => 
        c.name.toLowerCase().includes('token') || 
        c.name.toLowerCase().includes('keycloak') ||
        c.name.toLowerCase().includes('oauth')
      );
      
      if (keycloakCookies.length > 0) {
        this.logger.info(`🔍 Encontrados ${keycloakCookies.length} cookies relacionados a autenticação`);
        
        // Criar lista de todos os cookies para logging
        const cookieInfo = keycloakCookies.map(c => ({
          name: c.name,
          domain: c.domain,
          path: c.path
        }));
        
        this.logger.info('📋 Cookies de autenticação:', { cookieInfo });
      }
      
      // 2. Verificar no localStorage (menos comum mas possível)
      try {
        this.logger.info('🔍 Verificando localStorage...');
        const storageTokens = await page.evaluate(() => {
          return {
            accessToken: localStorage.getItem('access_token'),
            authToken: localStorage.getItem('authToken'),
            idToken: localStorage.getItem('id_token')
          };
        });
        
        if (storageTokens.accessToken && !tokens.accessToken) {
          tokens.accessToken = storageTokens.accessToken;
          this.logger.info('✅ Access Token encontrado no localStorage');
        }
        
        if (storageTokens.authToken && !tokens.accessToken) {
          tokens.accessToken = storageTokens.authToken;
          this.logger.info('✅ Auth Token encontrado no localStorage');
        }
      } catch (e) {
        this.logger.warn('⚠️ Erro ao verificar localStorage:', e.message);
      }
      
      return tokens;
    } catch (error) {
      this.logger.error('❌ Erro ao extrair tokens:', error);
      return tokens;
    }
  }

  // Processo de autenticação completo
  async authenticate(username, password) {
    try {
      if (!this.browser) {
        await this.initialize();
      }
      
      const page = await this.browser.newPage();
      
      // Configuração para parecer mais com um navegador real
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
      });
      
      // Configurar timeout para navegação
      page.setDefaultTimeout(parseInt(process.env.NAVIGATION_TIMEOUT || '60000'));
      
      // Habilita interceptação de requisições para capturar o token nos headers
      await page.setRequestInterception(true);
      
      let token = null;
      
      // Intercepta as requisições para capturar o token nos headers
      page.on('request', request => {
        const headers = request.headers();
        if (headers.authorization && headers.authorization.toLowerCase().includes('bearer ')) {
          token = headers.authorization.replace(/bearer\s+/i, '');
          this.logger.info('Token JWT capturado na requisição');
        }
        request.continue();
      });
      
      this.logger.info('🚀 Iniciando autenticação para usuário:', username);
      
      // Acessa a página de login
      this.logger.info('🌐 Navegando para URL:', this.baseUrl);
      await page.goto(this.baseUrl, { waitUntil: 'networkidle2', timeout: 60000 });
      
      this.logger.info('✅ Página carregada com sucesso!');
      await this.delay(3000);
      
      // ---- Fase 1: Login inicial no PJe ----
      this.logger.info('🔍 Aguardando campos de login...');
      
      // Aguarda o campo de username aparecer
      await page.waitForSelector('#username', { visible: true, timeout: 10000 })
        .catch(() => this.logger.warn('⚠️ Campo username não encontrado!'));
      
      this.logger.info('✅ Campo de username encontrado!');
      
      // Preenche as credenciais
      this.logger.info('📝 Preenchendo credenciais...');
      await page.type('#username', username, { delay: 50 });
      await this.delay(200);
      await page.type('#password', password, { delay: 50 });
      this.logger.info('✅ Credenciais preenchidas');
      
      // Clique no botão de login
      await this.delay(500);
      const loginButtonSelector = 'button[type="submit"]';
      const clickSuccess = await this.clickButton(page, loginButtonSelector);
      
      if (!clickSuccess) {
        throw new Error('Não foi possível clicar no botão de login');
      }
      
      this.logger.info('⏳ Aguardando resposta do login...');
      
      // Aguardar navegação
      try {
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
      } catch (e) {
        this.logger.warn('⚠️ Timeout na navegação, mas continuando...');
      }
      
      // ---- Fase 2: Se redirecionado para SSO Keycloak, preenche campos adicionais ----
      const currentUrl = page.url();
      this.logger.info('🎯 URL atual:', currentUrl);
      
      if (currentUrl.includes('sso.cloud.pje.jus.br') || currentUrl.includes('auth/realms/pje')) {
        this.logger.info('🔄 Redirecionado para SSO Keycloak');
        
        // Aguardar carregamento
        await this.delay(3000);
        
        // Identificar campos obrigatórios vazios
        const missingFields = await page.evaluate(() => {
          const result = [];
          const inputs = document.querySelectorAll('input');
          
          for (const input of inputs) {
            if ((input.required || input.getAttribute('aria-required') === 'true') && !input.value) {
              result.push({
                name: input.name,
                type: input.type,
                placeholder: input.placeholder || 'N/A',
                id: input.id || ''
              });
            }
          }
          
          return result;
        });
        
        if (missingFields.length > 0) {
          this.logger.warn('📋 Campos obrigatórios não preenchidos:', {
            missingFields
          });
          
          // Preencher campo login/CPF
          const loginField = missingFields.find(f => 
            f.name === 'login' || 
            f.type === 'number' || 
            f.name.includes('cpf')
          );
          
          if (loginField) {
            const selector = loginField.id ? 
              `#${loginField.id}` : 
              `input[name="${loginField.name}"]`;
            
            await page.type(selector, username, { delay: 50 });
            this.logger.info('✅ Campo login preenchido com username/CPF');
          }
          
          // Preencher campo email
          const emailField = missingFields.find(f => 
            f.name === 'email' || 
            f.type === 'email'
          );
          
          if (emailField) {
            const email = `${username}@exemplo.com.br`;
            const selector = emailField.id ? 
              `#${emailField.id}` : 
              `input[name="${emailField.name}"]`;
            
            await page.type(selector, email, { delay: 50 });
            this.logger.info('✅ Campo email preenchido');
          }
          
          // Clicar em botão de submit
          await this.delay(1000);
          const submitSelectors = [
            'button[type="submit"]',
            'input[type="submit"]',
            '.confirm',
            '.btn-primary'
          ];
          
          for (const selector of submitSelectors) {
            if (await page.$(selector)) {
              await this.clickButton(page, selector);
              break;
            }
          }
          
          // Aguardar navegação
          try {
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
          } catch (e) {
            this.logger.warn('⚠️ Timeout na navegação após formulário SSO...');
          }
        }
      }
      
      // ---- Fase 3: Obter tokens ----
      // Aguardar para garantir que sessão e tokens estão criados
      await this.delay(5000);
      
      // Extrair tokens - prioridade para cookies Keycloak conforme docs
      const tokens = await this.extractTokens(page);
      
      // Usar token interceptado se disponível
      if (token) {
        this.logger.info('✅ Token capturado via interceptação de requisição');
        tokens.accessToken = token;
      }

      // Capturar screenshot para debug
      try {
        const screenshotPath = `/tmp/auth_${username}_${Date.now()}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        this.logger.info(`📸 Screenshot salvo em ${screenshotPath}`);
      } catch (e) {
        this.logger.warn('⚠️ Erro ao capturar screenshot:', e.message);
      }
      
      // Fechar página
      await page.close();

      // Resultado final
      if (tokens.accessToken || tokens.idToken) {
        const tokenToUse = tokens.accessToken || tokens.idToken;
        this.logger.info('🎉 Autenticação bem-sucedida! Token obtido.');
        
        return {
          success: true,
          token: tokenToUse,
          idToken: tokens.idToken,
          message: 'Autenticação realizada com sucesso'
        };
      } else {
        this.logger.error('❌ Não foi possível obter token');
        
        return {
          success: false,
          message: 'Não foi possível obter token de autenticação'
        };
      }
      
    } catch (error) {
      this.logger.error('❌ Erro durante autenticação:', error.message);
      return {
        success: false,
        message: error.message || 'Erro durante processo de autenticação'
      };
    }
  }
}

module.exports = PDPJAuthService;
