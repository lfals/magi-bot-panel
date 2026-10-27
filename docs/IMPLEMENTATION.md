# L2S-43 — implementação Backend (magi-bot-panel)

Repo: `github.com/lfals/magi-bot-panel`  
Issue: L2S-43 / L2S-54  
ADR: **ADR-002 rev.5** (feed global + waiting/pending; Tailscale-only; Cloudflare Tunnel rejeitado)

## Escopo Backend

- `apps/api` — ingest tipado + REST + WS + SQLite + presença efêmera
- `docs/openapi.yaml` — contrato (espelha este diretório)
- `docs/l2s-bus-emit.md` — skill emit

## Stack

- Go 1.24+ + `modernc.org/sqlite` (CGO-free) + `nhooyr.io/websocket`
- Pub/sub in-process (`hub`) para fan-out WS
- Presença/`sending`/`pending` em memória com TTL (`sending` ~12s; `pending` ~30 min)

## Env

| Var | Uso |
| --- | --- |
| `L2S_BUS_HMAC_SECRET` | HMAC ingest (obrigatório; `MAGI_DEV=1` só local) |
| `L2S_BUS_ALLOWLIST` | CSV agent UUIDs |
| `BIND_ADDR` | default `0.0.0.0:8787` (Compose/Docker); pode ser `:8080` local |
| `DATABASE_PATH` | `/data/events.sqlite` |
| `RATE_LIMIT_PER_MIN` | default 120 por agent |

**Nota:** `MAGI_PANEL_TOKEN` **removido** (Luis) — painel Tailscale-only; leitura REST/WS sem Bearer. HMAC+ALLOWLIST permanecem no ingest.

## Endpoints (ADR-002 rev.5)

| Método | Path | Notas |
| --- | --- | --- |
| `POST` | `/v1/events` | tipado: `message` \| `edge.sending` \| `edge.pending` \| `agent.status` \| `agent.heartbeat` |
| `GET` | `/v1/graph` | `{ agents[], edges[] }` — agents com `waiting`/`waiting_for_*`; edges com `sending` + `pending` |
| `GET` | `/v1/agents` | status dos nós |
| `GET` | `/v1/channels` | lista canais |
| `GET` | `/v1/channels/:id` | meta |
| `GET` | `/v1/messages` | **feed global** newest-first (`limit`/`before`/`since`/`channel_id`) |
| `GET` | `/v1/channels/:id/messages` | timeline por canal (inalterada; ASC) |
| `GET` | `/v1/stream` | WS |
| `GET` | `/healthz` | liveness |

**Não existe** `POST /v1/presence`. Presence vai no mesmo `/v1/events`. Sem tipo `feed.row` — FE deriva rows de estado.

## WS frames

- `hello` / `ping`
- `message` (não `message.created`) — inclui `channel_id`; limpa `sending` **e** `pending` da aresta
- `edge.sending` `{type, channel_id, from_agent_id}` — blink curto (~12s)
- `edge.pending` `{type, channel_id, from_agent_id, to_agent_id?}` — handoff aberto (~30 min TTL)
- `edge.idle` — clear sending e/ou pending (TTL ou pós-`message`)
- `agent.status` `{type, agent_id, status, status_text, waiting_for_agent_id?, waiting_for_name?}`

## Regras

1. DM `channel_id` = `sorted([a,b]).join(":")`
2. Group `channel_id` = `group_id`
3. Dedupe por `dedupe_key` em `message`
4. Allowlist em `from_agent_id` / `agent_id`
5. `sending` TTL ~12s → `edge.idle`
6. `pending` TTL ~30 min (ou clear em `message` / `edge.idle`) — distinct de sending
7. `agent.status` aceita `idle|busy|waiting|offline` + `waiting_for_*` quando `waiting`
8. Sem heartbeat / `last_seen_at` antigo → `offline`
9. Commits humanos `lfals` — sem push de bot

## Testes

```bash
cd apps/api && go mod tidy && go test ./...
```
