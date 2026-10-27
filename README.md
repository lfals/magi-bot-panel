# magi-bot-panel

Painel local Magi das conversas entre bots ([L2S-43](https://linear.app/felpszip/issue/L2S-43/painel-local-em-tempo-real-das-conversas-dos-bots-l2s-labs)). **Só Tailscale** (ADR-002).

```
apps/api   — ingest + REST + WS (Go)
apps/web   — SPA grafo v7 (Vite/React/TS)
deploy/    — Compose Tailscale-only + notas box
docs/      — OpenAPI + emit + implementação
```

## Magi (runtime)

```bash
# na Magi (SSH: felps@magi)
cp .env.example .env && chmod 600 .env   # preencher L2S_BUS_HMAC_SECRET + ALLOWLIST
export MAGI_BIND_IP=$(tailscale ip -4)   # 100.77.52.14
docker compose -f deploy/docker-compose.yml --env-file .env up -d --build
```

Bind host: `MAGI_BIND_IP:8787` (API) e `MAGI_BIND_IP:8080` (web). Ver `deploy/tailscale-box.md`.

## Dev

- API: `cd apps/api && go test ./...`
- Web: `cd apps/web && npm ci && npm run dev` (mocks locais)

Commits: identidade humana `lfals` + assinatura SSH (sem bot co-author).
