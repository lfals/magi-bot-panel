import { useCallback, useEffect, useMemo, useState } from 'react'
import { graphApi } from '../api/graph'
import { messagesApi } from '../api/messages'
import { createWsClient } from '../api/ws'
import type {
  Agent,
  Edge,
  FeedRow,
  FeedStateRow,
  Message,
  PanelUiState,
  WsConnStatus,
  WsEvent,
} from '../types'
import {
  apiChannelIdFromLayout,
  displayNameForAgent,
  layoutSlug,
} from '../layout/agentMap'

function reduceAgents(agents: Agent[], event: WsEvent): Agent[] {
  if (event.type !== 'agent.status') return agents
  return agents.map((a) =>
    a.agent_id === event.agent_id
      ? {
          ...a,
          status: event.status,
          status_text: event.status_text,
          waiting_for_agent_id: event.waiting_for_agent_id ?? null,
          waiting_for_name: event.waiting_for_name ?? null,
          last_seen_at: event.ts ?? a.last_seen_at,
        }
      : a,
  )
}

function clearPendingFields(e: Edge): Edge {
  return {
    ...e,
    pending: false,
    pending_from_agent_id: null,
    pending_to_agent_id: null,
  }
}

function clearSendingFields(e: Edge): Edge {
  return {
    ...e,
    sending: false,
    sending_from_agent_id: null,
  }
}

function reduceEdges(edges: Edge[], event: WsEvent): Edge[] {
  switch (event.type) {
    case 'edge.sending':
      return edges.map((e) =>
        e.channel_id === event.channel_id
          ? {
              ...e,
              sending: true,
              sending_from_agent_id: event.from_agent_id,
            }
          : e,
      )
    case 'edge.pending':
      return edges.map((e) =>
        e.channel_id === event.channel_id
          ? {
              ...e,
              pending: true,
              pending_from_agent_id: event.from_agent_id,
              pending_to_agent_id: event.to_agent_id,
            }
          : e,
      )
    case 'edge.idle':
      return edges.map((e) =>
        e.channel_id === event.channel_id
          ? clearPendingFields(clearSendingFields(e))
          : e,
      )
    case 'message': {
      const msg = event.event
      return edges.map((e) => {
        if (e.channel_id !== msg.channel_id) return e
        let next = clearSendingFields({
          ...e,
          last_message_at: msg.ts,
          last_preview: msg.body.slice(0, 80),
        })
        // ADR: se from == pending_to no canal, limpa pending
        if (
          next.pending &&
          next.pending_to_agent_id &&
          (msg.from_agent_id === next.pending_to_agent_id ||
            layoutSlug(msg.from_agent_id) ===
              layoutSlug(next.pending_to_agent_id ?? ''))
        ) {
          next = clearPendingFields(next)
        }
        return next
      })
    }
    default:
      return edges
  }
}

/** Overlay do shell a partir de WS real + carga do grafo (sem demos). */
function deriveUiState(
  wsStatus: WsConnStatus,
  graphLoaded: boolean,
  graphFailed: boolean,
  agentCount: number,
): PanelUiState {
  if (graphFailed || wsStatus === 'disconnected') return 'disconnected'
  if (wsStatus === 'lag') return 'delayed'
  if (!graphLoaded || wsStatus === 'connecting') return 'loading'
  if (agentCount === 0) return 'empty'
  return 'live'
}

function sameAgent(a: string, b: string): boolean {
  if (a === b) return true
  const sa = layoutSlug(a)
  const sb = layoutSlug(b)
  return Boolean(sa && sb && sa === sb)
}

function agentInParticipants(agentId: string, participantIds: string[]): boolean {
  return participantIds.some((p) => sameAgent(p, agentId))
}

