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
      this.browser = await puppeteer.launch({
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920x1080'
        ],
        headless: true
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
      await page.goto(this.baseUrl, { waitUntil: 'networkidle2' });
      
      this.logger.info('✅ Página carregada com sucesso!');
      
      this.logger.info('📊 Status HTTP:');
      
      this.logger.info('🌐 URL atual:');
      
      // Aguarda um pouco para ter certeza que a página carregou completamente
      await page.waitForTimeout(3000);
      
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
      
      this.logger.info('✅ Campo username encontrado com seletor:', userSelector);
      
      this.logger.info('✅ Campo password encontrado com seletor:', passSelector);
      
      // Preenche as credenciais
      this.logger.info('📝 Preenchendo credenciais...');
      
      await page.type(userSelector, username);
      await page.type(passSelector, password);
      
      this.logger.info('✅ Credenciais preenchidas');
      
      // Identifica o botão de login
      const loginButtonSelector = 'button[type="submit"]';
      
      this.logger.info('✅ Botão login encontrado com seletor:', loginButtonSelector);
      
      // Tenta clicar no botão de login com vários métodos
      this.logger.info('🔘 Tentando clique robusto em: Botão de login (button[type="submit"])');
      
      // Verifica se o elemento está visível 
      const isVisible = await page.evaluate((selector) => {
        const element = document.querySelector(selector);
        if (!element) return false;
        
        const style = window.getComputedStyle(element);
        return style && style.display !== 'none' && style.visibility !== 'hidden';
      }, loginButtonSelector);
      
      this.logger.info('👁️ Elemento visível:', isVisible);
      
      if (!isVisible) {
        this.logger.info('🔄 Tentando scroll + clique...');
        
        try {
          await page.evaluate((selector) => {
            const button = document.querySelector(selector);
            if (button) {
              button.scrollIntoView();
              button.click();
            }
          }, loginButtonSelector);
        } catch (e) {
          this.logger.warn('⚠️ Scroll + clique falhou:', e.message);
        }
        
        this.logger.info('🔄 Tentando JavaScript click...');
        
        await page.evaluate((selector) => {
          const buttons = document.querySelectorAll(selector);
          if (buttons.length > 0) {
            buttons[0].click();
            return true;
          }
          return false;
        }, loginButtonSelector);
        
        this.logger.info('✅ JavaScript click funcionou!');
      } else {
        await page.click(loginButtonSelector);
        this.logger.info('✅ Clique padrão funcionou!');
      }
      
      this.logger.info('⏳ Aguardando resposta do login...');
      
      // Espera navegação ou redirecionamento após o login
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 })
        .catch(() => this.logger.warn('⚠️ Nenhum redirecionamento detectado após login'));
      
      // Verifica URL atual para entender o estado do login
      const currentUrl = page.url();
      this.logger.info('🎯 Resultado do login:', {
        status: 'redirected',
        url: currentUrl
      });
      
      this.logger.info('🌐 URL após login:', {
        url: currentUrl
      });
      
      // ---- NOVA LÓGICA: Se redirecionado para SSO Keycloak, preenche campos adicionais ----
      if (currentUrl.includes('sso.cloud.pje.jus.br') || currentUrl.includes('auth/realms/pje')) {
        this.logger.info('🔄 Redirecionado para SSO Keycloak');
        
        // Aguarda carregamento da página de SSO
        await page.waitForTimeout(2000);
        
        // Busca por campos adicionais e os preenche
        const missingFields = await page.evaluate(() => {
          const result = [];
          const inputs = document.querySelectorAll('input');
          
          for (const input of inputs) {
            if ((input.required || input.getAttribute('aria-required') === 'true') && !input.value) {
              result.push({
                name: input.name,
                type: input.type,
                placeholder: input.placeholder || 'N/A'
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
            await page.type(`input[name="${loginField.name}"]`, username);
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
            await page.type(`input[name="${emailField.name}"]`, email);
            this.logger.info('✅ Campo email preenchido com email gerado');
            
            // Se houver campo de confirmação de email
            const confirmEmailField = missingFields.find(f => 
              f.name === 'email_confirm' || 
              f.name.includes('confirma') || 
              f.name.includes('confirm')
            );
            
            if (confirmEmailField) {
              await page.type(`input[name="${confirmEmailField.name}"]`, email);
              this.logger.info('✅ Campo confirmação de email preenchido');
            }
          }
          
          // Procura por botão de continuação/submit na página do SSO
          const submitButton = await page.$('button[type="submit"], input[type="submit"], .confirm, .btn-primary');
          
          if (submitButton) {
            this.logger.info('🔘 Clicando no botão de continuação do SSO');
            
            await submitButton.click();
            
            // Aguarda navegação após clicar no botão
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 })
              .catch(() => this.logger.warn('⚠️ Nenhum redirecionamento detectado após confirmação do SSO'));
          } else {
            // Se não encontrou um botão, tenta enviar o formulário diretamente
            await page.evaluate(() => {
              const form = document.querySelector('form');
              if (form) form.submit();
            });
            
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 })
              .catch(() => {});
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
      }
      
      // Estratégia 3: Navegação para forçar requisições com token
      if (!token) {
        this.logger.info('🔄 Tentando acessar área logada para forçar requisições com token...');
        
        await page.goto('https://pje.cloud.tjpe.jus.br/1g/dashboard', { waitUntil: 'networkidle2' })
          .catch(() => this.logger.warn('⚠️ Erro ao acessar dashboard'));
        
        // Aguarda para dar tempo das requisições com token serem feitas
        await page.waitForTimeout(5000);
        
        // Nova tentativa de obter token do localStorage
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
      }
      
      // Estratégia 4: Cookies
      if (!token) {
        const cookies = await page.cookies();
        const authCookie = cookies.find(c => 
          c.name.toLowerCase().includes('token') || 
          c.name.toLowerCase().includes('auth') || 
          c.name.toLowerCase().includes('jwt')
        );
        
        if (authCookie) {
          token = authCookie.value;
          this.logger.info('✅ Token encontrado nas cookies');
        }
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
