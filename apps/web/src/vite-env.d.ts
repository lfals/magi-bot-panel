/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_WS_URL?: string
  readonly VITE_USE_MOCKS?: string
  /** Override DEV opcional — nunca commitar valor real. Preferir ?token= → localStorage. */
  readonly VITE_MAGI_PANEL_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
