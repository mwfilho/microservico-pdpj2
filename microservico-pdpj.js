// microservico-pdpj.js
// Tenta primeiro ROPC (password grant) no Keycloak PJe/TJPE
// Se falhar, abre um browser headless para login e extrai token do localStorage.
// CommonJS + Express + Axios + Puppeteer-Core + @sparticuz/chromium

require('dotenv').config();
const express   = require('express');
const axios     = require('axios');
const qs        = require('querystring');
const chromium  = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

const USER = process.env.PJE_USER;
const PASS = process.env.PJE_PASS;
const PORT = process.env.PORT || 3000;

if (!USER || !PASS) {
  console.error('❌ Defina PJE_USER e PJE_PASS nas variáveis de ambiente.');
  process.exit(1);
}

const app = express();

app.get('/token', async (_req, res) => {
  // 1) Tentar direto Resource-Owner Password Credentials
  try {
    const resp = await axios.post(
      'https://sso.cloud.pje.jus.br/auth/realms/pje/protocol/openid-connect/token',
      qs.stringify({
        grant_type: 'password',
        client_id: 'pje-tjpe-1g-cloud',
        username: USER,
        password: PASS,
        scope: 'openid',
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    if (resp.data && resp.data.access_token) {
      console.log('✅ Token obtido via password grant');
      return res.json({ access_token: resp.data.access_token });
    }
  } catch (err) {
    console.warn('⚠️ Password grant falhou:', err.response?.data || err.message);
    // segue para fallback
  }

  // 2) Fallback: Puppeteer + login no SPA
  let browser;
  try {
    browser = await puppeteer.launch({
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
    const page = await browser.newPage();

    // 2.1) Login no PJe-TJPE (seletor genérico)
    await page.goto('https://pje.cloud.tjpe.jus.br/1g/login.seam', {
      waitUntil: 'networkidle2',
    });
    const userInput = await page.waitForSelector('input[type="text"]', { timeout: 10000 });
    await userInput.click({ clickCount: 3 });
    await userInput.type(USER, { delay: 30 });

    const passInput = await page.waitForSelector('input[type="password"]', { timeout: 10000 });
    await passInput.click({ clickCount: 3 });
    await passInput.type(PASS, { delay: 30 });

    const submitBtn = await page.$('button[type="submit"], input[type="submit"]');
    if (!submitBtn) throw new Error('Botão de login não encontrado');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      submitBtn.click(),
    ]);

    // 2.2) Navega ao Portal PDPJ
    await page.goto('https://portaldeservicos.pdpj.jus.br', {
      waitUntil: 'networkidle2',
    });

    // 2.3) Extrai o token do localStorage
    const token = await page.evaluate(() => localStorage.getItem('access_token'));
    if (!token) throw new Error('access_token não encontrado no localStorage');

    console.log('✅ Token obtido via Puppeteer');
    return res.json({ access_token: token });
  } catch (err) {
    console.error('❌ Erro no fallback Puppeteer:', err.message);
    return res.status(500).json({ error: 'Falha ao obter token', details: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

// health check
app.get('/', (_req, res) => {
  res.send('🚀 Microserviço PDPJ online. GET /token para acessar token.');
});

app.listen(PORT, () =>
  console.log(`✅ Microserviço PDPJ escutando na porta ${PORT}`)
);
