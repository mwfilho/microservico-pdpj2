// microservico-pdpj.js
// --------------------------------------------------
// 1) Password Grant (pje-tjpe-1g-cloud)
// 2) Fallback: Puppeteer → login → interceptar /api/v2/processos
// --------------------------------------------------

require('dotenv').config();
const express   = require('express');
const axios     = require('axios');
const qs        = require('querystring');
const chromium  = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

const USER      = process.env.PJE_USER;
const PASS      = process.env.PJE_PASS;
const PORT      = process.env.PORT || 3000;

// URLs fixas
const KEYCLOAK_TOKEN_URL = 'https://sso.cloud.pje.jus.br/auth/realms/pje/protocol/openid-connect/token';
const PROC_API_BASE      = 'https://portaldeservicos.pdpj.jus.br/api/v2/processos';
const SPA_CONSULTA_URL   = 'https://portaldeservicos.pdpj.jus.br/consulta';

if (!USER || !PASS) {
  console.error('❌ Defina PJE_USER e PJE_PASS nas variáveis de ambiente.');
  process.exit(1);
}

const app = express();

app.get('/token', async (_req, res) => {
  // --- 1) PASSWORD GRANT ---
  try {
    const resp = await axios.post(
      KEYCLOAK_TOKEN_URL,
      qs.stringify({
        grant_type:  'password',
        client_id:   'pje-tjpe-1g-cloud',
        username:    USER,
        password:    PASS,
        scope:       'openid',
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    if (resp.data?.access_token) {
      console.log('✅ Token obtido via password grant');
      return res.json({ access_token: resp.data.access_token });
    }
  } catch (err) {
    console.warn('⚠️ Password grant falhou:', err.response?.data || err.message);
    // Segue para fallback
  }

  // --- 2) FALLBACK PUPPETEER + INTERCEPTAÇÃO DE REQUISIÇÃO ---
  let browser;
  try {
    browser = await puppeteer.launch({
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
    const page = await browser.newPage();

    // Intercepta qualquer requisição à API de processos para pegar o Bearer
    let capturedToken = null;
    page.on('request', req => {
      const url = req.url();
      if (url.startsWith(PROC_API_BASE)) {
        const auth = req.headers()['authorization'];
        if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
          capturedToken = auth.replace('Bearer ', '');
        }
      }
    });

    // 2.1) Login no PJe-TJPE
    await page.goto('https://pje.cloud.tjpe.jus.br/1g/login.seam', { waitUntil: 'networkidle2' });
    const userInput = await page.waitForSelector('input[type="text"]',   { timeout: 10000 });
    const passInput = await page.waitForSelector('input[type="password"]', { timeout: 10000 });
    await userInput.click({ clickCount: 3 }); await userInput.type(USER, { delay: 20 });
    await passInput.click({ clickCount: 3 }); await passInput.type(PASS, { delay: 20 });
    const submitBtn = await page.$('button[type="submit"], input[type="submit"]');
    if (!submitBtn) throw new Error('Botão de login não encontrado');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      submitBtn.click(),
    ]);

    // 2.2) Navega à página de consulta (isso dispara a chamada XHR que leva o token)
    //      Usa um número genérico – a API vai retornar erro 404, mas já terá enviado o Bearer.
    const dummyNumero = '00000000000000000000';
    await page.goto(`${SPA_CONSULTA_URL}?numeroProcesso=${dummyNumero}`, {
      waitUntil: 'networkidle2',
    });

    // 2.3) Aguarda até capturar a request à /api/v2/processos
    await page.waitForRequest(
      req => req.url().startsWith(PROC_API_BASE) && !!capturedToken,
      { timeout: 10000 }
    );

    if (!capturedToken) {
      throw new Error('Token não capturado na requisição de consulta');
    }
    console.log('✅ Token obtido por interceptação Puppeteer');
    return res.json({ access_token: capturedToken });

  } catch (err) {
    console.error('❌ Falha no fallback Puppeteer:', err.message);
    return res.status(500).json({ error: 'Falha ao obter token', details: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

// Health-check
app.get('/', (_req, res) => {
  res.send('🚀 Microserviço PDPJ online. GET /token retorna o token.');
});

app.listen(PORT, () => {
  console.log(`✅ Microserviço PDPJ escutando na porta ${PORT}`);
});
