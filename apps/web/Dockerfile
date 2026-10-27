# Magi Bot Panel SPA — multi-stage Vite → nginx:80
# Compose: MAGI_BIND_IP:WEB_PORT → container :80 (Tailscale-only)

FROM node:22-alpine AS build
WORKDIR /src

ARG VITE_API_BASE_URL=http://magi.tailcfeeb7.ts.net:8787
ARG VITE_WS_URL=ws://magi.tailcfeeb7.ts.net:8787/v1/stream
ARG VITE_USE_MOCKS=0
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_WS_URL=$VITE_WS_URL \
    VITE_USE_MOCKS=$VITE_USE_MOCKS

COPY package.json package-lock.json* ./
RUN npm ci || npm install
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
CMD ["nginx", "-g", "daemon off;"]
