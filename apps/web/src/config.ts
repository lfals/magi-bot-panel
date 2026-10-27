/** Same-origin por padrão (nginx → api). Override só via VITE_* no build. */
function defaultWsUrl(): string {
  if (typeof window === 'undefined') return '/v1/stream'
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/v1/stream`
}

export const API_BASE_URL = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ??
  ''
)

export const WS_URL =
  (import.meta.env.VITE_WS_URL as string | undefined) || defaultWsUrl()

/** Em DEV usamos mocks locais; produção (Compose) força VITE_USE_MOCKS=0. */
export const USE_MOCKS =
  import.meta.env.VITE_USE_MOCKS !== '0' &&
  (import.meta.env.DEV || import.meta.env.VITE_USE_MOCKS === '1')
