import { useEffect, useMemo, useRef } from 'react'
import type { Edge, FeedRow, Message, PanelUiState } from '../types'
import { displayNameForAgent } from '../layout/agentMap'

type Props = {
  rows: FeedRow[]
  loading: boolean
  uiState: PanelUiState
  highlightChannelIds: Set<string>
  edges: Edge[]
  freshEventId: string | null
  onSelectChannel: (channelId: string) => void
}

function formatTime(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    })
  } catch {
    return iso
  }
}

function toLabel(msg: Message, edges: Edge[]): string {
  if (msg.channel_type === 'group' || msg.group_id) {
    const edge = edges.find((e) => e.channel_id === msg.channel_id)
    return edge?.label?.trim() || 'grupo'
  }
  if (msg.to_agent_id) {
    return displayNameForAgent(msg.to_agent_id)
  }
  const edge = edges.find((e) => e.channel_id === msg.channel_id)
  if (edge) {
    const other = edge.participant_ids.find((id) => id !== msg.from_agent_id)
    if (other) return displayNameForAgent(other)
  }
  return '—'
}

function liveBadge(uiState: PanelUiState): string {
  switch (uiState) {
    case 'disconnected':
      return 'off'
    case 'delayed':
      return 'lag'
    case 'empty':
      return 'idle'
    case 'loading':
      return '…'
    default:
      return 'live'
  }
}

export function FeedPanel({
  rows,
  loading,
  uiState,
  highlightChannelIds,
  edges,
  freshEventId,
  onSelectChannel,
}: Props) {
  const listRef = useRef<HTMLDivElement | null>(null)
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map())

  const highlightKey = useMemo(
    () => [...highlightChannelIds].sort().join('|'),
    [highlightChannelIds],
  )

  useEffect(() => {
    if (!highlightKey) return
    for (const row of rows) {
      const ch = row.kind === 'msg' ? row.message.channel_id : row.channel_id
      if (ch && highlightChannelIds.has(ch)) {
        const key = row.kind === 'msg' ? row.message.event_id : row.id
        const el = rowRefs.current.get(key)
        if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        break
      }
    }
  }, [highlightKey, highlightChannelIds, rows])

  useEffect(() => {
    if (!freshEventId) return
    if (listRef.current) listRef.current.scrollTop = 0
  }, [freshEventId])

  const showEmpty = !loading && rows.length === 0

  return (
    <aside className="feed" aria-label="Feed global de conversas">
      <div className="feed-head">
        <h1>
          Feed global <span className="live-badge">{liveBadge(uiState)}</span>
        </h1>
        <div className="sub">Msgs + estados de handoff · sem composer</div>
        <div className="order-note">
          Ordem: <strong>mais recente em cima</strong> (stream de monitoramento).
        </div>
        <div className="legend-mini">
          <span>
            <i className="swatch busy" /> busy / trabalhando
          </span>
          <span>
            <i className="swatch wait" /> aguardando X
          </span>
          <span>
            <i className="swatch idle" /> idle
          </span>
        </div>
      </div>
      <div className="feed-list" ref={listRef}>
        {loading ? (
          <div className="feed-loading" style={{ display: 'block' }}>
            Carregando timeline…
          </div>
        ) : null}
        {showEmpty ? (
          <div className="feed-empty" style={{ display: 'block' }}>
            Nenhuma mensagem ainda.
          </div>
        ) : null}
        {rows.map((row) => {
          if (row.kind === 'state') {
            const hl =
              row.channel_id != null && highlightChannelIds.has(row.channel_id)
            return (
              <article
                key={row.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(row.id, el)
                  else rowRefs.current.delete(row.id)
                }}
                className={[
                  'feed-row',
                  'state',
                  row.state,
                  hl ? 'hl' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                data-channel={row.channel_id ?? undefined}
                onClick={() => {
                  if (row.channel_id) onSelectChannel(row.channel_id)
                }}
              >
                <div className="feed-meta">
                  <span className={`state-pill ${row.state}`}>{row.state}</span>
                  <span className="feed-route">
                    {row.to_name != null ? (
                      <>
                        {row.from_name}
                        <span className="arrow">→</span>
                        {row.to_name}
                      </>
                    ) : (
                      row.from_name
                    )}
                  </span>
                  <span className="feed-tag state-tag">estado</span>
                  <span className="feed-time">{formatTime(row.ts)}</span>
                </div>
                <div className="feed-body">{row.body}</div>
              </article>
            )
          }

          const m = row.message
          const hl = highlightChannelIds.has(m.channel_id)
          const fresh = m.event_id === freshEventId
          const from = displayNameForAgent(m.from_agent_id, m.from_name)
          const to = toLabel(m, edges)
          const tag = m.channel_type === 'group' ? 'group' : 'dm'
          return (
            <article
              key={m.event_id}
              ref={(el) => {
                if (el) rowRefs.current.set(m.event_id, el)
                else rowRefs.current.delete(m.event_id)
              }}
              className={[
                'feed-row',
                m.priority ? 'prio' : '',
                hl ? 'hl' : '',
                fresh ? 'fresh' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              data-channel={m.channel_id}
              onClick={() => onSelectChannel(m.channel_id)}
            >
              <div className="feed-meta">
                <span className="feed-route">
                  {from}
                  <span className="arrow">→</span>
                  {to}
                </span>
                <span className={`feed-tag ${tag}`}>
                  {tag === 'group' ? 'grupo' : 'dm'}
                </span>
                <span className="feed-time">{formatTime(m.ts)}</span>
              </div>
              <div className="feed-body">{m.body}</div>
            </article>
          )
        })}
      </div>
    </aside>
  )
}
