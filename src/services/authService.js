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
    this.portalUrl = process.env.PORTAL_URL || 'https://portaldeservicos.pdpj.jus.br';
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

  // Atraso seguro
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Método para obter cookies de autenticação
  async getAuthCookies(page) {
    try {
      const cookies = await page.cookies();
      
      // Procurar cookies relacionados à autenticação
      const authCookies = cookies.filter(c => 
        c.name.includes('KEYCLOAK') || 
        c.name === 'JSESSIONID' ||
        c.name.includes('AUTH_SESSION') ||
        c.name.includes('KC_')
      );
      
      return authCookies;
    } catch (error) {
      this.logger.error('Erro ao obter cookies de autenticação:', error);
      return [];
    }
  }

  // Método para clicar de forma robusta
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
      
      // Estratégia 2: Uso de JavaScript para clicar
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
      
      // Estratégia 3: Enviar o formulário diretamente
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
      
      // Configurar viewport maior
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
      
      // Aguardar para garantir carregamento
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
      await this.delay(500);
      
      // Clique no botão de login
      const loginButtonSelector = 'button[type="submit"]';
      const clickSuccess = await this.clickButton(page, loginButtonSelector);
      
      if (!clickSuccess) {
        throw new Error('Não foi possível clicar no botão de login');
      }
      
      this.logger.info('⏳ Aguardando resposta do login...');
      
      // ---- Fase 2: Aguardar redirecionamento e capturar código de autorização ----
      try {
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
        
        // Verificar se estamos na URL de redirecionamento com o código
        let currentUrl = page.url();
        this.logger.info('🔍 URL após o login:', { url: currentUrl });
        
        // Verificar se fomos redirecionados para o SSO
        if (currentUrl.includes('sso.cloud.pje.jus.br') || currentUrl.includes('auth/realms/pje')) {
          this.logger.info('🔄 Redirecionado para SSO Keycloak');
          
          // Aguardar carregamento da página de SSO
          await this.delay(3000);
          
          // Buscar por campos adicionais e preenchê-los
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
            
            // Clicar no botão de submit
            await this.delay(1000);
            const submitSelectors = [
              'button[type="submit"]',
              'input[type="submit"]',
              '.confirm',
              '.btn-primary'
            ];
            
            let submitClicked = false;
            for (const selector of submitSelectors) {
              if (await page.$(selector)) {
                submitClicked = await this.clickButton(page, selector);
                if (submitClicked) {
                  this.logger.info(`✅ Botão de continuação clicado (${selector})`);
                  break;
                }
              }
            }
            
            // Aguardar navegação após submissão do formulário SSO
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 })
              .catch(() => this.logger.warn('⚠️ Timeout na navegação após formulário SSO...'));
          }
        }
        
        // Atualizar URL atual após possíveis redirecionamentos
        currentUrl = page.url();
        this.logger.info('🔍 URL atual:', { url: currentUrl });
        
        // Extrair o código de autorização da URL
        let authCode = null;
        if (currentUrl.includes('code=')) {
          const codeMatch = currentUrl.match(/code=([^&]+)/);
          if (codeMatch && codeMatch[1]) {
            authCode = codeMatch[1];
            this.logger.info('✅ Código de autorização encontrado na URL:', authCode);
            
            // Navegar para a página principal do PJe para processar o código
            this.logger.info('🌐 Navegando para página principal do PJe...');
            await page.goto('https://pje.cloud.tjpe.jus.br/1g/home.seam', {
              waitUntil: 'networkidle2',
              timeout: 30000
            });
            
            // Aguardar processamento do login
            await this.delay(5000);
            
            // Obter cookies de autenticação
            const authCookies = await this.getAuthCookies(page);
            
            if (authCookies.length > 0) {
              this.logger.info(`🍪 Encontrados ${authCookies.length} cookies de autenticação`);
              
              // Usar o primeiro cookie Keycloak como token
              const keycloakCookie = authCookies.find(c => c.name === 'KEYCLOAK_IDENTITY') || authCookies[0];
              
              // Fechar página
              await page.close();
              
              // Retornar token e sucesso
              return {
                success: true,
                token: keycloakCookie.value,
                tokenType: 'Bearer',
                message: 'Autenticação realizada com sucesso via código de autorização',
                authCode: authCode
              };
            }
          }
        }
        
        // Se chegamos aqui sem um código ou cookies, verificar se estamos na página home
        if (currentUrl.includes('/home.seam')) {
          this.logger.info('✅ Redirecionado para página inicial - autenticação bem-sucedida');
          
          // Obter cookies de sessão
          const jsessionidCookie = await page.cookies().then(cookies => 
            cookies.find(c => c.name === 'JSESSIONID')
          );
          
          if (jsessionidCookie) {
            this.logger.info('✅ Cookie de sessão JSESSIONID encontrado');
            
            // Fechar página
            await page.close();
            
            // Retornar JSESSIONID como token
            return {
              success: true,
              token: jsessionidCookie.value,
              tokenType: 'Bearer',
              message: 'Autenticação bem-sucedida com cookie de sessão',
              sessionId: jsessionidCookie.value
            };
          }
        }
        
        // Se ainda não conseguimos um token, verificar em todos os cookies
        const allCookies = await page.cookies();
        const authRelatedCookies = allCookies.filter(c => 
          c.name.toLowerCase().includes('token') || 
          c.name.toLowerCase().includes('auth') || 
          c.name.toLowerCase().includes('session') ||
          c.name.toLowerCase().includes('keycloak')
        );
        
        if (authRelatedCookies.length > 0) {
          const bestCookie = authRelatedCookies[0];
          this.logger.info(`✅ Usando cookie ${bestCookie.name} como token`);
          
          // Fechar página
          await page.close();
          
          return {
            success: true,
            token: bestCookie.value,
            tokenType: 'Bearer',
            message: `Autenticação usando cookie ${bestCookie.name}`,
            cookieName: bestCookie.name
          };
        }
        
        // Fechar página
        await page.close();
        
        // Se chegamos até aqui, não conseguimos obter token
        return {
          success: false,
          message: 'Não foi possível obter token ou código de autorização'
        };
        
      } catch (e) {
        this.logger.error('❌ Erro durante processo de autenticação:', e.message);
        
        // Fechar página
        await page.close();
        
        return {
          success: false,
          message: `Erro durante autenticação: ${e.message}`
        };
      }
      
    } catch (error) {
      // Handler geral de erro
      this.logger.error('❌ Erro geral durante autenticação:', error.message);
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
      
      this.logger.info(`🔍 Buscando processo ${processNumber} com token`);
      
      // Criar nova página para consulta
      const page = await this.browser.newPage();
      
      try {
        // Configurar token como cookie
        await page.setCookie({
          name: 'KEYCLOAK_IDENTITY',
          value: token,
          domain: '.pje.jus.br',
          path: '/',
        });
        
        // Acessar portal de serviços
        await page.goto(`${this.portalUrl}/consulta`, { waitUntil: 'networkidle2' });
        
        // Aguardar carregamento da interface
        await this.delay(3000);
        
        // Verificar se está logado
        const isLoggedIn = await page.evaluate(() => {
          // Verificar elementos que indicam que usuário está logado
          return !document.querySelector('button[type="submit"]');
        });
        
        if (!isLoggedIn) {
          this.logger.warn('⚠️ Não foi possível confirmar login no portal');
        }
        
        // Buscar pelo processo
        await page.type('input[placeholder*="processo"]', processNumber, { delay: 50 });
        
        // Clicar em pesquisar
        const searchButton = await page.$('button[type="submit"]');
        if (searchButton) {
          await searchButton.click();
          this.logger.info('✅ Busca iniciada');
          
          // Aguardar resultados
          await this.delay(5000);
          
          // Extrair resultados
          const results = await page.evaluate(() => {
            const items = document.querySelectorAll('table tr');
            return Array.from(items).map(row => {
              return {
                numero: row.querySelector('td:nth-child(1)')?.textContent,
                partes: row.querySelector('td:nth-child(2)')?.textContent,
                classe: row.querySelector('td:nth-child(3)')?.textContent
              };
            }).filter(item => item.numero);
          });
          
          return {
            success: true,
            message: results.length > 0 ? 'Processo encontrado' : 'Nenhum processo encontrado',
            processNumber: processNumber,
            results
          };
        } else {
          this.logger.warn('⚠️ Botão de pesquisa não encontrado');
          return {
            success: false,
            message: 'Interface de busca não encontrada',
            processNumber: processNumber
          };
        }
      } finally {
        await page.close();
      }
    } catch (error) {
      this.logger.error('Erro ao buscar processo:', error);
      throw error;
    }
  }
}

module.exports = PDPJAuthService;
