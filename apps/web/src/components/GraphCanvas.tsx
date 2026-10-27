import type { Agent, Edge } from '../types'
import {
  EDGE_SEGS,
  NODE_H,
  NODE_POS,
  NODE_PRIMARY_CHANNEL,
  NODE_W,
  VIEW_H,
  VIEW_W,
} from '../layout/positions'

type Props = {
  agents: Agent[]
  edges: Edge[]
  selectedChannelId: string | null
  selectedAgentId: string | null
  forceSending: boolean
  onSelectChannel: (channelId: string) => void
  onSelectAgent: (agentId: string, channelId: string) => void
}

function edgeById(edges: Edge[], id: string) {
  return edges.find((e) => e.channel_id === id)
}

export function GraphCanvas({
  agents,
  edges,
  selectedChannelId,
  selectedAgentId,
  forceSending,
  onSelectChannel,
  onSelectAgent,
}: Props) {
  const sendingChannel =
    edges.find((e) => e.sending)?.channel_id ??
    (forceSending ? 'designer:po' : null)
  const sendingFrom =
    edges.find((e) => e.sending)?.sending_from_agent_id ??
    (forceSending ? 'po' : null)

  return (
    <div className="canvas-wrap">
      <div className="banner delayed">
        Atraso no grafo — última atividade &gt;30s. Reconectando WS…
      </div>
      <div className="banner disconnected">
        Desconectado do WebSocket. Status dos nós pode estar desatualizado.
      </div>
      <div className="empty-canvas">
        <div>
          <strong style={{ color: 'var(--fg)' }}>Grafo vazio</strong>
          <br />
          Sem conversas ainda.
        </div>
      </div>
      <div className="loading-canvas">
        <div>
          <strong style={{ color: 'var(--fg)' }}>Montando grafo…</strong>
          <br />
          Carregando bots e status.
        </div>
      </div>

      <svg
        className="graph"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <g id="edges">
          {EDGE_SEGS.map((seg, i) => {
            const edge = edgeById(edges, seg.channel_id)
            const kind = edge?.channel_type ?? 'dm'
            const isSending = sendingChannel === seg.channel_id
            const isSelected = selectedChannelId === seg.channel_id
            const cls = [
              'edge',
              kind,
              isSelected ? 'selected' : '',
              isSending ? 'sending' : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <g key={`${seg.channel_id}-${i}`}>
                <path
                  className="edge-hit"
                  d={seg.d}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelectChannel(seg.channel_id)
                  }}
                />
                <path
                  className={cls}
                  d={seg.d}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelectChannel(seg.channel_id)
                  }}
                />
              </g>
            )
          })}
        </g>

        <g pointerEvents="none">
          {EDGE_SEGS.filter((s) => s.label).map((seg) => {
            const isSending = sendingChannel === seg.channel_id
            const edge = edgeById(edges, seg.channel_id)
            const isGroup = edge?.channel_type === 'group'
            let text = seg.label!.text
            if (isSending && !isGroup) text = 'DM · enviando…'
            return (
              <text
                key={`lbl-${seg.channel_id}-${seg.label!.x}`}
                className={[
                  'edge-label',
                  isGroup ? 'group' : '',
                  isSending ? 'sending' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                x={seg.label!.x}
                y={seg.label!.y}
              >
                {text}
              </text>
            )
          })}
        </g>

        {agents.map((agent) => {
          const pos = NODE_POS[agent.agent_id]
          if (!pos) return null
          const primary = NODE_PRIMARY_CHANNEL[agent.agent_id]
          const isSending = sendingFrom === agent.agent_id
          const isSelected = selectedAgentId === agent.agent_id

          return (
            <g
              key={agent.agent_id}
              className={[
                'node',
                isSelected ? 'selected' : '',
                isSending ? 'sending' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              transform={`translate(${pos.x},${pos.y})`}
              onClick={(e) => {
                e.stopPropagation()
                if (primary) onSelectAgent(agent.agent_id, primary)
              }}
            >
              <rect className="card" width={NODE_W} height={NODE_H} rx={8} ry={8} />
              <circle className="pulse-dot" cx={NODE_W - 10} cy={10} r={4} />
              <text className="role" x={12} y={16}>
                {agent.role ?? 'bot'}
              </text>
              <text className="name" x={12} y={34}>
                {agent.name}
              </text>
              <text className="status" x={12} y={52}>
                {agent.status_text}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
