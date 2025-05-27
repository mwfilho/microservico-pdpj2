# ===============================================================================
# DOCKERFILE - OTIMIZADO PARA PROJETO SEM package-lock.json
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
# INSTALAÇÃO DE DEPENDÊNCIAS (APENAS COM PACKAGE.JSON)
# ===============================================================================

# Copiar apenas package.json (não temos package-lock.json)
COPY package.json ./

# Verificar o que foi copiado
RUN echo "=========================================" && \
    echo "📋 INSTALAÇÃO SEM package-lock.json" && \
    echo "=========================================" && \
    echo "📁 Arquivos copiados:" && \
    ls -la /app && \
    echo "" && \
    echo "📄 Conteúdo do package.json:" && \
    cat /app/package.json && \
    echo "" && \
    echo "========================================="

# Usar npm install (único método possível sem package-lock.json)
RUN echo "🚀 Instalando dependências com npm install..." && \
    npm install --only=production --no-audit --no-fund && \
    echo "📦 Dependências instaladas:" && \
    ls /app/node_modules | head -10 && \
    echo "... (total: $(ls /app/node_modules | wc -l) pacotes)" && \
    npm cache clean --force && \
    echo "✅ Instalação concluída com sucesso!"

# ===============================================================================
# COPIAR CÓDIGO FONTE
# ===============================================================================

# Copiar TODO o código fonte
COPY . .

# ===============================================================================
# VERIFICAÇÕES FINAIS DA ESTRUTURA
# ===============================================================================
RUN echo "=========================================" && \
    echo "✅ VERIFICAÇÃO FINAL DA ESTRUTURA" && \
    echo "=========================================" && \
    echo "📁 Conteúdo completo de /app:" && \
    ls -la /app && \
    echo "" && \
    echo "📄 Verificando arquivos principais:" && \
    test -f /app/app.js && echo "✅ app.js encontrado" || echo "❌ app.js NÃO encontrado" && \
    test -f /app/package.json && echo "✅ package.json encontrado" || echo "❌ package.json NÃO encontrado" && \
    echo "" && \
    echo "📂 Verificando pastas:" && \
    test -d /app/routes && echo "✅ pasta routes/ encontrada" || echo "❌ pasta routes/ NÃO encontrada" && \
    test -d /app/services && echo "✅ pasta services/ encontrada" || echo "❌ pasta services/ NÃO encontrada" && \
    test -d /app/utils && echo "✅ pasta utils/ encontrada" || echo "❌ pasta utils/ NÃO encontrada" && \
    test -d /app/middleware && echo "✅ pasta middleware/ encontrada" || echo "❌ pasta middleware/ NÃO encontrada" && \
    echo "" && \
    echo "📋 Verificando módulos críticos:" && \
    test -d /app/node_modules/express && echo "✅ Express instalado" || echo "❌ Express FALTANDO" && \
    test -d /app/node_modules/puppeteer && echo "✅ Puppeteer instalado" || echo "❌ Puppeteer FALTANDO" && \
    test -d /app/node_modules/cors && echo "✅ CORS instalado" || echo "❌ CORS FALTANDO" && \
    test -d /app/node_modules/winston && echo "✅ Winston instalado" || echo "❌ Winston FALTANDO" && \
    echo "" && \
    echo "📦 Total de pacotes: $(ls /app/node_modules | wc -l)" && \
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

CMD ["node", "app.js"]
