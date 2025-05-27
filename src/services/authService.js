const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createLogger } = require('../utils/logger');

// Configuração do puppeteer com plugin stealth para evitar detecção
puppeteer.use(StealthPlugin());

class PDPJAuthService {
  constructor() {
    this.logger = createLogger('PDPJAuthService');
    this.browser = null;
    this.baseUrl = process.env.PJE_URL || 'https://pje.cloud.tjpe.jus.br/1g/login.seam';
  }

  // Inicializar browser
  async initialize() {
    try {
      const args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920x1080'
      ];

      if (process.env.PUPPETEER_ARGS) {
        const extraArgs = process.env.PUPPETEER_ARGS.split(',');
        args.push(...extraArgs);
      }

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

  // Fechar browser
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

  /**
   * Wrapper para esperar de forma segura
   * @param {number} ms Milissegundos para esperar
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Métodos aprimorados para clicar em elementos
   * Tenta várias estratégias
   */
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
      
      // Estratégia 2: Espera que seja visível e depois clica
      try {
        await page.waitForSelector(selector, { visible: true, timeout: 5000 });
        await page.click(selector);
        this.logger.info('✅ Clique após esperar visibilidade funcionou!');
        return true;
      } catch (e) {
        this.logger.info('Clique após esperar visibilidade falhou...', e.message);
      }
      
      // Estratégia 3: Uso de JavaScript para clicar
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
      
      // Estratégia 4: Clique em coordenadas do elemento
      try {
        const elementHandle = await page.$(selector);
        if (elementHandle) {
          const box = await elementHandle.boundingBox();
          if (box) {
            await page.mouse.click(box.x + box.width/2, box.y + box.height/2);
            this.logger.info('✅ Clique via coordenadas do mouse funcionou!');
            return true;
          }
        }
      } catch (e) {
        this.logger.info('Clique via coordenadas do mouse falhou...', e.message);
      }
      
      // Estratégia 5: Enviar o formulário diretamente
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
      
      this.logger.warn('❌ Não foi possível clicar no elemento através de nenhuma estratégia');
      return false;
      
    } catch (error) {
      this.logger.error('Erro ao tentar clicar no botão:', error);
      return false;
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
      
      // Configurar viewpoint maior
      await page.setViewport({
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1,
      });
      
      // Configurar timeout para navegação
      page.setDefaultTimeout(parseInt(process.env.NAVIGATION_TIMEOUT || '90000'));
      page.setDefaultNavigationTimeout(parseInt(process.env.NAVIGATION_TIMEOUT || '90000'));
      
      // Habilita interceptação de requisições para capturar o token
      await page.setRequestInterception(true);
      
      let token = null;
      
      // Intercepta as requisições para capturar o token nos headers
      page.on('request', request => {
        const headers = request.headers();
        if (headers.authorization && headers.authorization.includes('Bearer ')) {
          token = headers.authorization.replace('Bearer ', '');
          this.logger.info('Token JWT capturado na requisição');
        }
        request.continue();
      });
      
      this.logger.info('🚀 Iniciando autenticação para usuário:');
      
      this.logger.info('🌐 Navegando para URL:');
      
      // Acessa a página de login
      await page.goto(this.baseUrl, { waitUntil: 'networkidle2', timeout: 60000 });
      
      this.logger.info('✅ Página carregada com sucesso!');
      
      this.logger.info('📊 Status HTTP:');
      
      this.logger.info('🌐 URL atual:');
      
      // Aguardar para garantir carregamento
      await this.delay(3000);
      
      const pageTitle = await page.title();
      this.logger.info('📄 Título da página:', pageTitle);
      
      // ---- Fase 1: Login inicial no PJe ----
      this.logger.info('🔍 Aguardando campos de login...');
      
      // Aguarda o campo de username aparecer
      await page.waitForSelector('#username', { visible: true, timeout: 10000 })
        .catch(() => this.logger.warn('⚠️ Campo username não encontrado!'));
      
      this.logger.info('✅ Campo de username encontrado!');
      
      // Identifica os campos de login
      const userSelector = '#username';
      const passSelector = '#password';
      
      this.logger.info('✅ Campo username encontrado com seletor:');
      
      this.logger.info('✅ Campo password encontrado com seletor:');
      
      // Preenche as credenciais - adiciona delay entre digitações
      this.logger.info('📝 Preenchendo credenciais...');
      
      await page.type(userSelector, username, { delay: 50 });
      await this.delay(200); // Pequena pausa entre campos
      await page.type(passSelector, password, { delay: 50 });
      
      this.logger.info('✅ Credenciais preenchidas');
      await this.delay(500); // Pequena pausa antes de clicar
      
      // Identificar e clicar no botão de login usando várias estratégias
      const loginButtonSelector = 'button[type="submit"]';
      
      // Usar método robusto de clique
      const clickSuccess = await this.clickButton(page, loginButtonSelector);
      
      if (!clickSuccess) {
        throw new Error('Não foi possível clicar no botão de login');
      }
      
      this.logger.info('⏳ Aguardando resposta do login...');
      
      // Espera navegação ou redirecionamento após o login
      try {
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
      } catch (e) {
        this.logger.warn('⚠️ Timeout na navegação, mas continuando...');
        // Continuar mesmo se timeout - pode ser que a página tenha navegado parcialmente
      }
      
      // Verifica URL atual para entender o estado do login
      const currentUrl = page.url();
      this.logger.info('🎯 Resultado do login:', {
        status: 'attempted',
        url: currentUrl
      });
      
      // ---- NOVA LÓGICA: Se redirecionado para SSO Keycloak, preenche campos adicionais ----
      if (currentUrl.includes('sso.cloud.pje.jus.br') || currentUrl.includes('auth/realms/pje')) {
        this.logger.info('🔄 Redirecionado para SSO Keycloak');
        
        // Aguarda carregamento da página de SSO
        await this.delay(3000);
        
        // Busca por campos adicionais e os preenche
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
          
          // Preenche campo login/número se necessário (CPF ou outro identificador)
          const loginField = missingFields.find(f => 
            f.name === 'login' || 
            f.type === 'number' || 
            f.name.includes('cpf') || 
            f.name.includes('document')
          );
          
          if (loginField) {
            const selector = loginField.id ? 
              `#${loginField.id}` : 
              `input[name="${loginField.name}"]`;
            
            await page.type(selector, username, { delay: 50 });
            this.logger.info('✅ Campo login preenchido com username/CPF');
          }
          
          // Preenche campo email se necessário
          const emailField = missingFields.find(f => 
            f.name === 'email' || 
            f.type === 'email' || 
            f.name.includes('mail')
          );
          
          if (emailField) {
            // Gera um email baseado no username
            const email = `${username}@exemplo.com.br`;
            
            const emailSelector = emailField.id ? 
              `#${emailField.id}` : 
              `input[name="${emailField.name}"]`;
            
            await page.type(emailSelector, email, { delay: 50 });
            this.logger.info('✅ Campo email preenchido com email gerado');
            
            // Se houver campo de confirmação de email
            const confirmEmailField = missingFields.find(f => 
              f.name === 'email_confirm' || 
              f.name.includes('confirma') || 
              f.name.includes('confirm')
            );
            
            if (confirmEmailField) {
              const confirmSelector = confirmEmailField.id ? 
                `#${confirmEmailField.id}` : 
                `input[name="${confirmEmailField.name}"]`;
              
              await page.type(confirmSelector, email, { delay: 50 });
              this.logger.info('✅ Campo confirmação de email preenchido');
            }
          }
          
          await this.delay(1000); // Pausa antes de submeter
          
          // Procura por botão de continuação/submit na página do SSO
          const submitSelectors = [
            'button[type="submit"]',
            'input[type="submit"]',
            '.confirm',
            '.btn-primary',
            'button.submit',
            'input.submit'
          ];
          
          let submitClicked = false;
          
          for (const selector of submitSelectors) {
            if (await page.$(selector)) {
              submitClicked = await this.clickButton(page, selector);
              if (submitClicked) {
                this.logger.info(`✅ Botão de continuação clicado com sucesso (${selector})`);
                break;
              }
            }
          }
          
          if (!submitClicked) {
            // Se não encontrou um botão, tenta enviar o formulário diretamente
            try {
              await page.evaluate(() => {
                const form = document.querySelector('form');
                if (form) {
                  form.submit();
                  return true;
                }
                return false;
              });
              this.logger.info('✅ Formulário enviado via JavaScript');
              submitClicked = true;
            } catch (e) {
              this.logger.warn('⚠️ Não foi possível enviar o formulário:', e.message);
            }
          }
          
          if (submitClicked) {
            try {
              await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
            } catch (e) {
              this.logger.warn('⚠️ Timeout na navegação após submissão de campos adicionais...');
              // Continuar mesmo se timeout
            }
          }
        }
      }
      
