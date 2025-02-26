# Stage de base commune
FROM node:20-alpine as base

# Installation de pnpm et des dépendances système communes
RUN npm install -g pnpm && \
    apk add --no-cache python3 make g++ openssl openssl-dev

# Installation des outils globaux
RUN npm install -g pnpm nodemon ts-node typescript

WORKDIR /app

# Stage de dépendances
FROM base as deps

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/

# Installation des dépendances avec cache optimisé
RUN pnpm install
RUN pnpm prisma generate

# Stage de build
FROM deps as builder

COPY . .
RUN pnpm run build

# Stage de production
FROM base as production

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=deps /app/node_modules/.pnpm/@prisma+client@*/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/prisma ./prisma

RUN pnpm install --prod && \
    pnpm prisma generate

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node healthcheck.js

CMD ["node", "dist/server.js"]

# Stage de développement
FROM deps as development

ENV NODE_ENV=development
ENV PORT=3000

COPY . .

# Installation de toutes les dépendances, y compris ws et @types/ws
RUN pnpm install

EXPOSE 3000

# Commande de démarrage en développement
CMD ["pnpm", "run", "dev"]
