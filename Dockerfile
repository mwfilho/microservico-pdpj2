FROM node:18-bullseye-slim

# Metadados
LABEL maintainer="mwfilho"
LABEL description="Microserviço de autenticação PJE TJPE"
LABEL version="1.0.0"

# Variáveis de ambiente
ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Instalar dependências do sistema
RUN apt-get update && apt-get install -y \
    wget ca-certificates chromium \
    fonts-liberation libappindicator3-1 \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 \
    libcairo2 libcups2 libdbus-1-3 libexpat1 \
    libfontconfig1 libgbm1 libglib2.0-0 \
    libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 \
    libpangocairo-1.0-0 libx11-6 libx11-xcb1 \
    libxcb1 libxcomposite1 libxcursor1 libxdamage1 \
    libxext6 libxfixes3 libxi6 libxrandr2 \
    libxrender1 libxss1 libxtst6 lsb-release xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Criar usuário não-root
RUN groupadd -r nodeuser && useradd -r -g nodeuser -G audio,video nodeuser

# Diretório de trabalho
WORKDIR /app

# Copiar package files
COPY package*.json ./

# Instalar dependências Node.js
RUN npm ci --only=production --no-audit --no-fund \
    && npm cache clean --force

# Copiar TODOS os arquivos do projeto (não só src/)
COPY . .

# Verificar estrutura de arquivos
RUN ls -la /app && \
    echo "=== Verificando arquivos principais ===" && \
    test -f /app/app.js && echo "✅ app.js encontrado" || echo "❌ app.js NÃO encontrado" && \
    test -f /app/package.json && echo "✅ package.json encontrado" || echo "❌ package.json NÃO encontrado" && \
    test -d /app/routes && echo "✅ pasta routes encontrada" || echo "❌ pasta routes NÃO encontrada" && \
    test -d /app/services && echo "✅ pasta services encontrada" || echo "❌ pasta services NÃO encontrada"

# Definir permissões
RUN chown -R nodeuser:nodeuser /app

# Mudança de usuário
USER nodeuser

# Port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Comando de start
CMD ["npm", "start"]
