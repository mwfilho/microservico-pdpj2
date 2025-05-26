// microservico-pdpj.js
// ---------------------------------------------
// Microserviço CommonJS que obtém token PDPJ
// via Authorization Code + PKCE no Keycloak
// ---------------------------------------------

require('dotenv').config();
const express   = require('express');
const axios     = require('axios');
const qs        = require('querystring');
const crypto    = require('crypto');
const chromium  = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

const USER        = process.env.PJE_USER;
const PASS        = process.env.PJE_PASS;
const PORT        = process.env.PORT || 3000;

// Configurações fixas
const REALM_URL   = 'https://sso.cloud.pje.jus.br/auth/realms/pje';
const CLIENT_ID   = 'portalexterno-frontend';
const REDIRECT_URI= 'https://portaldeservicos.pdpj.jus.br';

if (!USER || !PASS) {
  console.error('❌ Defina PJE_USER e PJE_PASS nas variáveis de ambiente.');
  process.exit(1);
}

const app = express();

// Utilitário PKCE
function base64URLEncode(buffer) {
  return buffer.toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest();
}

app.get('/token', async (_req, res) => {
  let browser;
  try {
    // 1) Gera PKCE
    const codeVerifier  = base64URLEncode(crypto.randomBytes(32));
    const codeChallenge = base64URLEncode(sha256(codeVerifier));
    const state         = base64URLEncode(crypto.randomBytes(16));

    // 2) Constrói URL de autorização
    const authUrl = `${REALM_URL}/protocol/openid-connect/auth`
      + `?response_type=code`
      + `&client_id=${CLIENT_ID}`
      + `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`
      + `&scope=openid`
      + `&code_challenge=${codeChallenge}`
      + `&code_challenge_method=S256`
      + `&state=${state}`;

    // 3) Inicia browser headless e navega ao Keycloak
    browser = await puppeteer.launch({
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
    const page = await browser.newPage();
    await page.goto(authUrl, { waitUntil: 'networkidle2' });

    // 4) Faz login (seletor genérico)
    const userInput = await page.waitForSelector('input[type="text"]', { timeout: 10000 });
    await userInput.click({ clickCount: 3 });
    await userInput.type(USER, { delay: 30 });

    const passInput = await page.waitForSelector('input[type="password"]', { timeout: 10000 });
    await passInput.click({ clickCount: 3 });
    await passInput.type(PASS, { delay: 30 });

    const submitBtn = await page.$('button[type="submit"], input[type="submit"]');
    if (!submitBtn) throw new Error('Botão de login não encontrado');
    // Espera o redirect com code
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      submitBtn.click(),
    ]);

    // 5) Captura o `code` da URL de redirect
    const redirectUrl = page.url();
    const m = redirectUrl.match(/[?&]code=([^&]+)/);
    if (!m) throw new Error('Parâmetro code não encontrado na URL de redirect');
    const code = m[1];

    // 6) Troca code por token no Keycloak
    const tokenResponse = await axios.post(
      `${REALM_URL}/protocol/openid-connect/token`,
      qs.stringify({
        grant_type:    'authorization_code',
        client_id:     CLIENT_ID,
        code:          code,
        redirect_uri:  REDIRECT_URI,
        code_verifier: codeVerifier,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    if (!tokenResponse.data || !tokenResponse.data.access_token) {
      throw new Error('Token não retornado pelo Keycloak');
    }

    // 7) Retorna o access_token
    return res.json({ access_token: tokenResponse.data.access_token });
  } catch (err) {
    console.error('❌ Erro ao obter token:', err.message);
    return res.status(500).json({ error: 'Falha ao obter token', details: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

// Health check
app.get('/', (_req, res) => {
  res.send('🚀 Microserviço PDPJ online. Use GET /token para obter token.');
});

app.listen(PORT, () => {
  console.log(`✅ Microserviço PDPJ escutando na porta ${PORT}`);
});
