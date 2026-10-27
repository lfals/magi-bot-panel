import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { channelsApi } from '../api/channels'
import { graphApi } from '../api/graph'
import { createWsClient } from '../api/ws'
import type {
  Agent,
  Edge,
  Message,
  PanelUiState,
  WsEvent,
} from '../types'
import {
  apiChannelIdFromLayout,
  dmApiChannelId,
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
          last_seen_at: event.ts ?? a.last_seen_at,
        }
      : a,
  )
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
    case 'edge.idle':
      return edges.map((e) =>
        e.channel_id === event.channel_id
          ? { ...e, sending: false, sending_from_agent_id: null }
          : e,
      )
    case 'message':
      return edges.map((e) =>
        e.channel_id === event.event.channel_id
          ? {
              ...e,
              sending: false,
              sending_from_agent_id: null,
              last_message_at: event.event.ts,
              last_preview: event.event.body.slice(0, 80),
            }
          : e,
      )
    default:
      return edges
  }
}

export function usePanel() {
  const [uiState, setUiState] = useState<PanelUiState>('live')
  const [sendingDemo, setSendingDemo] = useState(false)
  const [agents, setAgents] = useState<Agent[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [msgsLoading, setMsgsLoading] = useState(false)
  const selectedRef = useRef<string | null>(null)
  selectedRef.current = selectedChannelId

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const snap = await graphApi.getGraph()
        if (cancelled) return
        setAgents(snap.agents)
        setEdges(snap.edges)
      } catch (err) {
        console.error('GET /v1/graph failed', err)
        if (!cancelled) setUiState('disconnected')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const client = createWsClient()
    const disconnect = client.connect((event: WsEvent) => {
      if (event.type === 'hello' || event.type === 'ping') return

      setAgents((prev) => reduceAgents(prev, event))
      setEdges((prev) => reduceEdges(prev, event))

      if (event.type === 'message') {
        const msg = event.event
        const openId = selectedRef.current
        if (openId && msg.channel_id === openId) {
          setMessages((prev) =>
            prev.some((m) => m.event_id === msg.event_id) ? prev : [...prev, msg],
          )
        }
      }
    })
    return disconnect
  }, [])

  const loadMessages = useCallback(async (channelId: string) => {
    setMsgsLoading(true)
    try {
      const apiId = apiChannelIdFromLayout(channelId)
      const list = await channelsApi.listMessages(apiId)
      setMessages(list.items)
    } catch (err) {
      console.error(err)
      setMessages([])
    } finally {
      setMsgsLoading(false)
    }
  }, [])

  const selectChannel = useCallback(
    (channelId: string) => {
      const apiId = apiChannelIdFromLayout(channelId)
      setSelectedChannelId(apiId)
      setSelectedAgentId(null)
      setPanelOpen(true)
      void loadMessages(apiId)
    },
    [loadMessages],
  )

  const selectAgent = useCallback(
    (agentId: string, channelId: string) => {
      const apiId = apiChannelIdFromLayout(channelId)
      setSelectedAgentId(agentId)
      setSelectedChannelId(apiId)
      setPanelOpen(true)
      void loadMessages(apiId)
    },
    [loadMessages],
  )

  const closePanel = useCallback(() => {
    setPanelOpen(false)
    setSelectedChannelId(null)
    setSelectedAgentId(null)
  }, [])

  const selectedEdge = useMemo(
    () => edges.find((e) => e.channel_id === selectedChannelId) ?? null,
    [edges, selectedChannelId],
  )

  // DEV switcher: força sending na aresta designer↔po (layout ou UUID API)
  useEffect(() => {
    if (agents.length === 0) return
    const poId =
      agents.find((a) => layoutSlug(a.agent_id) === 'po')?.agent_id ?? 'po'
    const designerId =
      agents.find((a) => layoutSlug(a.agent_id) === 'designer')?.agent_id ??
      'designer'
    const dmId = dmApiChannelId('designer', 'po')
    setEdges((prev) =>
      prev.map((e) =>
        e.channel_id === 'designer:po' || (dmId != null && e.channel_id === dmId)
          ? {
              ...e,
              sending: sendingDemo,
              sending_from_agent_id: sendingDemo ? poId : null,
            }
          : e,
      ),
    )
    setAgents((prev) =>
      prev.map((a) => {
        if (a.agent_id === poId || layoutSlug(a.agent_id) === 'po') {
          return {
            ...a,
            status: sendingDemo ? 'busy' : 'idle',
            status_text: sendingDemo ? 'enviando pra Designer' : 'idle',
          }
        }
        if (a.agent_id === designerId || layoutSlug(a.agent_id) === 'designer') {
          return {
            ...a,
            status: sendingDemo ? 'busy' : 'idle',
            status_text: sendingDemo ? 'aguardando PO' : 'idle',
          }
        }
        return a
      }),
    )
  }, [sendingDemo, agents])

  return {
    uiState,
    setUiState,
    sendingDemo,
    setSendingDemo,
    agents,
    edges,
    selectedChannelId,
    selectedAgentId,
    selectedEdge,
    panelOpen,
    messages,
    msgsLoading,
    selectChannel,
    selectAgent,
    closePanel,
  }
}
