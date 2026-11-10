# syntax=docker/dockerfile:1
# ---------- Dependencias completas (compilación y desarrollo) ----------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- Desarrollo (docker-compose.dev.yml: recarga en caliente) ----------
FROM deps AS dev
ENV NODE_ENV=development
COPY . .
USER node
EXPOSE 4000
CMD ["npx", "tsx", "watch", "src/server.ts"]

# ---------- Compilación TypeScript → JavaScript ----------
FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY migrations ./migrations
COPY seeds ./seeds
RUN npm run build

# ---------- Dependencias de producción ----------
FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---------- Imagen final: mínima y sin root ----------
FROM node:20-alpine AS runtime
ENV NODE_ENV=production PORT=4000
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/src/server.js"]