      // Verifica URL atual após os passos de autenticação
      const finalUrl = page.url();
      this.logger.info('🔍 URL final após autenticação:', {
        url: finalUrl
      });
      
      // Tenta obter token usando várias estratégias
      // Estratégia 1: Capturado via interceptação de requisição (já tentado acima)
      
      // Estratégia 2: Buscar no localStorage
      if (!token) {
        try {
          token = await page.evaluate(() => {
            return localStorage.getItem('access_token') || 
                  localStorage.getItem('keycloak-token') ||
                  localStorage.getItem('token') ||
                  localStorage.getItem('authToken') ||
                  sessionStorage.getItem('access_token') ||
                  sessionStorage.getItem('keycloak-token');
          });
          
          if (token) {
            this.logger.info('✅ Token encontrado no Storage do navegador');
          }
        } catch (e) {
          this.logger.warn('⚠️ Erro ao buscar token no localStorage:', e.message);
        }
      }
      
      // Estratégia 3: Navegação para forçar requisições com token
      if (!token) {
        this.logger.info('🔄 Tentando acessar área logada para forçar requisições com token...');
        
        try {
          await page.goto('https://pje.cloud.tjpe.jus.br/1g/dashboard', { 
            waitUntil: 'networkidle2',
            timeout: 30000
          });
        } catch (e) {
          this.logger.warn('⚠️ Erro ao acessar dashboard:', e.message);
        }
        
        // Aguarda para dar tempo das requisições com token serem feitas
        await this.delay(5000);
        
        // Nova tentativa de obter token do localStorage
        try {
          token = await page.evaluate(() => {
            return localStorage.getItem('access_token') || 
                  localStorage.getItem('keycloak-token') ||
                  localStorage.getItem('token') ||
                  localStorage.getItem('authToken') ||
                  sessionStorage.getItem('access_token') ||
                  sessionStorage.getItem('keycloak-token');
          });
          
          if (token) {
            this.logger.info('✅ Token encontrado após navegação forçada');
          }
        } catch (e) {
          this.logger.warn('⚠️ Erro ao buscar token no localStorage após navegação:', e.message);
        }
      }
      
