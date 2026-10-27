# HANDOFF — apps/api (L2S-43 · ADR-002 rev.4)

Draft local em `/workspace/magi-bot-panel/apps/api`. **Não** há push/PR de bot. Commit como humano **`lfals`**.

## O que mudou (vs scaffold)

- Ingest tipado em `POST /v1/events`: `message` | `edge.sending` | `agent.status` | `agent.heartbeat`
  - **Sem** `POST /v1/presence`
- `GET /v1/graph` → `{ agents[], edges[] }` (não `nodes`)
- `GET /v1/agents`, `GET /v1/channels/:id`
- WS: `message` (não `message.created`), `edge.sending`, `edge.idle`, `agent.status`, `hello`/`ping`
- Presença/`sending` em memória (`internal/presence`) com TTL ~12s; offline por `last_seen_at` stale (~5 min)
- **`go.mod` + `go.sum`** via `go mod tidy` (Dockerfile `COPY go.mod go.sum` ok)
- Dockerfile: multi-stage, `EXPOSE 8787`, `USER app` (uid 10001), `HEALTHCHECK /healthz`, `DATABASE_PATH=/data/events.sqlite`, base `golang:1.27-alpine` (go.mod `go 1.26.0`)
- Docs espelhados: `docs/openapi.yaml`, `docs/l2s-bus-emit.md`, `docs/IMPLEMENTATION.md` ↔ `/workspace/l2s-43-contracts/`

## Testes (PASS)

```bash
cd /workspace/magi-bot-panel/apps/api
go mod tidy
go test ./...
```

## Docker build (contexto = `apps/api`)

```bash
cd /workspace/magi-bot-panel/apps/api
docker build -t magi-api:local .
# Nota: docker CLI não estava disponível no box de draft; validar na Magi/DevOps.
```

## Env (Magi / Compose)

```
L2S_BUS_HMAC_SECRET=...
L2S_BUS_ALLOWLIST=<uuid>,<uuid>
BIND_ADDR=0.0.0.0:8787
DATABASE_PATH=/data/events.sqlite
# opcional: MAGI_PANEL_TOKEN, RATE_LIMIT_PER_MIN
```

## Commit (Luis / humano `lfals`)

```bash
cd /workspace/magi-bot-panel   # após sync pro clone git
git add apps/api docs
git commit -m "feat(api): ADR-002 rev.4 graph + typed ingest + go.sum"
# push só com identidade humana lfals — sem bot
```

## Fora deste draft

- Sem push/PR bot · Sem Cloudflare Tunnel · Frontend React intocado

## L2S-43 — volume `/data` ownership

- `docker-entrypoint.sh`: se root, `chown -R app:app $(dirname $DATABASE_PATH)` e `su-exec app:app` no server; se não-root, só `exec`.
- Dockerfile: `su-exec` instalado, `USER app` removido (drop feito no entrypoint), `ENTRYPOINT` + `CMD` mantidos; EXPOSE/HEALTHCHECK iguais.
- `chown 10001` manual na Magi vira desnecessário após rebuild.
