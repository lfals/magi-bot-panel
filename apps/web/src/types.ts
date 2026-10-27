/** ADR-002 rev.5 — tipos canônicos (feed global + waiting/pending). */

export type ChannelType = 'dm' | 'group'

export type AgentStatus = 'idle' | 'busy' | 'waiting' | 'offline'

/**
 * Shell / overlay state derived from real WS + graph load (não demos).
 * StatusPill usa WsConnStatus; data-state no App usa este tipo.
 */
export type PanelUiState =
  | 'live'
  | 'empty'
  | 'loading'
  | 'delayed'
  | 'disconnected'

export type Agent = {
  agent_id: string
  name: string
  status: AgentStatus
  /** Texto no retângulo do nó — só da API, sem inventar. */
  status_text: string
  waiting_for_agent_id?: string | null
  waiting_for_name?: string | null
  /** OpenAPI: nullable date-time. */
  last_seen_at: string | null
  /** Só UI — role uppercase no card (não vem da API). */
  role?: string
}

/** Aresta do grafo (GET /v1/graph). ≠ Channel. */
export type Edge = {
  channel_id: string
  channel_type: ChannelType
  participant_ids: string[]
  label?: string
  last_message_at: string | null
  last_preview?: string
  sending: boolean
  sending_from_agent_id?: string | null
  pending: boolean
  pending_from_agent_id?: string | null
  pending_to_agent_id?: string | null
}

export type GraphSnapshot = {
  agents: Agent[]
  edges: Edge[]
}

export type ChannelParticipant = {
  agent_id: string
  name: string
}

/** Meta de canal (GET /v1/channels, GET /v1/channels/:id). ≠ Edge. */
export type Channel = {
  channel_id: string
  channel_type: ChannelType
  participants?: ChannelParticipant[]
  group_id?: string | null
  label?: string
  last_ts: string
  last_preview: string
  message_count?: number
}

export type ChannelList = {
  items: Channel[]
  next_cursor?: string | null
}

/** MessageEvent no OpenAPI / ADR-002. */
export type Message = {
  event_id: string
  ts: string
  channel_type: ChannelType
  channel_id: string
  from_agent_id: string
  /** OpenAPI: nullable. */
  from_name?: string | null
  to_agent_id?: string | null
  group_id?: string | null
  priority?: boolean
  body: string
  source: 'emit' | 'transcript_tail' | 'readtranscript_catchup'
  dedupe_key: string
}

/** Timeline por canal (GET /v1/channels/:id/messages). */
export type MessageList = {
  channel_id: string
  items: Message[]
  next_before?: string | null
}

/** Feed global (GET /v1/messages) — ADR-002 rev.5. */
export type GlobalMessageList = {
  items: Message[]
  next_before?: string | null
}

export type ListMessagesOpts = {
  since?: string
  before?: string
  limit?: number
}

export type ListGlobalMessagesOpts = {
  limit?: number
  before?: string
  channel_id?: string
}

/* —— WS /v1/stream (ADR-002 rev.5; NÃO usar message.created) ——
 * Backend Go: message frame = { type: 'message', event: MessageEvent }
 */

export type WsHello = { type: 'hello'; ts?: string }
export type WsPing = { type: 'ping'; ts?: string }

export type WsMessage = {
  type: 'message'
  event: Message
}

export type WsEdgeSending = {
  type: 'edge.sending'
  ts?: string
  channel_id: string
  from_agent_id: string
  dedupe_key?: string
}

export type WsEdgePending = {
  type: 'edge.pending'
  ts?: string
  channel_id: string
  from_agent_id: string
  to_agent_id: string
  dedupe_key?: string
}

export type WsEdgeIdle = {
  type: 'edge.idle'
  ts?: string
  channel_id: string
}

export type WsAgentStatus = {
  type: 'agent.status'
  ts?: string
  agent_id: string
  status: AgentStatus
  status_text: string
  waiting_for_agent_id?: string | null
  waiting_for_name?: string | null
  channel_id?: string | null
  dedupe_key?: string
}

export type WsEvent =
  | WsHello
  | WsPing
  | WsMessage
  | WsEdgeSending
  | WsEdgePending
  | WsEdgeIdle
  | WsAgentStatus

export type WsConnStatus = 'connected' | 'connecting' | 'disconnected' | 'lag'

/** Row de estado no feed — só FE, derivado de agent.status / edge.pending. */
export type FeedStateKind = 'waiting' | 'busy' | 'resolved' | 'stale'

export type FeedStateRow = {
  kind: 'state'
  id: string
  state: FeedStateKind
  channel_id: string | null
  from_name: string
  to_name: string | null
  body: string
  ts: string
}

export type FeedMsgRow = {
  kind: 'msg'
  message: Message
}

export type FeedRow = FeedMsgRow | FeedStateRow

export type GraphApi = {
  getGraph(): Promise<GraphSnapshot>
}

export type ChannelsApi = {
  listChannels(opts?: {
    limit?: number
    cursor?: string
  }): Promise<ChannelList>
  getChannel(channelId: string): Promise<Channel>
  listMessages(
    channelId: string,
    opts?: ListMessagesOpts,
  ): Promise<MessageList>
}

export type MessagesApi = {
  listGlobalMessages(opts?: ListGlobalMessagesOpts): Promise<GlobalMessageList>
}

export type WsClient = {
  connect(
    onEvent: (event: WsEvent) => void,
    onStatus?: (status: WsConnStatus) => void,
  ): () => void
  getStatus(): WsConnStatus
}