/** Rows de estado FE-only a partir de waiting/busy/pending ativos. */
function deriveStateRows(agents: Agent[], edges: Edge[]): FeedStateRow[] {
  const rows: FeedStateRow[] = []
  const now = new Date().toISOString()

  for (const a of agents) {
    if (a.status === 'waiting') {
      const waitName =
        a.waiting_for_name?.trim() ||
        (a.waiting_for_agent_id
          ? displayNameForAgent(a.waiting_for_agent_id)
          : null)
      const edge =
        edges.find(
          (e) =>
            e.pending &&
            e.pending_from_agent_id &&
            sameAgent(e.pending_from_agent_id, a.agent_id),
        ) ??
        edges.find((e) => agentInParticipants(a.agent_id, e.participant_ids))
      rows.push({
        kind: 'state',
        id: `state-wait-${a.agent_id}`,
        state: 'waiting',
        channel_id: edge?.channel_id ?? null,
        from_name: displayNameForAgent(a.agent_id, a.name),
        to_name: waitName,
        body: waitName
          ? `Aguardando resposta de ${waitName} (handoff aberto).`
          : a.status_text || 'Aguardando…',
        ts: a.last_seen_at ?? now,
      })
    } else if (a.status === 'busy') {
      const edge =
        edges.find(
          (e) =>
            e.pending &&
            e.pending_to_agent_id &&
            sameAgent(e.pending_to_agent_id, a.agent_id),
        ) ?? null
      rows.push({
        kind: 'state',
        id: `state-busy-${a.agent_id}`,
        state: 'busy',
        channel_id: edge?.channel_id ?? null,
        from_name: displayNameForAgent(a.agent_id, a.name),
        to_name: null,
        body: a.status_text || 'Trabalhando…',
        ts: a.last_seen_at ?? now,
      })
    }
  }

  // Pending edges sem agent waiting/busy correspondente ainda aparecem? Skip —
  // waiting/busy agents cover the wireframe. Pending is shown on the graph.

  return rows
}

export function usePanel() {
  const [wsStatus, setWsStatus] = useState<WsConnStatus>('connecting')
  const [graphLoaded, setGraphLoaded] = useState(false)
  const [graphFailed, setGraphFailed] = useState(false)
  const [agents, setAgents] = useState<Agent[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [highlightChannelIds, setHighlightChannelIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [feedLoading, setFeedLoading] = useState(true)
  const [freshEventId, setFreshEventId] = useState<string | null>(null)

  // Seed grafo
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const snap = await graphApi.getGraph()
        if (cancelled) return
        setAgents(snap.agents)
        setEdges(snap.edges)
        setGraphFailed(false)
        setGraphLoaded(true)
      } catch (err) {
        console.error('GET /v1/graph failed', err)
        if (!cancelled) {
          setGraphFailed(true)
          setGraphLoaded(true)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Seed feed global (tolera 404)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setFeedLoading(true)
      try {
        const list = await messagesApi.listGlobalMessages({ limit: 50 })
        if (cancelled) return
        setMessages(list.items)
      } catch (err) {
        console.error('GET /v1/messages failed', err)
        if (!cancelled) setMessages([])
      } finally {
        if (!cancelled) setFeedLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // WS
  useEffect(() => {
    const client = createWsClient()
    const disconnect = client.connect(
      (event: WsEvent) => {
        if (event.type === 'hello' || event.type === 'ping') return

        setAgents((prev) => reduceAgents(prev, event))
        setEdges((prev) => reduceEdges(prev, event))

        if (event.type === 'message') {
          const msg = event.event
          setMessages((prev) => {
            if (prev.some((m) => m.event_id === msg.event_id)) return prev
            return [msg, ...prev]
          })
          setFreshEventId(msg.event_id)
        }
      },
      (status) => setWsStatus(status),
    )
    setWsStatus(client.getStatus())
    return disconnect
  }, [])

  const selectChannel = useCallback((channelId: string) => {
    const apiId = apiChannelIdFromLayout(channelId)
    setSelectedAgentId(null)
    setHighlightChannelIds(new Set([apiId]))
  }, [])

  const selectAgent = useCallback(
    (agentId: string, _channelId: string) => {
      setSelectedAgentId(agentId)
      // Highlight all edges where participant_ids contains agent
      const ids = edges
        .filter((e) => agentInParticipants(agentId, e.participant_ids))
        .map((e) => e.channel_id)
      setHighlightChannelIds(new Set(ids.length ? ids : []))
    },
    [edges],
  )

  const selectFeedChannel = useCallback((channelId: string) => {
    setSelectedAgentId(null)
    setHighlightChannelIds(new Set([channelId]))
  }, [])

  const clearHighlight = useCallback(() => {
    setHighlightChannelIds(new Set())
    setSelectedAgentId(null)
  }, [])

  const stateRows = useMemo(
    () => deriveStateRows(agents, edges),
    [agents, edges],
  )

  const feedRows: FeedRow[] = useMemo(() => {
    const msgs: FeedRow[] = messages.map((m) => ({ kind: 'msg' as const, message: m }))
    return [...stateRows, ...msgs]
  }, [stateRows, messages])

  const uiState = deriveUiState(
    wsStatus,
    graphLoaded,
    graphFailed,
    agents.length,
  )

  return {
    uiState,
    wsStatus,
    agents,
    edges,
    highlightChannelIds,
    selectedAgentId,
    feedRows,
    feedLoading,
    freshEventId,
    selectChannel,
    selectAgent,
    selectFeedChannel,
    clearHighlight,
  }
}
