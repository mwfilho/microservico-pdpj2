# ===============================================================================
# DOCKERFILE OTIMIZADO - ESTRUTURA CORRETA DO REPOSITÓRIO
# ===============================================================================
FROM node:18-bullseye-slim

# Metadados
LABEL maintainer="mwfilho"
LABEL description="Microserviço de autenticação PJE TJPE"
LABEL version="1.0.0"

# Variáveis de ambiente para build
ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production
ENV NPM_CONFIG_LOGLEVEL=warn

# Configurações Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROME_PATH=/usr/bin/chromium

# Atualizar sistema e instalar dependências essenciais
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Instalar Chromium e dependências do Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Criar usuário não-root para segurança
RUN groupadd -r nodeuser && useradd -r -g nodeuser -G audio,video nodeuser \
    && mkdir -p /home/nodeuser \
    && chown -R nodeuser:nodeuser /home/nodeuser

# Diretório de trabalho
WORKDIR /app

# ===============================================================================
# INSTALAÇÃO DE DEPENDÊNCIAS (OTIMIZADA PARA CACHE)
# ===============================================================================

# Copiar arquivos de package primeiro (para cache do Docker)
COPY package*.json ./

# Como o package-lock.json JÁ EXISTE, usar npm ci
RUN npm ci --only=production --no-audit --no-fund \
    && npm cache clean --force

# ===============================================================================
# COPIAR CÓDIGO FONTE
# ===============================================================================

# Copiar TODO o código fonte
COPY . .

# ===============================================================================
# VERIFICAÇÕES DE ESTRUTURA
# ===============================================================================
RUN echo "=========================================" && \
    echo "✅ VERIFICANDO ESTRUTURA DO PROJETO" && \
    echo "=========================================" && \
    echo "📁 Conteúdo da raiz /app:" && \
    ls -la /app && \
    echo "" && \
    echo "📄 Verificando arquivos principais:" && \
    test -f /app/app.js && echo "✅ app.js encontrado" || echo "❌ app.js NÃO encontrado" && \
    test -f /app/package.json && echo "✅ package.json encontrado" || echo "❌ package.json NÃO encontrado" && \
    test -f /app/package-lock.json && echo "✅ package-lock.json encontrado" || echo "❌ package-lock.json NÃO encontrado" && \
    echo "" && \
    echo "📂 Verificando pastas:" && \
    test -d /app/routes && echo "✅ pasta routes/ encontrada" || echo "❌ pasta routes/ NÃO encontrada" && \
    test -d /app/services && echo "✅ pasta services/ encontrada" || echo "❌ pasta services/ NÃO encontrada" && \
    test -d /app/utils && echo "✅ pasta utils/ encontrada" || echo "❌ pasta utils/ NÃO encontrada" && \
    test -d /app/middleware && echo "✅ pasta middleware/ encontrada" || echo "❌ pasta middleware/ NÃO encontrada" && \
    echo "" && \
    echo "📋 Verificando arquivos específicos:" && \
    test -f /app/routes/webhook.js && echo "✅ routes/webhook.js encontrado" || echo "❌ routes/webhook.js NÃO encontrado" && \
    test -f /app/services/authService.js && echo "✅ services/authService.js encontrado" || echo "❌ services/authService.js NÃO encontrado" && \
    test -f /app/services/puppeteerManager.js && echo "✅ services/puppeteerManager.js encontrado" || echo "❌ services/puppeteerManager.js NÃO encontrado" && \
    test -f /app/utils/logger.js && echo "✅ utils/logger.js encontrado" || echo "❌ utils/logger.js NÃO encontrado" && \
    echo "========================================="

# ===============================================================================
# CONFIGURAÇÕES FINAIS
# ===============================================================================

# Definir permissões corretas
RUN chown -R nodeuser:nodeuser /app

# Mudança para usuário não-root (segurança)
USER nodeuser

# Configurações de runtime
ENV PORT=8080
ENV HOST=0.0.0.0
ENV NODE_OPTIONS="--max-old-space-size=2048"

# Exposição da porta
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# ===============================================================================
# COMANDO DE INICIALIZAÇÃO
# ===============================================================================

# O app.js está na raiz, usar diretamente
CMD ["node", "app.js"]