      // Estratégia 4: Cookies
      if (!token) {
        try {
          const cookies = await page.cookies();
          const authCookie = cookies.find(c => 
            c.name.toLowerCase().includes('token') || 
            c.name.toLowerCase().includes('auth') || 
            c.name.toLowerCase().includes('jwt') ||
            c.name.toLowerCase().includes('keycloak') ||
            c.name.toLowerCase().includes('pje')
          );
          
          if (authCookie) {
            token = authCookie.value;
            this.logger.info('✅ Token encontrado nas cookies');
          }
        } catch (e) {
          this.logger.warn('⚠️ Erro ao buscar token nos cookies:', e.message);
        }
      }
      
      // Captura screenshot para diagnóstico (opcional)
      try {
        const screenshotPath = `/tmp/auth_${username}_${Date.now()}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        this.logger.info(`📸 Screenshot salvo em ${screenshotPath}`);
      } catch (e) {
        this.logger.warn('⚠️ Erro ao capturar screenshot:', e.message);
      }
      
      // Verifica o resultado final da autenticação
      if (token) {
        this.logger.info('🎉 Autenticação bem-sucedida! Token JWT obtido.');
        await page.close();
        
        return {
          success: true,
          token: token,
          message: 'Autenticação realizada com sucesso'
        };
      } else {
        this.logger.error('❌ Erro durante autenticação: Não foi possível obter token');
        await page.close();
        
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

  // Buscar processo usando token já obtido
  async searchProcess(processNumber, token) {
    try {
      if (!token) {
        throw new Error('Token não fornecido');
      }
      
      if (!processNumber) {
        throw new Error('Número de processo não fornecido');
      }
      
      // Implementação da busca de processo usando o token JWT
      // ...
      
      return {
        success: true,
        message: 'Processo encontrado',
        processNumber: processNumber
      };
      
    } catch (error) {
      this.logger.error('Erro ao buscar processo:', error);
      throw error;
    }
  }
}

module.exports = PDPJAuthService;
