// microservico-pdpj.js
// Microserviço para logar no PJe, redirecionar ao PDPJ e expor o token JWT

const express = require('express');
const puppeteer = require('puppeteer');
const dotenv = require('dotenv');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

const USER = process.env.PJE_USER;
const PASS = process.env.PJE_PASS;

app.get('/token', async (req, res) => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  try {
    await page.goto('https://pje.cloud.tjpe.jus.br/1g/login.seam', { waitUntil: 'networkidle2' });
    await page.type('#loginApplication\\:username', USER);
    await page.type('#loginApplication\\:password', PASS);
    await page.click('#loginApplication\\:loginButton');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    await page.goto('https://portaldeservicos.pdpj.jus.br', { waitUntil: 'networkidle2' });

    const token = await page.evaluate(() => {
      return localStorage.getItem('access_token') || null;
    });

    if (!token) throw new Error('Token não encontrado no localStorage.');

    res.json({ access_token: token });
  } catch (err) {
    console.error('Erro ao extrair token:', err);
    res.status(500).json({ error: 'Falha ao obter token', details: err.message });
  } finally {
    await browser.close();
  }
});

app.listen(PORT, () => {
  console.log(`Microserviço PDPJ rodando na porta ${PORT}`);
});
