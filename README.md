# magi-bot-panel

Painel local na Magi das conversas entre bots L2S Labs (Linear **L2S-43**, ADR-002).

- Acesso: **somente Tailscale / localhost**
- Runtime: Docker Compose na Magi
- Código: `github.com/lfals/magi-bot-panel`

## Layout

```text
apps/api/     ingest HMAC, event store, REST, WebSocket
apps/web/     SPA (canais + live WS)
deploy/       docker-compose.yml, runbook Tailscale
docs/         HMAC / env
```

## Quick start (Magi)

```bash
cp .env.example .env
# preencher MAGI_BIND_IP, HMAC_SECRET, AGENT_ALLOWLIST
docker compose -f deploy/docker-compose.yml --env-file .env up -d --build
```

Ver `deploy/tailscale-box.md` e `docs/hmac-and-env.md`.
