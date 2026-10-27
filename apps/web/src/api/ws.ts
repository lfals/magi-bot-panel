import { wsUrlWithToken } from '../auth/token'
import { USE_MOCKS, WS_URL } from '../config'
import type { WsClient, WsConnStatus, WsEvent } from '../types'

/**
 * Mock WS (somente USE_MOCKS / DEV) — hello + ping periódico.
 * Sem ciclo demo edge.sending/designer↔po (L2S-51).
 */
export function createMockWsClient(): WsClient {
  let status: WsConnStatus = 'disconnected'
  let timer: ReturnType<typeof setInterval> | null = null
  let onStatus: ((s: WsConnStatus) => void) | undefined

  const setStatus = (s: WsConnStatus) => {
    status = s
    onStatus?.(s)
  }

  return {
    getStatus() {
      return status
    },
    connect(onEvent: (event: WsEvent) => void, statusCb?) {
      onStatus = statusCb
      setStatus('connecting')
      const t0 = window.setTimeout(() => {
        setStatus('connected')
        onEvent({ type: 'hello', ts: new Date().toISOString() })
      }, 120)

      timer = setInterval(() => {
        onEvent({ type: 'ping', ts: new Date().toISOString() })
      }, 12_000)

      return () => {
        window.clearTimeout(t0)
        if (timer) clearInterval(timer)
        timer = null
        onStatus = undefined
        status = 'disconnected'
      }
    },
  }
}

/** Cliente WS real (produção Magi / Compose com VITE_USE_MOCKS=0). */
export function createWsClient(): WsClient {
  if (USE_MOCKS) return createMockWsClient()

  let status: WsConnStatus = 'disconnected'
  let ws: WebSocket | null = null
  let retry: ReturnType<typeof setTimeout> | null = null
  let intentionalClose = false
  let onStatus: ((s: WsConnStatus) => void) | undefined

  const setStatus = (s: WsConnStatus) => {
    status = s
    onStatus?.(s)
  }

  return {
    getStatus() {
      return status
    },
    connect(onEvent: (event: WsEvent) => void, statusCb?) {
      intentionalClose = false
      onStatus = statusCb

      const open = () => {
        setStatus('connecting')
        // Browser WebSocket não aceita Authorization — ?token= é o fallback documentado (L2S-49).
        ws = new WebSocket(wsUrlWithToken(WS_URL))
        ws.onopen = () => {
          setStatus('connected')
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
          setStatus('disconnected')
        }
        ws.onclose = () => {
          setStatus('disconnected')
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
        onStatus = undefined
        status = 'disconnected'
      }
    },
  }
}
