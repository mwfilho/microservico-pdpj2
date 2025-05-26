// microservico-pdpj.js
// ---------------------------------------------
// Microserviço CommonJS que obtém token PDPJ
// via Password Grant ou, em fallback, Puppeteer + interceptação de XHR para captura do Bearer
// ---------------------------------------------

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
const tokenUrl   = 'https://sso.cloud.pje.jus.br/auth/realms/pje/protocol/openid-connect/token';
const SPA_LOGIN  = 'https://pje.cloud.tjpe.jus.br/1g/login.seam';
const SPA_SEARCH = 'https://portaldeservicos.pdpj.jus.br/consulta';
const API_BASE   = 'https://portaldeservicos.pdpj.jus.br/api/v2/processos';

if (!USER || !PASS) {
  console.error('❌ Defina PJE_USER e PJE_PASS nas variáveis de ambiente.');
  process.exit(1);
}

const app = express();

app.get('/token', async (_req, res) => {
  // 1) Password Grant
  try {
    const resp = await axios.post(
      tokenUrl,
      qs.stringify({
        grant_type:  'password',
        client_id:   'pje-tjpe-1g-cloud',
        username:    USER,
        password:    PASS,
        scope:       'openid'
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    if (resp.data?.access_token) {
      console.log('✅ Token obtido via password grant');
      return res.json({ access_token: resp.data.access_token });
    }
  } catch (err) {
    console.warn('⚠️ Password grant falhou:', err.response?.data || err.message);
  }

  // 2) Fallback Puppeteer + interceptação XHR
  let browser;
  try {
    browser = await puppeteer.launch({
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
    const page = await browser.newPage();

    // interceptar XHRs para /api/v2/processos
    let bearer;
    page.on('request', req => {
      if (req.url().startsWith(API_BASE)) {
        const auth = req.headers()['authorization'];
        if (auth?.startsWith('Bearer ')) bearer = auth.split(' ')[1];
      }
    });

    // 2.1) Login genérico
    await page.goto(SPA_LOGIN, { waitUntil: 'networkidle2' });
    const userInput = await page.waitForSelector('input[type="text"]', { timeout:10000 });
    const passInput = await page.waitForSelector('input[type="password"]', { timeout:10000 });
    await userInput.click({ clickCount:3 }); await userInput.type(USER, { delay:30 });
    await passInput.click({ clickCount:3 }); await passInput.type(PASS, { delay:30 });
    const submit = await page.$('button[type="submit"], input[type="submit"]');
    if (!submit) throw new Error('Botão de login não encontrado');
    await Promise.all([page.waitForNavigation({ waitUntil:'networkidle2' }), submit.click()]);

    // 2.2) Navega à busca de processos para disparar XHR
    await page.goto(SPA_SEARCH, { waitUntil: 'networkidle2' });
    // digita número dummy e dispara busca
    const searchInput = await page.waitForSelector('input[placeholder*="processo"]', { timeout:10000 });
    await searchInput.click({ clickCount:3 }); await searchInput.type('0000000-00.0000.0.00.0000', { delay:30 });
    const searchBtn = await page.$('button[type="submit"], button:has-text("Pesquisar")');
    if (!searchBtn) throw new Error('Botão de buscar processo não encontrado');
    await Promise.all([page.waitForRequest(r=>r.url().startsWith(API_BASE)&&bearer, {timeout:20000}), searchBtn.click()]);

    if (!bearer) throw new Error('Bearer não capturado via interceptação');
    console.log('✅ Token via intercept XHR');
    return res.json({ access_token: bearer });

  } catch (err) {
    console.error('❌ Fallback falhou:', err.message);
    return res.status(500).json({ error:'Falha ao obter token', details: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

// Health-check
app.get('/', (_req,res)=>res.send('🚀 PDPJ token service online'));
app.listen(PORT,()=>console.log(`Listening on port ${PORT}`));
