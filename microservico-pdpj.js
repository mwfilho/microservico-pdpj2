// microservico-pdpj.js
// Microserviço leve em CommonJS para extrair token do PDPJ via login no PJe-TJPE

require('dotenv').config();
const express   = require('express');
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
  let browser;
  try {
    // Inicia o Chromium via puppeteer-core + sparticuz/chromium
    browser = await puppeteer.launch({
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    // 1) Login no PJe-TJPE (seletor genérico)
    await page.goto('https://pje.cloud.tjpe.jus.br/1g/login.seam', { waitUntil: 'networkidle2' });

    // Campo de usuário
    const userInput = await page.waitForSelector('input[type="text"]', { timeout: 10000 });
    await userInput.click({ clickCount: 3 });
    await userInput.type(USER, { delay: 30 });

    // Campo de senha
    const passInput = await page.waitForSelector('input[type="password"]', { timeout: 10000 });
    await passInput.click({ clickCount: 3 });
    await passInput.type(PASS, { delay: 30 });

    // Botão de submit
    const submitBtn = await page.$('button[type="submit"], input[type="submit"]');
    if (!submitBtn) throw new Error('Botão de login não encontrado');
    await submitBtn.click();

    // Aguarda redirecionamento
    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    // 2) Acessa o Portal PDPJ
    await page.goto('https://portaldeservicos.pdpj.jus.br', { waitUntil: 'networkidle2' });

    // 3) Extrai o token do localStorage
    const token = await page.evaluate(() => window.localStorage.getItem('access_token'));
    if (!token) throw new Error('access_token não encontrado no localStorage');

    // 4) Retorna o token
    res.json({ access_token: token });
  } catch (err) {
    console.error('Erro ao obter token:', err.message);
    res.status(500).json({ error: 'Falha ao obter token', details: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

// Rota de health check
app.get('/', (_req, res) => {
  res.send('🚀 Microserviço PDPJ online. Use GET /token para obter o access_token.');
});

app.listen(PORT, () => {
  console.log(`✅ Microserviço PDPJ escutando na porta ${PORT}`);
});
