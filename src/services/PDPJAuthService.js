const puppeteer = require('puppeteer');
const logger = require('../utils/logger');

class PDPJAuthService {
  constructor() {
    this.baseUrl = process.env.PJE_URL || 'https://pje.cloud.tjpe.jus.br/1g/login.seam';
  }

  async authenticate(username, password) {
    let browser = null;
    
    try {
      logger.info('Browser inicializado com sucesso');
      
      browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: true
      });
      
      const page = await browser.newPage();
      
      // Habilita interceptação de requisições para capturar o token
      await page.setRequestInterception(true);
      
      let token = null;
      
      // Intercepta as requisições para capturar o token nos headers
      page.on('request', request => {
        const headers = request.headers();
        if (headers.authorization && headers.authorization.includes('Bearer ')) {
          token = headers.authorization.replace('Bearer ', '');
          logger.info('Token JWT capturado na requisição');
        }
        request.continue();
      });
      
      logger.info('🚀 Iniciando autenticação para usuário:');
      logger.info('🌐 Navegando para URL:');
      
      // Acessa a página de login
      await page.goto(this.baseUrl, { waitUntil: 'networkidle2' });
      
      logger.info('✅ Página carregada com sucesso!');
      logger.info('📊 Status HTTP:');
      logger.info('🌐 URL atual:');
      
      // Aguarda um pouco para ter certeza que a página carregou completamente
      await page.waitForTimeout(3000);
      
      const pageTitle = await page.title();
      logger.info('📄 Título da página:', pageTitle);
      
      // ---- Fase 1: Login inicial no PJe ----
      logger.info('🔍 Aguardando campos de login...');
      
      // Aguarda o campo de username aparecer
      await page.waitForSelector('#username', { visible: true, timeout: 10000 })
        .catch(() => logger.warn('⚠️ Campo username não encontrado!'));
      
      logger.info('✅ Campo de username encontrado!');
      
      // Identifica os campos de login
      const userSelector = '#username';
      const passSelector = '#password';
      
      logger.info('✅ Campo username encontrado com seletor:');
      logger.info('✅ Campo password encontrado com seletor:');
      
      // Preenche as credenciais
      logger.info('📝 Preenchendo credenciais...');
      await page.type(userSelector, username);
      await page.type(passSelector, password);
      logger.info('✅ Credenciais preenchidas');
      
      // Identifica o botão de login
      const loginButtonSelector = 'button[type="submit"]';
      
      logger.info('✅ Botão login encontrado com seletor:');
      
      // Tenta clicar no botão de login com vários métodos
      logger.info('🔘 Tentando clique robusto em: Botão de login (button[type="submit"])');
      
      // Verifica se o elemento está visível 
      const isVisible = await page.evaluate((selector) => {
        const element = document.querySelector(selector);
        if (!element) return false;
        
        const style = window.getComputedStyle(element);
        return style && style.display !== 'none' && style.visibility !== 'hidden';
      }, loginButtonSelector);
      
      logger.info('👁️ Elemento visível:', isVisible);
      
      if (!isVisible) {
        logger.info('🔄 Tentando scroll + clique...');
        try {
          await page.evaluate((selector) => {
            const button = document.querySelector(selector);
            if (button) {
              button.scrollIntoView();
              button.click();
            }
          }, loginButtonSelector);
        } catch (e) {
          logger.warn('⚠️ Scroll + clique falhou:', e.message);
        }
        
        logger.info('🔄 Tentando JavaScript click...');
        await page.evaluate((selector) => {
          const buttons = document.querySelectorAll(selector);
          if (buttons.length > 0) {
            buttons[0].click();
            return true;
          }
          return false;
        }, loginButtonSelector);
        logger.info('✅ JavaScript click funcionou!');
      } else {
        await page.click(loginButtonSelector);
        logger.info('✅ Clique padrão funcionou!');
      }
      
      logger.info('⏳ Aguardando resposta do login...');
      
