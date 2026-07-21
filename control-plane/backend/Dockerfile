FROM node:18-alpine

WORKDIR /app

# Copiar apenas package.json e package-lock.json para otimizar cache
COPY package*.json ./

# Instalar dependências
RUN npm ci --omit=dev

# Copiar código
COPY src ./src

# Criar diretório de logs
RUN mkdir -p logs

# Executar migrations no startup (se necessário)
CMD ["npm", "start"]
