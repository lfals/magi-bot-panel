import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { Agent, Edge } from '../types'
import {
  NODE_H,
  NODE_PRIMARY_CHANNEL,
  NODE_W,
  VIEW_H,
  VIEW_W,
} from '../layout/positions'
import {
  displayNameForAgent,
  displayRoleForAgent,
  dmApiChannelId,
  isGroupChannelId,
  layoutSlug,
  resolveApiChannelId,
} from '../layout/agentMap'
import {
  DM_EDGE_PAIRS,
  dmCurve,
  groupCurveSegs,
  inputPort,
  outputPort,
} from '../layout/edgeGeometry'
import { useNodePositions } from '../hooks/useNodePositions'

type Props = {
  agents: Agent[]
  edges: Edge[]
  selectedChannelId: string | null
  selectedAgentId: string | null
  forceSending: boolean
  onSelectChannel: (channelId: string) => void
  onSelectAgent: (agentId: string, channelId: string) => void
}

/** Resolve aresta da API (channel_id UUID:UUID ou group uuid) para o par slug do layout. */
function edgeForDmPair(edges: Edge[], slugA: string, slugB: string, layoutId: string) {
  const apiId = dmApiChannelId(slugA, slugB)
  return (
    edges.find((e) => e.channel_id === layoutId) ||
    (apiId ? edges.find((e) => e.channel_id === apiId) : undefined)
  )
}

function edgeForGroup(edges: Edge[]) {
  return edges.find((e) => isGroupChannelId(e.channel_id))
}

