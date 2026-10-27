# Magi Bot Panel API — multi-stage Go (CGO-free). Build context: apps/api/
FROM golang:1.27-alpine AS build
WORKDIR /src
RUN apk add --no-cache git ca-certificates
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/magi-api ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache curl ca-certificates su-exec \
  && adduser -D -H -u 10001 app
WORKDIR /app
COPY --from=build /out/magi-api /app/magi-api
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 0755 /usr/local/bin/docker-entrypoint.sh && mkdir -p /data && chown app:app /data
# Sem USER app: entrypoint inicia como root, faz chown do dir do DATABASE_PATH e dropa p/ app (10001) via su-exec
EXPOSE 8787
ENV BIND_ADDR=0.0.0.0:8787 \
    DATABASE_PATH=/data/events.sqlite
# L2S_BUS_HMAC_SECRET + L2S_BUS_ALLOWLIST required at runtime (Compose/.env)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8787/healthz || exit 1
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["/app/magi-api"]
