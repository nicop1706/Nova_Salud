# syntax=docker/dockerfile:1
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Desarrollo (docker-compose.dev.yml)
FROM deps AS dev
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev"]

FROM deps AS build
COPY . .
RUN npx vite build

# Nginx sin root: sirve el SPA y reenvía /api al backend
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
