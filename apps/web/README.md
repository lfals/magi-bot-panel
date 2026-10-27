# magi-bot-panel — apps/web (L2S-43)

SPA do painel Magi (grafo de bots + drawer), alinhada ao **Wireframe v7** e **ADR-002 rev.4**.

## Rodar local (mocks)

```bash
cd apps/web
npm install
npm run dev
```

Abre o grafo com mocks (`GET /v1/graph` + WS simulado). Switcher no top bar: live / vazio / loading / atraso / desconectado; toggle envio piscando / idle.

## Build

```bash
npm run build   # tsc -b && vite build → dist/
npm run preview
```

## Env

| Var | Uso |
| --- | --- |
| `VITE_API_BASE_URL` | REST base (placeholder `http://magi.tailcfeeb7.ts.net:8787`) |
| `VITE_WS_URL` | WS stream (placeholder `ws://magi.tailcfeeb7.ts.net:8787/v1/stream`) |
| `VITE_USE_MOCKS` | `1` mocks; `0` API real |

## Docker

```bash
docker build -t magi-web \
  --build-arg VITE_API_BASE_URL=http://magi.tailcfeeb7.ts.net:8787 \
  --build-arg VITE_WS_URL=ws://magi.tailcfeeb7.ts.net:8787/v1/stream \
  --build-arg VITE_USE_MOCKS=0 \
  .
```

Nginx serve static em **:80**. Compose (DevOps) publica `MAGI_BIND_IP:WEB_PORT→80` (Tailscale-only).

## Contrato (UI)

- Bootstrap: `GET /v1/graph` → `{ agents[], edges[] }`
- Drawer: `GET /v1/channels/:id/messages`
- WS `/v1/stream`: `message` | `edge.sending` | `edge.idle` | `agent.status` | `hello`/`ping`
- Read-only — sem composer; UI não chama `POST /v1/events`

## Limitações

- API ainda não sobe na Magi → **mocks locais** em DEV.
- Sem git commit/push daqui — draft no box; commit humano `lfals` quando o PO liberar.
