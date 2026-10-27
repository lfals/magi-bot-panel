/** Chave localStorage do painel Magi (Tailscale). Nunca commitar o valor do token. */
export const PANEL_TOKEN_STORAGE_KEY = 'magi_panel_token'

const QUERY_KEYS = ['token', 'panel_token'] as const

/**
 * Na carga: se a URL tiver ?token= ou ?panel_token=, grava em localStorage
 * e remove da query (history.replaceState) para não vazar em share/histórico.
 * Preferência PO/Ciber: localStorage/query; VITE_MAGI_PANEL_TOKEN só override DEV.
 */
export function captureTokenFromUrl(): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  let captured: string | null = null
  for (const key of QUERY_KEYS) {
    const v = url.searchParams.get(key)
    if (v && v.trim()) {
      captured = v.trim()
      url.searchParams.delete(key)
    }
  }
  if (captured) {
    try {
      window.localStorage.setItem(PANEL_TOKEN_STORAGE_KEY, captured)
    } catch {
      /* private mode / quota */
    }
    const next = `${url.pathname}${url.search}${url.hash}`
    window.history.replaceState(window.history.state, '', next || '/')
  }
}

/** Lê token: localStorage primeiro; fallback DEV via VITE_MAGI_PANEL_TOKEN (sem default). */
export function getPanelToken(): string | null {
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(PANEL_TOKEN_STORAGE_KEY)
      if (stored && stored.trim()) return stored.trim()
    } catch {
      /* ignore */
    }
  }
  const env = import.meta.env.VITE_MAGI_PANEL_TOKEN as string | undefined
  if (env && env.trim()) return env.trim()
  return null
}

export function setPanelToken(token: string): void {
  const t = token.trim()
  if (!t) return
  try {
    window.localStorage.setItem(PANEL_TOKEN_STORAGE_KEY, t)
  } catch {
    /* ignore */
  }
}

export function clearPanelToken(): void {
  try {
    window.localStorage.removeItem(PANEL_TOKEN_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/** Header Authorization: Bearer … quando houver token (REST sempre Bearer). */
export function authHeaders(): HeadersInit {
  const token = getPanelToken()
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

/**
 * URL do WS com ?token= — fallback documentado porque `new WebSocket(url)`
 * no browser não aceita headers custom. REST continua só Bearer.
 */
export function wsUrlWithToken(baseWsUrl: string): string {
  const token = getPanelToken()
  if (!token) return baseWsUrl
  const url = new URL(baseWsUrl)
  if (!url.searchParams.has('token')) {
    url.searchParams.set('token', token)
  }
  return url.toString()
}
