import { wsUrlWithToken } from '../auth/token'
import { USE_MOCKS, WS_URL } from '../config'
import type { WsClient, WsConnStatus, WsEvent } from '../types'

/**
 * Mock WS /v1/stream — sequência demo: edge.sending → message + agent.status.
 * Cliente real: WebSocket(WS_URL) parseando o mesmo envelope.
 */
export function createMockWsClient(): WsClient {
  let status: WsConnStatus = 'disconnected'
  let timer: ReturnType<typeof setInterval> | null = null
  let phase = 0

  return {
    getStatus() {
      return status
    },
    connect(onEvent: (event: WsEvent) => void) {
      status = 'connecting'
      const t0 = window.setTimeout(() => {
        status = 'connected'
        onEvent({ type: 'hello', ts: new Date().toISOString() })
      }, 120)

      // Ciclo demo ~12s: sending → message (clear) → idle status
      timer = setInterval(() => {
        phase = (phase + 1) % 12
        const ts = new Date().toISOString()

        if (phase === 1) {
          onEvent({
            type: 'edge.sending',
            ts,
            channel_id: 'designer:po',
            from_agent_id: 'po',
            dedupe_key: `sending:designer:po:po:${phase}`,
          })
          onEvent({
            type: 'agent.status',
            ts,
            agent_id: 'po',
            status: 'busy',
            status_text: 'enviando pra Designer',
          })
          onEvent({
            type: 'agent.status',
            ts,
            agent_id: 'designer',
            status: 'busy',
            status_text: 'aguardando PO',
          })
        } else if (phase === 5) {
          onEvent({
            type: 'message',
            event: {
              event_id: `mock-${Date.now()}`,
              ts,
              channel_type: 'dm',
              channel_id: 'designer:po',
              from_agent_id: 'po',
              from_name: 'PO',
              to_agent_id: 'designer',
              body: 'Mock live: aresta limpa após message (ADR-002).',
              source: 'emit',
              dedupe_key: `mock-msg-${Date.now()}`,
            },
          })
          onEvent({
            type: 'agent.status',
            ts,
            agent_id: 'po',
            status: 'idle',
            status_text: 'idle',
          })
          onEvent({
            type: 'agent.status',
            ts,
            agent_id: 'designer',
            status: 'idle',
            status_text: 'idle',
          })
        } else if (phase === 9) {
          onEvent({ type: 'ping', ts })
        }
      }, 1000)

      return () => {
        window.clearTimeout(t0)
        if (timer) clearInterval(timer)
        timer = null
        status = 'disconnected'
      }
    },
  }
}

/** Cliente WS real (quando Magi estiver no ar). */
export function createWsClient(): WsClient {
  if (USE_MOCKS) return createMockWsClient()

  let status: WsConnStatus = 'disconnected'
  let ws: WebSocket | null = null
  let retry: ReturnType<typeof setTimeout> | null = null
  let intentionalClose = false

  return {
    getStatus() {
      return status
    },
    connect(onEvent: (event: WsEvent) => void) {
      intentionalClose = false

      const open = () => {
        status = 'connecting'
        // Browser WebSocket não aceita Authorization — ?token= é o fallback documentado (L2S-49).
        ws = new WebSocket(wsUrlWithToken(WS_URL))
        ws.onopen = () => {
          status = 'connected'
        }
        ws.onmessage = (ev) => {
          try {
            const data = JSON.parse(String(ev.data)) as WsEvent
            onEvent(data)
          } catch {
            /* ignore malformed */
          }
        }
        ws.onerror = () => {
          status = 'disconnected'
        }
        ws.onclose = () => {
          status = 'disconnected'
          if (!intentionalClose) {
            retry = setTimeout(open, 2000)
          }
        }
      }

      open()

      return () => {
        intentionalClose = true
        if (retry) clearTimeout(retry)
        ws?.close()
        ws = null
        status = 'disconnected'
      }
    },
  }
}
