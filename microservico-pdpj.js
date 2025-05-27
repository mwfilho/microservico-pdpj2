// microservico-pdpj.js
// ---------------------------------------------
// Microserviço que obtém token PDPJ
// Tenta Password Grant; fallback: Puppeteer + interceptação via fetch interna
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

const KEYCLOAK_TOKEN_URL = 'https://sso.cloud.pje.jus.br/auth/realms/pje/protocol/openid-connect/token';
const SPA_LOGIN          = 'https://pje.cloud.tjpe.jus.br/1g/login.seam';
const PORTAL_URL         = 'https://portaldeservicos.pdpj.jus.br';
const API_ENDPOINT       = '/api/v2/processos';

if (!USER || !PASS) {
  console.error('❌ Defina PJE_USER e PJE_PASS.');
  process.exit(1);
}

const app = express();

app.get('/token', async (_req, res) => {
  // 1) Password Grant
  try {
    const resp = await axios.post(
      KEYCLOAK_TOKEN_URL,
      qs.stringify({
        grant_type: 'password',
        client_id:  'pje-tjpe-1g-cloud',
        username:   USER,
        password:   PASS,
        scope:      'openid'
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    if (resp.data.access_token) {
      return res.json({ access_token: resp.data.access_token });
    }
  } catch {}

  // 2) Fallback: Puppeteer + fetch interno
  let browser;
  try {
    browser = await puppeteer.launch({
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
    const page = await browser.newPage();
    let token = null;

    // Intercepta todas as requisições
    page.on('request', req => {
      const url = req.url();
      if (url.includes(API_ENDPOINT) && !token) {
        const auth = req.headers()['authorization'];
        if (auth && auth.startsWith('Bearer ')) {
          token = auth.split(' ')[1];
        }
      }
    });

    // Login no PJe-TJPE
    await page.goto(SPA_LOGIN, { waitUntil: 'networkidle2' });
    await page.waitForSelector('input[type="text"]', { timeout:15000 });
    await page.type('input[type="text"]', USER, { delay:30 });
    await page.type('input[type="password"]', PASS, { delay:30 });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('button[type="submit"], input[type="submit"]')
    ]);

    // Acessa portal e dispara fetch interno
    await page.goto(PORTAL_URL, { waitUntil: 'networkidle2' });
    const dummy = '0000000-00.0000.0.00.0000';
    await page.evaluate(num => {
      fetch(`/api/v2/processos?numeroProcesso=${num}`, { credentials: 'include' });
    }, dummy);

    // Aguarda captura do token
    const start = Date.now();
    while (!token && Date.now() - start < 20000) {
      await new Promise(r => setTimeout(r, 500));
    }
    if (token) {
      return res.json({ access_token: token });
    }
    throw new Error('Token não capturado');
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao obter token', details: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

app.get('/', (_req, res) => res.send('PDPJ token service'));  
app.listen(PORT, () => console.log(`Listening on ${PORT}`));
