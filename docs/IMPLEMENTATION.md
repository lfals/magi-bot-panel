# L2S-43 — implementação Backend (magi-bot-panel)

Repo: `github.com/lfals/magi-bot-panel`  
Issue: L2S-43  
ADR: **ADR-002 rev.4** (Tailscale-only; Cloudflare Tunnel rejeitado; grafo UX v7)

## Escopo Backend

- `apps/api` — ingest tipado + REST + WS + SQLite + presença efêmera
- `docs/openapi.yaml` — contrato (espelha este diretório)
- `docs/l2s-bus-emit.md` — skill emit

## Stack

- Go 1.24 + `modernc.org/sqlite` (CGO-free) + `nhooyr.io/websocket`
- Pub/sub in-process (`hub`) para fan-out WS
- Presença/`sending` em memória com TTL (~12s)

## Env

| Var | Uso |
| --- | --- |
| `L2S_BUS_HMAC_SECRET` | HMAC ingest (obrigatório; `MAGI_DEV=1` só local) |
| `L2S_BUS_ALLOWLIST` | CSV agent UUIDs |
| `MAGI_PANEL_TOKEN` | opcional auth WS/REST |
| `BIND_ADDR` | default `0.0.0.0:8787` (Compose/Docker); pode ser `:8080` local |
| `DATABASE_PATH` | `/data/events.sqlite` |
| `RATE_LIMIT_PER_MIN` | default 120 por agent |

## Endpoints (ADR-002 rev.4)

| Método | Path | Notas |
| --- | --- | --- |
| `POST` | `/v1/events` | tipado: `message` \| `edge.sending` \| `agent.status` \| `agent.heartbeat` |
| `GET` | `/v1/graph` | `{ agents[], edges[] }` |
| `GET` | `/v1/agents` | status dos nós |
| `GET` | `/v1/channels` | lista canais |
| `GET` | `/v1/channels/:id` | meta |
| `GET` | `/v1/channels/:id/messages` | timeline drawer |
| `GET` | `/v1/stream` | WS |
| `GET` | `/healthz` | liveness |

**Não existe** `POST /v1/presence`. Presence vai no mesmo `/v1/events`.

## WS frames

- `hello` / `ping`
- `message` (não `message.created`) — limpa `sending` da aresta
- `edge.sending` `{type, channel_id, from_agent_id}`
- `edge.idle` — TTL ou pós-`message`
- `agent.status` `{type, agent_id, status, status_text}` (não `bot.status`)

## Regras

1. DM `channel_id` = `sorted([a,b]).join(":")`
2. Group `channel_id` = `group_id`
3. Dedupe por `dedupe_key` em `message`
4. Allowlist em `from_agent_id` / `agent_id`
5. `sending` TTL ~12s → `edge.idle`
6. Sem heartbeat / `last_seen_at` antigo → `offline`
7. Commits humanos `lfals` — sem push de bot

## Testes

```bash
cd apps/api && go mod tidy && go test ./...
```