function clientToSvg(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x: 0, y: 0 }
  const p = pt.matrixTransform(ctm.inverse())
  return { x: p.x, y: p.y }
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
  const svgRef = useRef<SVGSVGElement | null>(null)
  const { positions, setPosition } = useNodePositions()
  const dragRef = useRef<{
    slug: string
    offsetX: number
    offsetY: number
    moved: boolean
  } | null>(null)
  const [draggingSlug, setDraggingSlug] = useState<string | null>(null)

  const sendingEdge = edges.find((e) => e.sending)
  const sendingChannel =
    sendingEdge?.channel_id ?? (forceSending ? 'designer:po' : null)
  const sendingFrom =
    sendingEdge?.sending_from_agent_id ?? (forceSending ? 'po' : null)

  const onNodePointerDown = useCallback(
    (slug: string, e: ReactPointerEvent) => {
      if (e.button !== 0) return
      const svg = svgRef.current
      if (!svg) return
      e.stopPropagation()
      e.preventDefault()
      const pt = clientToSvg(svg, e.clientX, e.clientY)
      const pos = positions[slug]
      if (!pos) return
      dragRef.current = {
        slug,
        offsetX: pt.x - pos.x,
        offsetY: pt.y - pos.y,
        moved: false,
      }
      setDraggingSlug(slug)
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    },
    [positions],
  )

  const onNodePointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const drag = dragRef.current
      const svg = svgRef.current
      if (!drag || !svg) return
      const pt = clientToSvg(svg, e.clientX, e.clientY)
      const x = Math.min(Math.max(0, pt.x - drag.offsetX), VIEW_W - NODE_W)
      const y = Math.min(Math.max(0, pt.y - drag.offsetY), VIEW_H - NODE_H)
      const prev = positions[drag.slug]
      if (prev && (Math.abs(prev.x - x) > 2 || Math.abs(prev.y - y) > 2)) {
        drag.moved = true
      }
      setPosition(drag.slug, { x, y })
    },
    [positions, setPosition],
  )

  const onNodePointerUp = useCallback(
    (agentId: string, slug: string, e: ReactPointerEvent) => {
      const drag = dragRef.current
      const moved = drag?.moved ?? false
      dragRef.current = null
      setDraggingSlug(null)
      try {
        ;(e.currentTarget as Element).releasePointerCapture(e.pointerId)
      } catch {
        /* already released */
      }
      if (!moved) {
        const primary = NODE_PRIMARY_CHANNEL[slug]
        if (primary) {
          onSelectAgent(agentId, resolveApiChannelId(primary, edges))
        }
      }
    },
    [onSelectAgent, edges],
  )

  const groupSegs = groupCurveSegs(positions)

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
        ref={svgRef}
        className="graph"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <g id="edges">
          {DM_EDGE_PAIRS.map((pair) => {
            const a = positions[pair.a]
            const b = positions[pair.b]
            if (!a || !b) return null
            const { d } = dmCurve(pair.a, a, pair.b, b)
            const edge = edgeForDmPair(edges, pair.a, pair.b, pair.channel_id)
            const kind = edge?.channel_type ?? 'dm'
            const apiId = dmApiChannelId(pair.a, pair.b)
            const isSending =
              sendingChannel === pair.channel_id ||
              (apiId != null && sendingChannel === apiId)
            const isSelected =
              selectedChannelId === pair.channel_id ||
              (apiId != null && selectedChannelId === apiId)
            const cls = [
              'edge',
              kind,
              isSelected ? 'selected' : '',
              isSending ? 'sending' : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <g key={pair.channel_id}>
                <path
                  className="edge-hit"
                  d={d}
                  onClick={(ev) => {
                    ev.stopPropagation()
                    onSelectChannel(edge?.channel_id ?? apiId ?? pair.channel_id)
                  }}
                />
                <path
                  className={cls}
                  d={d}
                  onClick={(ev) => {
                    ev.stopPropagation()
                    onSelectChannel(edge?.channel_id ?? apiId ?? pair.channel_id)
                  }}
                />
              </g>
            )
          })}
          {groupSegs.map((seg) => {
            const groupEdge = edgeForGroup(edges)
            const isSending =
              sendingChannel === 'group-l2s' ||
              (sendingChannel != null && isGroupChannelId(sendingChannel))
            const isSelected =
              selectedChannelId === 'group-l2s' ||
              (selectedChannelId != null && isGroupChannelId(selectedChannelId))
            void groupEdge
            const cls = [
              'edge',
              'group',
              isSelected ? 'selected' : '',
              isSending ? 'sending' : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <g key={seg.key}>
                <path
                  className="edge-hit"
                  d={seg.d}
                  onClick={(ev) => {
                    ev.stopPropagation()
                    onSelectChannel(resolveApiChannelId('group-l2s', edges))
                  }}
                />
                <path
                  className={cls}
                  d={seg.d}
                  onClick={(ev) => {
                    ev.stopPropagation()
                    onSelectChannel(resolveApiChannelId('group-l2s', edges))
                  }}
                />
              </g>
            )
          })}
        </g>

        <g pointerEvents="none">
          {DM_EDGE_PAIRS.map((pair) => {
            const a = positions[pair.a]
            const b = positions[pair.b]
            if (!a || !b) return null
            const { labelX, labelY } = dmCurve(pair.a, a, pair.b, b)
            const apiId = dmApiChannelId(pair.a, pair.b)
            const isSending =
              sendingChannel === pair.channel_id ||
              (apiId != null && sendingChannel === apiId)
            const text = isSending ? 'DM · enviando…' : pair.label
            return (
              <text
                key={`lbl-${pair.channel_id}`}
                className={['edge-label', isSending ? 'sending' : '']
                  .filter(Boolean)
                  .join(' ')}
                x={labelX}
                y={labelY}
              >
                {text}
              </text>
            )
          })}
          {groupSegs
            .filter((s) => s.showLabel)
            .map((seg) => (
              <text
                key={`lbl-${seg.key}`}
                className="edge-label group"
                x={seg.labelX}
                y={seg.labelY}
              >
                grupo L2S
              </text>
            ))}
        </g>

        {agents.map((agent) => {
          const slug = layoutSlug(agent.agent_id)
          if (!slug) return null
          const pos = positions[slug]
          if (!pos) return null
          const isSending =
            sendingFrom === agent.agent_id || sendingFrom === slug
          const isSelected = selectedAgentId === agent.agent_id
          const role = displayRoleForAgent(agent.agent_id, agent.role)
          const name = displayNameForAgent(agent.agent_id, agent.name)
          const isDragging = draggingSlug === slug
          const inn = inputPort({ x: 0, y: 0 })
          const out = outputPort({ x: 0, y: 0 })

          return (
            <g
              key={agent.agent_id}
              className={[
                'node',
                isSelected ? 'selected' : '',
                isSending ? 'sending' : '',
                isDragging ? 'dragging' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              transform={`translate(${pos.x},${pos.y})`}
              onPointerDown={(e) => onNodePointerDown(slug, e)}
              onPointerMove={onNodePointerMove}
              onPointerUp={(e) => onNodePointerUp(agent.agent_id, slug, e)}
              onPointerCancel={() => {
                dragRef.current = null
                setDraggingSlug(null)
              }}
            >
              <rect className="card" width={NODE_W} height={NODE_H} rx={8} ry={8} />
              {/* ports: input esquerda / output direita */}
              <circle className="port port-in" cx={inn.x} cy={inn.y} r={4} />
              <circle className="port port-out" cx={out.x} cy={out.y} r={4} />
              <circle className="pulse-dot" cx={NODE_W - 10} cy={10} r={4} />
              <text className="role" x={12} y={16}>
                {role}
              </text>
              <text className="name" x={12} y={34}>
                {name}
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
