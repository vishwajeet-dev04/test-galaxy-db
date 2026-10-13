# Galaxy dashboard. Build context is the repo root (needs docker/nginx.conf):
#   docker build -f dashboard/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /src
COPY dashboard/package.json dashboard/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY dashboard/ ./
# .env.production only holds the public pk_ logo key; there are no secrets in the bundle.
RUN npm run build

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO /dev/null http://127.0.0.1/ || exit 1
