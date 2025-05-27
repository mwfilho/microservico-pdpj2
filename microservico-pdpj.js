// microservico-pdpj.js
// ---------------------------------------------
// Microserviço CommonJS que obtém token PDPJ
// via Password Grant ou, em fallback, Puppeteer + varredura de storage por padrão JWT
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
const KEYCLOAK_TOKEN_URL = 'https://sso.cloud.pje.jus.br/auth/realms/pje/protocol/openid-connect/token';
const SPA_LOGIN          = 'https://pje.cloud.tjpe.jus.br/1g/login.seam';
const PORTAL_URL         = 'https://portaldeservicos.pdpj.jus.br';

if (!USER || !PASS) {
  console.error('❌ Defina PJE_USER e PJE_PASS nas variáveis de ambiente.');
  process.exit(1);
}

const app = express();

app.get('/token', async (_req, res) => {
  // 1) Tenta Password Grant
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
    if (resp.data?.access_token) {
      console.log('✅ Token obtido via password grant');
      return res.json({ access_token: resp.data.access_token });
    }
  } catch (err) {
    console.warn('⚠️ Password grant falhou:', err.response?.data || err.message);
  }

  // 2) Fallback: Puppeteer + varredura de storage buscando JWT
  let browser;
  try {
    browser = await puppeteer.launch({
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
    const page = await browser.newPage();

    // 2.1) Login no PJe-TJPE
    await page.goto(SPA_LOGIN, { waitUntil: 'networkidle2' });
    const inputUser = await page.waitForSelector('input[type="text"]', { timeout: 15000 });
    await inputUser.click({ clickCount: 3 });
    await inputUser.type(USER, { delay: 30 });
    const inputPass = await page.waitForSelector('input[type="password"]', { timeout: 15000 });
    await inputPass.click({ clickCount: 3 });
    await inputPass.type(PASS, { delay: 30 });
    const btn = await page.$('button[type="submit"], input[type="submit"]');
    if (!btn) throw new Error('Botão de login não encontrado');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      btn.click(),
    ]);

    // 2.2) Navega ao portal para ativar SSO
    await page.goto(PORTAL_URL, { waitUntil: 'networkidle2' });

    // 2.3) Varre localStorage e sessionStorage em busca de JWT
    const token = await page.evaluate(() => {
      const jwtPattern = /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/;
      for (const storage of [window.localStorage, window.sessionStorage]) {
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          const val = storage.getItem(key);
          if (typeof val === 'string') {
            if (jwtPattern.test(val)) {
              return val;
            }
            try {
              const obj = JSON.parse(val);
              if (obj?.access_token && jwtPattern.test(obj.access_token)) {
                return obj.access_token;
              }
            } catch {}
          }
        }
      }
      return null;
    });

    if (!token) throw new Error('access_token não encontrado em storage');
    console.log('✅ Token obtido via storage scan');
    return res.json({ access_token: token });

  } catch (err) {
    console.error('❌ Fallback falhou:', err.message);
    return res.status(500).json({ error: 'Falha ao obter token', details: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

// Health check
app.get('/', (_req, res) => res.send('🚀 PDPJ Token Service online'));
app.listen(PORT, () => console.log(`✅ Listening on port ${PORT}`));