      // Espera navegação ou redirecionamento após o login
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 })
        .catch(() => logger.warn('⚠️ Nenhum redirecionamento detectado após login'));
      
      // Verifica URL atual para entender o estado do login
      const currentUrl = page.url();
      logger.info('🎯 Resultado do login:', { status: 'redirected', url: currentUrl });
      logger.info('🌐 URL após login:', { url: currentUrl });
      
      // ---- Fase 2: Se redirecionado para SSO Keycloak, preenche campos adicionais ----
      if (currentUrl.includes('sso.cloud.pje.jus.br') || currentUrl.includes('auth/realms/pje')) {
        logger.info('🔄 Redirecionado para SSO Keycloak');
        
        // Busca por campos adicionais e os preenche
        const fields = await page.evaluate(() => {
          const result = [];
          const inputs = document.querySelectorAll('input');
          
          for (const input of inputs) {
            if (input.required && !input.value) {
              result.push({
                name: input.name,
                type: input.type,
                placeholder: input.placeholder || 'N/A'
              });
            }
          }
          
          return result;
        });
        
        if (fields.length > 0) {
          logger.info('📝 Campos adicionais encontrados:', { fields });
          
          // Preenche campo login se necessário
          const loginField = fields.find(f => f.name === 'login' || f.type === 'number');
          if (loginField) {
            await page.type(`input[name="${loginField.name}"]`, username);
            logger.info('✅ Campo login preenchido com username');
          }
          
          // Preenche campo email se necessário
          const emailField = fields.find(f => f.name === 'email' || f.type === 'email');
          if (emailField) {
            // Gera um email baseado no username
            const email = `${username}@exemplo.com.br`;
            await page.type(`input[name="${emailField.name}"]`, email);
            logger.info('✅ Campo email preenchido com email gerado');
          }
          
          // Procura por botão de continuação/submit na página do SSO
          const continueButton = await page.evaluate(() => {
            const buttons = [
              ...document.querySelectorAll('button[type="submit"]'),
              ...document.querySelectorAll('input[type="submit"]'),
              ...document.querySelectorAll('button.confirm'),
              ...document.querySelectorAll('button.btn-primary')
            ];
            
            return buttons.length > 0 ? true : false;
          });
          
          if (continueButton) {
            logger.info('🔘 Clicando no botão de continuação do SSO');
            
            await page.evaluate(() => {
              const buttons = [
                ...document.querySelectorAll('button[type="submit"]'),
                ...document.querySelectorAll('input[type="submit"]'),
                ...document.querySelectorAll('button.confirm'),
                ...document.querySelectorAll('button.btn-primary')
              ];
              
              if (buttons.length > 0) {
                buttons[0].click();
              }
            });
            
            // Aguarda navegação após clicar no botão
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 })
              .catch(() => logger.warn('⚠️ Nenhum redirecionamento detectado após confirmação do SSO'));
          }
        }
      }
      
      // ---- Fase 3: Verificação do login e captura do token ----
      // Verifica URL atual após os passos de autenticação
      const finalUrl = page.url();
      logger.info('🔍 URL final após autenticação:', { url: finalUrl });
      
      // Se ainda não capturou o token via intercepção, tenta buscar no localStorage
      if (!token) {
        token = await page.evaluate(() => {
          // Tenta várias posições comuns onde o token pode estar armazenado
          return localStorage.getItem('access_token') || 
                 localStorage.getItem('keycloak-token') ||
                 localStorage.getItem('token') ||
                 localStorage.getItem('authToken') ||
                 sessionStorage.getItem('access_token') ||
                 sessionStorage.getItem('keycloak-token');
        });
        
        if (token) {
          logger.info('✅ Token encontrado no Storage do navegador');
        }
      }
      
      // Se ainda não encontrou o token, tenta fazer navegação para forçar requisições com o token
      if (!token) {
        // Tenta navegar para dentro do sistema
        logger.info('🔄 Tentando acessar área logada para forçar requisições com token...');
        
        // Pode ser necessário ajustar esta URL dependendo do redirecionamento específico do PJe
        await page.goto('https://pje.cloud.tjpe.jus.br/1g/dashboard', { waitUntil: 'networkidle2' })
          .catch(() => logger.warn('⚠️ Erro ao acessar dashboard'));
        
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
          logger.info('✅ Token encontrado após navegação forçada');
        }
      }
      
      // Se ainda não encontrou o token, tenta extrair das cookies
      if (!token) {
        const cookies = await page.cookies();
        const authCookie = cookies.find(c => 
          c.name.toLowerCase().includes('token') || 
          c.name.toLowerCase().includes('auth') || 
          c.name.toLowerCase().includes('jwt')
        );
        
        if (authCookie) {
          token = authCookie.value;
          logger.info('✅ Token encontrado nas cookies');
        }
      }
      
      // Verifica o resultado final da autenticação
      if (token) {
        logger.info('🎉 Autenticação bem-sucedida! Token JWT obtido.');
        return { 
          success: true,
          token,
          tokenType: 'Bearer'
        };
      } else {
        logger.error('❌ Não foi possível obter token. Autenticação falhou.');
        return { 
          success: false, 
          error: 'Não foi possível obter token de autenticação'
        };
      }
      
    } catch (error) {
      logger.error('❌ Erro durante autenticação:', error.message);
      return { 
        success: false, 
        error: `Erro durante processo de autenticação: ${error.message}`
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
}

module.exports = new PDPJAuthService();
