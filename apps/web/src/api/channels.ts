import { API_BASE_URL, USE_MOCKS } from '../config'
import type {
  Channel,
  ChannelList,
  ChannelsApi,
  ListMessagesOpts,
  MessageList,
} from '../types'
import { CHANNEL_TITLES, MOCK_CHANNELS, MOCK_MESSAGES } from './mockData'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const channelsApi: ChannelsApi = {
  async listChannels(opts?: {
    limit?: number
    cursor?: string
  }): Promise<ChannelList> {
    if (USE_MOCKS) {
      await delay(40)
      return {
        items: MOCK_CHANNELS.map((c) => ({ ...c })),
        next_cursor: null,
      }
    }
    const q = new URLSearchParams()
    if (opts?.limit) q.set('limit', String(opts.limit))
    if (opts?.cursor) q.set('cursor', opts.cursor)
    const qs = q.toString()
    const res = await fetch(
      `${API_BASE_URL}/v1/channels${qs ? `?${qs}` : ''}`,
    )
    if (!res.ok) throw new Error(`GET /v1/channels → ${res.status}`)
    return (await res.json()) as ChannelList
  },

  async getChannel(channelId: string): Promise<Channel> {
    if (USE_MOCKS) {
      await delay(30)
      const ch = MOCK_CHANNELS.find((c) => c.channel_id === channelId)
      if (!ch) throw new Error(`channel ${channelId} not found`)
      return {
        ...ch,
        label: ch.label ?? CHANNEL_TITLES[channelId] ?? channelId,
      }
    }
    const res = await fetch(
      `${API_BASE_URL}/v1/channels/${encodeURIComponent(channelId)}`,
    )
    if (!res.ok) throw new Error(`GET /v1/channels/:id → ${res.status}`)
    return (await res.json()) as Channel
  },

  async listMessages(
    channelId: string,
    opts?: ListMessagesOpts,
  ): Promise<MessageList> {
    if (USE_MOCKS) {
      await delay(80)
      let items = (MOCK_MESSAGES[channelId] ?? []).map((m) => ({ ...m }))
      if (opts?.since) {
        const since = Date.parse(opts.since)
        items = items.filter((m) => Date.parse(m.ts) >= since)
      }
      if (opts?.before) {
        const before = Date.parse(opts.before)
        items = items.filter((m) => Date.parse(m.ts) < before)
      }
      const limit = opts?.limit ?? 100
      const sliced = items.slice(-limit)
      return {
        channel_id: channelId,
        items: sliced,
        next_before: null,
      }
    }
    const q = new URLSearchParams()
    if (opts?.since) q.set('since', opts.since)
    if (opts?.before) q.set('before', opts.before)
    if (opts?.limit) q.set('limit', String(opts.limit))
    const qs = q.toString()
    const res = await fetch(
      `${API_BASE_URL}/v1/channels/${encodeURIComponent(channelId)}/messages${qs ? `?${qs}` : ''}`,
    )
    if (!res.ok) throw new Error(`GET …/messages → ${res.status}`)
    return (await res.json()) as MessageList
  },
}
