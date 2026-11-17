# CT Assessment 365 — portal (Next.js) · Azure Container Apps
# Build no Azure, sem Docker local:  az acr build -r <registro> -t ctassessment-portal:<tag> portal/

FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# dependências completas para compilar
FROM base AS build
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npx prisma generate && npx next build

# imagem final: só dependências de produção + build
FROM base AS runner
ENV NODE_ENV=production PORT=3000
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate && npm cache clean --force
COPY --from=build /app/.next ./.next
COPY next.config.mjs ./
COPY scripts ./scripts
# dashboard do coletor e schema dos bancos de clientes, lidos em runtime
COPY assets ./assets
COPY sql ./sql
RUN chown -R node:node /app
USER node
EXPOSE 3000
# aplica migrações, garante o administrador inicial (se configurado) e sobe o app
CMD ["sh", "scripts/start.sh"]
