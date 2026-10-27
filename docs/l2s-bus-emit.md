# Contrato skill `l2s-bus-emit` (L2S-43 · ADR-002 rev.4)

Skill compartilhada do time L2S Labs (+ Nuvi): emitir eventos tipados para o painel Magi.

## Endpoint

`POST {L2S_BUS_INGEST_URL}` (ex.: `http://magi:8787/v1/events`)

- Content-Type: `application/json`
- Body: envelope discriminado por `type` (ver `openapi.yaml`)
- Sem `POST /v1/presence` — tudo passa por `/v1/events`

## Autenticação HMAC

Env: `L2S_BUS_HMAC_SECRET` (mesmo segredo na Magi).

| Header | Valor |
| --- | --- |
| `X-L2S-Timestamp` | unix seconds |
| `X-L2S-Signature` | hex(HMAC-SHA256(secret, `{timestamp}.{raw_body}`)) |

Rejeição se skew > 300s ou assinatura inválida.

## Sequência UX v7 (blink da aresta)

1. **Antes/ao** `SendToAgent`: emitir `edge.sending`
2. **Ao concluir** o texto: emitir `message` (limpa blink no server + WS)
3. Opcional: `agent.status` / `agent.heartbeat` para texto no nó

Collector/catch-up (`transcript_tail`, `readtranscript_catchup`) só geram `message`.

## Payloads

### `edge.sending`

```json
{
  "type": "edge.sending",
  "from_agent_id": "<seu agent id>",
  "from_name": "Backend",
  "to_agent_id": "<dest>",
  "channel_type": "dm",
  "dedupe_key": "sending:<channel>:<from>:<coarse_ts>"
}
```

Grupo: use `group_id` + `channel_type: "group"` (ou `channel_id` = group id).

### `message`

```json
{
  "type": "message",
  "channel_type": "dm",
  "from_agent_id": "<seu agent id>",
  "from_name": "Backend",
  "to_agent_id": "<destinatário>",
  "priority": true,
  "body": "texto da mensagem",
  "source": "emit",
  "dedupe_key": "<sha256 estável>"
}
```

### `agent.status`

```json
{
  "type": "agent.status",
  "agent_id": "<seu agent id>",
  "status": "busy",
  "status_text": "enviando pra Designer",
  "dedupe_key": "status:<agent>:<status>:<coarse_ts>"
}
```

`status`: `idle` | `busy` | `offline`. `status_text` é o que o nó mostra.

### `agent.heartbeat`

```json
{
  "type": "agent.heartbeat",
  "agent_id": "<seu agent id>",
  "name": "Backend"
}
```

Sem heartbeat por ~5 min → server projeta `offline`.

## `dedupe_key` (messages)

`sha256_hex(from_agent_id + "|" + (to_agent_id|group_id) + "|" + channel_type + "|" + ts_trunc_to_second + "|" + body)`

Idempotência: mesmo `dedupe_key` → `202` com `duplicate: true`, sem segundo fan-out WS.

## Respostas

| Status | Significado |
| --- | --- |
| 202 | Aceito (`duplicate` true/false em messages) |
| 401 | HMAC |
| 403 | allowlist |
| 429 | rate limit |

Falha de emit **não** deve bloquear o trabalho do bot (best-effort).

## Allowlist

Só agents em `L2S_BUS_ALLOWLIST` (CSV de UUIDs) na Magi.
