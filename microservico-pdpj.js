// microservico-pdpj.js
// ---------------------------------------------
// Microserviço CommonJS que obtém token PDPJ
// via Password Grant ou, em fallback, Puppeteer + PKCE/localStorage
// ---------------------------------------------

require('dotenv').config();
const express   = require('express');
const axios     = require('axios');
const qs        = require('querystring');
const chromium  = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

const USER = process.env.PJE_USER;
const PASS = process.env.PJE_PASS;
const PORT = process.env.PORT || 3000;

// Endpoint do Keycloak
const TOKEN_URL = 'https://sso.cloud.pje.jus.br/auth/realms/pje/protocol/openid-connect/token';

// Checa variáveis
if (!USER || !PASS) {
  console.error('❌ Defina PJE_USER e PJE_PASS nas variáveis de ambiente.');
  process.exit(1);
}

const app = express();

app.get('/token', async (_req, res) => {
  // 1) Tenta password grant
  try {
    const resp = await axios.post(
      TOKEN_URL,
      qs.stringify({
        grant_type: 'password',
        client_id: 'pje-tjpe-1g-cloud',
        username: USER,
        password: PASS,
        scope: 'openid'
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    if (resp.data?.access_token) {
      console.log('✅ Token via password grant');
      return res.json({ access_token: resp.data.access_token });
    }
  } catch (err) {
    console.warn('⚠️ Password grant falhou:', err.response?.data || err.message);
    // segue para Puppeteer
  }

  // 2) Fallback Puppeteer + varredura de localStorage
  let browser;
  try {
    browser = await puppeteer.launch({
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
    const page = await browser.newPage();

    // 2.1) Login
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

    // 2.2) Vai ao PDPJ (caso não redirecione direto)
    await page.goto('https://portaldeservicos.pdpj.jus.br', { waitUntil: 'networkidle2' });

    // 2.3) Varre localStorage procurando um JSON com `access_token`
    const token = await page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        try {
          const val = localStorage.getItem(key);
          const obj = JSON.parse(val);
          if (obj && typeof obj === 'object' && obj.access_token) {
            return obj.access_token;
          }
        } catch {}  // não é JSON ou sem access_token
      }
      return null;
    });

    if (!token) throw new Error('access_token não encontrado em localStorage');
    console.log('✅ Token via Puppeteer');
    return res.json({ access_token: token });

  } catch (err) {
    console.error('❌ Falha no fallback Puppeteer:', err.message);
    return res.status(500).json({ error: 'Falha ao obter token', details: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

// Health-check
app.get('/', (_req, res) => {
  res.send('🚀 Microserviço PDPJ online. GET /token');
});

app.listen(PORT, () =>
  console.log(`✅ Microserviço PDPJ escutando na porta ${PORT}`)
);
