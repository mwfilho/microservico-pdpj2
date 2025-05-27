# ===============================================================================
# DOCKERFILE - ESTRUTURA CORRETA COM /src/app.js
# ===============================================================================
FROM node:18-bullseye-slim

# Metadados
LABEL maintainer="mwfilho"
LABEL description="Microserviço de autenticação PJE TJPE"
LABEL version="1.0.0"

# Variáveis de ambiente
ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production
ENV NPM_CONFIG_LOGLEVEL=warn

# Configurações Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROME_PATH=/usr/bin/chromium

# Instalar dependências do sistema
RUN apt-get update && apt-get install -y \
    wget curl ca-certificates chromium \
    fonts-liberation libappindicator3-1 \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 \
    libcairo2 libcups2 libdbus-1-3 libexpat1 \
    libfontconfig1 libgbm1 libglib2.0-0 \
    libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 \
    libpangocairo-1.0-0 libx11-6 libx11-xcb1 \
    libxcb1 libxcomposite1 libxcursor1 libxdamage1 \
    libxext6 libxfixes3 libxi6 libxrandr2 \
    libxrender1 libxss1 libxtst6 lsb-release xdg-utils \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Criar usuário não-root
RUN groupadd -r nodeuser && useradd -r -g nodeuser -G audio,video nodeuser \
    && mkdir -p /home/nodeuser \
    && chown -R nodeuser:nodeuser /home/nodeuser

# Diretório de trabalho
WORKDIR /app

# ===============================================================================
# INSTALAÇÃO DE DEPENDÊNCIAS
# ===============================================================================

# Copiar package.json (não temos package-lock.json)
COPY package.json ./

# Verificar e instalar dependências
RUN echo "=========================================" && \
    echo "📋 INSTALAÇÃO DE DEPENDÊNCIAS" && \
    echo "=========================================" && \
    echo "📄 Conteúdo do package.json:" && \
    cat /app/package.json && \
    echo "" && \
    echo "🚀 Instalando dependências..." && \
    npm install --only=production --no-audit --no-fund && \
    echo "✅ Dependências instaladas!" && \
    echo "📦 Pacotes instalados: $(ls /app/node_modules | wc -l)" && \
    npm cache clean --force && \
    echo "========================================="

# ===============================================================================
# COPIAR CÓDIGO FONTE
# ===============================================================================

# Copiar TODO o código fonte
COPY . .

# ===============================================================================
# VERIFICAÇÃO DA ESTRUTURA COM /src
# ===============================================================================
RUN echo "=========================================" && \
    echo "✅ VERIFICAÇÃO ESTRUTURA COM /src" && \
    echo "=========================================" && \
    echo "📁 Conteúdo da raiz /app:" && \
    ls -la /app && \
    echo "" && \
    echo "📂 Conteúdo da pasta /app/src:" && \
    ls -la /app/src/ 2>/dev/null || echo "❌ Pasta /app/src NÃO encontrada" && \
    echo "" && \
    echo "📄 Verificando arquivos principais:" && \
    test -f /app/src/app.js && echo "✅ /app/src/app.js ENCONTRADO" || echo "❌ /app/src/app.js NÃO encontrado" && \
    test -f /app/package.json && echo "✅ /app/package.json ENCONTRADO" || echo "❌ /app/package.json NÃO encontrado" && \
    echo "" && \
    echo "📂 Verificando outras pastas:" && \
    test -d /app/routes && echo "✅ pasta routes/ encontrada" || echo "❌ pasta routes/ NÃO encontrada" && \
    test -d /app/services && echo "✅ pasta services/ encontrada" || echo "❌ pasta services/ NÃO encontrada" && \
    test -d /app/utils && echo "✅ pasta utils/ encontrada" || echo "❌ pasta utils/ NÃO encontrada" && \
    test -d /app/middleware && echo "✅ pasta middleware/ encontrada" || echo "❌ pasta middleware/ NÃO encontrada" && \
    echo "" && \
    echo "🔍 Procurando ALL arquivos .js:" && \
    find /app -name "*.js" -type f 2>/dev/null | head -10 && \
    echo "" && \
    echo "📄 Se src/app.js existe, mostrar início:" && \
    if [ -f /app/src/app.js ]; then head -10 /app/src/app.js; fi && \
    echo "========================================="

# ===============================================================================
# CONFIGURAÇÕES FINAIS
# ===============================================================================

# Permissões
RUN chown -R nodeuser:nodeuser /app
USER nodeuser

# Variáveis de runtime
ENV PORT=8080
ENV HOST=0.0.0.0
ENV NODE_OPTIONS="--max-old-space-size=2048"

# Expor porta
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# ===============================================================================
# COMANDO DE INICIALIZAÇÃO CORRETO
# ===============================================================================

# Usar src/app.js em vez de app.js
CMD ["node", "src/app.js"]
