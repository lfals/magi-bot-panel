# Tailscale: box Grok Bot → Magi (L2S-43)

Rede **100% privada**. Sem Cloudflare Tunnel, Funnel ou porta pública.

## Topologia

```text
[bots + collector no box]
        │  Tailscale (userspace / sidecar)
        │  MagicDNS → magi:<API_PORT>
        ▼
[Magi] ingest-api + rest + ws  bind APENAS 100.x / lo
        ▲
[Browser Luis] ← Tailscale → SPA (WEB_PORT)
```

## Magi

1. Instalar Tailscale; anotar `tailscale ip -4` → `MAGI_BIND_IP` no `.env`.
2. Subir Compose: `docker compose -f deploy/docker-compose.yml --env-file .env up -d`.
3. Confirmar que as portas **não** escutam em `0.0.0.0` público (`ss -tlnp` / firewall).
4. MagicDNS: documentar hostname estável (ex. `magi`) e URL de ingest:
   `http://magi.tailcfeeb7.ts.net:8787/v1/events` (ou IP `100.77.52.14`; alias MagicDNS `magi`).

## Box (collector / emit)

1. Sidecar Tailscale em **userspace networking** (preferência) com:
   - auth key **reutilizável + ephemeral**
   - hostname `grok-box-l2s`
   - tag ACL `tag:grok-box`
2. ACL Tailscale: `tag:grok-box` → **somente** `magi:8787` (ingest/API). Sem acesso amplo.
3. Emit skill e collector usam `INGEST_URL` do env (MagicDNS), com **HMAC**.
4. Após “Update Bot’s Computer” / reset do box: rejoin via auth key no boot; smoke-test:
   ```bash
   tailscale status
   curl -fsS -X POST "$INGEST_URL" -H "X-Signature: …" -d '{}'
   ```

## Fallback ops (só se Tailscale-no-box for bloqueado)

`ssh magi 'curl -X POST http://127.0.0.1:8787/v1/events …'` — SSH já só Tailscale. Não é o desenho principal.

## Explicitamente fora

Cloudflare Tunnel, Tailscale Funnel, ingress público, webhook na internet.
