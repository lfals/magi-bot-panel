/** Placeholders até hostname Magi definitivo (Tailscale). */
const DEFAULT_API = 'http://magi.tailcfeeb7.ts.net:8787'
const DEFAULT_WS = 'ws://magi.tailcfeeb7.ts.net:8787/v1/stream'

export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ||
  DEFAULT_API

export const WS_URL =
  (import.meta.env.VITE_WS_URL as string | undefined) || DEFAULT_WS

/** Em DEV usamos mocks locais; API real ainda não sobe na Magi. */
export const USE_MOCKS =
  import.meta.env.VITE_USE_MOCKS !== '0' &&
  (import.meta.env.DEV || import.meta.env.VITE_USE_MOCKS === '1')
