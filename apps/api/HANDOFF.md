# HANDOFF — apps/api (L2S-43 · ADR-002 rev.5 / L2S-54)

Draft local em `/workspace/magi-bot-panel/apps/api`. **Não** há push/PR de bot. Commit como humano **`lfals`**.

## O que mudou (rev.5 / L2S-54)

- `GET /v1/messages?limit=&before=&since=&channel_id=` — feed global **newest-first** (`{items, next_before}`)
- Ingest tipado: `message` | `edge.sending` | **`edge.pending`** | `agent.status` | `agent.heartbeat`
- `agent.status`: `idle|busy|waiting|offline` + `waiting_for_agent_id` / `waiting_for_name` / `status_text`
- Graph edges: `sending` (TTL ~12s) **e** `pending` (TTL ~30 min); message limpa ambos → `edge.idle`
- WS global já fan-out `message` com `channel_id` (FE prepend); sem tipo `feed.row`
- Painel Tailscale-only — **sem** `MAGI_PANEL_TOKEN`
- Docs: `docs/openapi.yaml` 0.3.0, `docs/IMPLEMENTATION.md`, este HANDOFF

## Testes (PASS)

```bash
cd /workspace/magi-bot-panel/apps/api
go test ./...
```

## Env (Magi / Compose)

```
L2S_BUS_HMAC_SECRET=...
L2S_BUS_ALLOWLIST=<uuid>,<uuid>
BIND_ADDR=0.0.0.0:8787
DATABASE_PATH=/data/events.sqlite
# MAGI_PANEL_TOKEN: REMOVIDO — Tailscale-only
```

## Commit (Luis / humano `lfals`)

```bash
cd /workspace/magi-bot-panel   # após sync pro clone git
git add apps/api docs
git commit -m "feat(api): ADR-002 rev.5 feed global + waiting/pending (L2S-54)"
# push só com identidade humana lfals — sem bot
```

## Fora deste draft

- Sem push/PR bot · Sem Cloudflare Tunnel · Frontend React intocado · Sem feed.row
