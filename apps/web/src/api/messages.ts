import { authHeaders } from '../auth/token'
import { API_BASE_URL, USE_MOCKS } from '../config'
import type {
  GlobalMessageList,
  ListGlobalMessagesOpts,
  Message,
  MessagesApi,
} from '../types'
import { MOCK_MESSAGES } from './mockData'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

function authFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(input, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers ?? {}) },
  })
}

/**
 * GET /v1/messages — seed do feed global (ADR-002 rev.5).
 * Seed do feed global (ADR-002 rev.5 / L2S-54).
 */
export const messagesApi: MessagesApi = {
  async listGlobalMessages(
    opts?: ListGlobalMessagesOpts,
  ): Promise<GlobalMessageList> {
    if (USE_MOCKS) {
      await delay(60)
      const all: Message[] = Object.values(MOCK_MESSAGES)
        .flat()
        .map((m) => ({ ...m }))
      all.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
      let items = all
      if (opts?.channel_id) {
        items = items.filter((m) => m.channel_id === opts.channel_id)
      }
      if (opts?.before) {
        const before = Date.parse(opts.before)
        items = items.filter((m) => Date.parse(m.ts) < before)
      }
      const limit = opts?.limit ?? 50
      const sliced = items.slice(0, limit)
      const next =
        sliced.length === limit && items.length > limit
          ? sliced[sliced.length - 1]!.ts
          : null
      return { items: sliced, next_before: next }
    }

    const q = new URLSearchParams()
    if (opts?.limit) q.set('limit', String(opts.limit))
    if (opts?.before) q.set('before', opts.before)
    if (opts?.channel_id) q.set('channel_id', opts.channel_id)
    const qs = q.toString()
    const res = await authFetch(
      `${API_BASE_URL}/v1/messages${qs ? `?${qs}` : ''}`,
    )
    if (!res.ok) {
      if (res.status === 401) {
        throw new Error(
          'GET /v1/messages → 401 (token ausente ou inválido — abra com ?token=… ou cole no banner)',
        )
      }
      throw new Error(`GET /v1/messages → ${res.status}`)
    }
    return (await res.json()) as GlobalMessageList
  },
}
