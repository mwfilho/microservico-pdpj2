# ==============================================================================
# DOCKERFILE OTIMIZADO PARA MICROSERVIÇO PJE AUTH
# Railway + Puppeteer + Node.js
# ==============================================================================

# Usar imagem oficial Node.js com Debian (melhor compatibilidade)
FROM node:18-bullseye-slim

# Metadados
LABEL maintainer="mwfilho"
LABEL description="Microserviço de autenticação PJE TJPE"
LABEL version="1.0.0"

# Variáveis de ambiente para build
ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production
ENV NPM_CONFIG_LOGLEVEL=warn
ENV NPM_CONFIG_PROGRESS=false

# Atualizar sistema e instalar dependências essenciais
RUN apt-get update && apt-get install -y \
    # Utilitários básicos
    wget \
    curl \
    gnupg \
    ca-certificates \
    apt-transport-https \
    software-properties-common \
    # Limpeza inicial
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Instalar Chromium e dependências do Puppeteer
RUN apt-get update && apt-get install -y \
    # Browser
    chromium \
    chromium-sandbox \
    # Fontes
    fonts-liberation \
    fonts-noto \
    fonts-noto-color-emoji \
    # Libraries para Puppeteer
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
    # Utilitários X11
    lsb-release \
    xdg-utils \
    # Limpeza
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean \
    && apt-get autoremove -y

# Criar usuário não-root para segurança
RUN groupadd -r nodeuser && useradd -r -g nodeuser -G audio,video nodeuser \
    && mkdir -p /home/nodeuser/Downloads \
    && chown -R nodeuser:nodeuser /home/nodeuser

# Definir diretório de trabalho
WORKDIR /app

# Configurar Puppeteer para usar Chromium instalado
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROME_PATH=/usr/bin/chromium
ENV CHROMIUM_PATH=/usr/bin/chromium

# Configurações de display para headless
ENV DISPLAY=:99
ENV XVFB_WHD=1920x1080x24

# Configurações do Node.js para produção
ENV NODE_OPTIONS="--max-old-space-size=2048"
ENV UV_THREADPOOL_SIZE=4

# Copiar arquivos de package primeiro (para cache do Docker)
COPY package*.json ./

# Instalar dependências Node.js
RUN npm ci --only=production --no-audit --no-fund \
    && npm cache clean --force

# Copiar código fonte
COPY . .

# Criar diretórios necessários e definir permissões
RUN mkdir -p \
    /app/logs \
    /app/tmp \
    /home/nodeuser/.cache/puppeteer \
    && chown -R nodeuser:nodeuser /app \
    && chown -R nodeuser:nodeuser /home/nodeuser/.cache

# Configurar permissões do Chromium
RUN chmod 4755 /usr/bin/chromium

# Mudança de usuário (segurança)
USER nodeuser

# Verificar instalações
RUN node --version \
    && npm --version \
    && /usr/bin/chromium --version

# Exposição da porta
EXPOSE 8080

# Configurações finais de ambiente
ENV PORT=8080
ENV HOST=0.0.0.0

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Script de inicialização
CMD ["npm", "start"]

# ==============================================================================
# CONFIGURAÇÕES OPCIONAIS PARA DESENVOLVIMENTO
# ==============================================================================

# Para desenvolvimento, descomentar:
# ENV NODE_ENV=development
# ENV HEADLESS=false
# CMD ["npm", "run", "dev"]
