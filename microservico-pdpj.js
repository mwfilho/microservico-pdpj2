// microservico-pdpj.js — versão leve (puppeteer-core + @sparticuz/chromium)
// ---------------------------------------------------------------------------
// 1. Faz login no PJe (TJPE) com CPF/senha
// 2. Abre o Portal PDPJ
// 3. Extrai o access_token do localStorage
// 4. Responde em GET /token com { access_token }
//
// Variáveis de ambiente obrigatórias:
//   PJE_USER  – seu CPF/login no PJe
//   PJE_PASS  – sua senha do PJe
// ---------------------------------------------------------------------------

require('dotenv').config();
const express   = require('express');
const chromium  = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
const axios     = require('axios');          // (útil se quiser expandir futuramente)

const USER = process.env.PJE_USER;
const PASS = process.env.PJE_PASS;
const PORT = process.env.PORT || 3000;

if (!USER || !PASS) {
  console.error('\n❌  Defina PJE_USER e PJE_PASS nas variáveis de ambiente.');
  process.exit(1);
}

const app = express();

// ────────────────────────────────────────────────────────────────────────────
// Rota principal: GET /token  →  { access_token: "eyJ..." }
// ────────────────────────────────────────────────────────────────────────────
app.get('/token', async (_req, res) => {
  let browser;
  try {
    browser = await puppeteer.launch({
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    // 1️⃣ Login no PJe-TJPE
    await page.goto('https://pje.cloud.tjpe.jus.br/1g/login.seam', {
      waitUntil: 'networkidle2',
    });
    await page.type('#loginApplication\\:username', USER, { delay: 30 });
    await page.type('#loginApplication\\:password', PASS, { delay: 30 });
    await page.click('#loginApplication\\:loginButton');

    // 2️⃣ Aguarda conclusão do login/redirecionamento
    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    // 3️⃣ Abre o Portal PDPJ (caso o redirecionamento não tenha levado direto)
    await page.goto('https://portaldeservicos.pdpj.jus.br', {
      waitUntil: 'networkidle2',
    });

    // 4️⃣ Extrai o token do localStorage do portal
    const token = await page.evaluate(() => localStorage.getItem('access_token'));

    if (!token) throw new Error('access_token não encontrado no localStorage');

    res.json({ access_token: token });
  } catch (err) {
    console.error('Erro ao obter token:', err.message);
    res.status(500).json({ error: 'Falha ao obter token', details: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

// rota simples para ping
app.get('/', (_req, res) =>
  res.send('🚀 Microserviço PDPJ online. Acesse /token para obter o access_token.')
);

app.listen(PORT, () =>
  console.log(`✅ Microserviço PDPJ escutando na porta ${PORT}`)
);
