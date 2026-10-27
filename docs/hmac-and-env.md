# HMAC e env (Magi + bots)

## Segredo

1. Na Magi: `openssl rand -hex 32` → ``L2S_BUS_HMAC_SECRET` (alias `HMAC_SECRET`)` no `.env` (mode 600).
2. Mesmo valor nos bots (emit skill / perfil) via Vault / injeção documentada — **nunca** no git.
3. Rotação: gerar novo segredo, atualizar Magi + todos os bots, reiniciar api.

## Cabeçalho (contrato sugerido p/ Backend)

- `POST /v1/events`
- Header: `X-Bot-Signature: sha256=<hmac_hex>` do body raw com ``L2S_BUS_HMAC_SECRET` (alias `HMAC_SECRET`)`
- Body: evento canônico (ver ADR-002)
- Rejeitar: assinatura inválida, replay (`dedupe_key`), `from_agent_id` fora de ``L2S_BUS_ALLOWLIST``, flood

## Allowlist

``L2S_BUS_ALLOWLIST`` = CSV de agent IDs (time L2S Labs + Nuvi/outros). Manter alinhado ao Linear / roster do time.

## Paths no repo

| Path | Quem |
|------|------|
| `deploy/docker-compose.yml` | DevOps |
| `deploy/tailscale-box.md` | DevOps |
| `.env.example` | DevOps |
| `apps/api/**` | Backend |
| `apps/web/**` | Frontend |
