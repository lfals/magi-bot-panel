import {
  useCallback,
  useMemo,
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
  isGroupChannelId,
  layoutSlug,
  resolveApiChannelId,
} from '../layout/agentMap'
import {
  dmCurve,
  groupCurveSegs,
  inputPort,
  outputPort,
  type NodePos,
} from '../layout/edgeGeometry'
import { useNodePositions } from '../hooks/useNodePositions'

type Props = {
  agents: Agent[]
  edges: Edge[]
  highlightChannelIds: Set<string>
  selectedAgentId: string | null
  onSelectChannel: (channelId: string) => void
  onSelectAgent: (agentId: string, channelId: string) => void
}

type DmDrawable = {
  kind: 'dm'
  channelId: string
  edge: Edge
  slugA: string
  slugB: string
  d: string
  labelX: number
  labelY: number
  label: string
}

type GroupDrawable = {
  kind: 'group'
  channelId: string
  edge: Edge
  segs: ReturnType<typeof groupCurveSegs>
  label: string
}

type EdgeDrawable = DmDrawable | GroupDrawable

function resolveMemberSlugs(
  participantIds: string[],
  positions: Record<string, NodePos>,
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const pid of participantIds) {
    const slug = layoutSlug(pid)
    if (!slug || seen.has(slug)) continue
    if (!positions[slug]) continue
    seen.add(slug)
    out.push(slug)
  }
  return out
}

function isGroupEdge(edge: Edge): boolean {
  return (
    edge.channel_type === 'group' ||
    isGroupChannelId(edge.channel_id) ||
    edge.participant_ids.length > 2
  )
}

function buildEdgeDrawables(
  edges: Edge[],
  positions: Record<string, NodePos>,
): EdgeDrawable[] {
  const drawables: EdgeDrawable[] = []

  for (const edge of edges) {
    if (isGroupEdge(edge)) {
      const members = resolveMemberSlugs(edge.participant_ids, positions)
      const segs = groupCurveSegs(positions, members)
      if (segs.length === 0) continue
      drawables.push({
        kind: 'group',
        channelId: edge.channel_id,
        edge,
        segs,
        label: edge.label?.trim() || 'grupo',
      })
      continue
    }

    const members = resolveMemberSlugs(edge.participant_ids, positions)
    if (members.length < 2) continue
    const slugA = members[0]!
    const slugB = members[1]!
    const posA = positions[slugA]
    const posB = positions[slugB]
    if (!posA || !posB) continue
    const { d, labelX, labelY } = dmCurve(slugA, posA, slugB, posB)
    drawables.push({
      kind: 'dm',
      channelId: edge.channel_id,
      edge,
      slugA,
      slugB,
      d,
      labelX,
      labelY,
      label: edge.label?.trim() || 'DM',
    })
  }

  return drawables
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

function edgeClassName(
  base: string[],
  edge: Edge,
  isSelected: boolean,
): string {
  return [
    ...base,
    isSelected ? 'selected' : '',
    edge.sending ? 'sending' : '',
    !edge.sending && edge.pending ? 'pending' : '',
  ]
    .filter(Boolean)
    .join(' ')
}

export function GraphCanvas({
  agents,
  edges,
  highlightChannelIds,
  selectedAgentId,
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

  const drawables = useMemo(
    () => buildEdgeDrawables(edges, positions),
    [edges, positions],
  )

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

  return (
    <div className="canvas-wrap">
      <div className="banner delayed">
        Atraso no grafo — última atividade &gt;30s. Reconectando WS…
      </div>
      <div className="banner disconnected">
        Desconectado do WebSocket. Status dos nós / feed pode estar desatualizado.
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
          {drawables.map((item) => {
            if (item.kind === 'dm') {
              const isSelected = highlightChannelIds.has(item.channelId)
              const cls = edgeClassName(
                ['edge', item.edge.channel_type || 'dm'],
                item.edge,
                isSelected,
              )
              return (
                <g key={item.channelId}>
                  <path
                    className="edge-hit"
                    d={item.d}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      onSelectChannel(item.channelId)
                    }}
                  />
                  <path
                    className={cls}
                    d={item.d}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      onSelectChannel(item.channelId)
                    }}
                  />
                </g>
              )
            }

            const isSelected = highlightChannelIds.has(item.channelId)
            const cls = edgeClassName(['edge', 'group'], item.edge, isSelected)
            return (
              <g key={item.channelId}>
                {item.segs.map((seg) => (
                  <g key={seg.key}>
                    <path
                      className="edge-hit"
                      d={seg.d}
                      onClick={(ev) => {
                        ev.stopPropagation()
                        onSelectChannel(item.channelId)
                      }}
                    />
                    <path
                      className={cls}
                      d={seg.d}
                      onClick={(ev) => {
                        ev.stopPropagation()
                        onSelectChannel(item.channelId)
                      }}
                    />
                  </g>
                ))}
              </g>
            )
          })}
        </g>

        <g pointerEvents="none">
          {drawables.map((item) => {
            if (item.kind === 'dm') {
              const isSending = item.edge.sending
              const isPending = !isSending && item.edge.pending
              let text = item.label
              if (isSending) text = 'DM · enviando…'
              else if (isPending) text = 'DM · aguardando…'
              return (
                <text
                  key={`lbl-${item.channelId}`}
                  className={[
                    'edge-label',
                    isSending ? 'sending' : '',
                    isPending ? 'pending' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  x={item.labelX}
                  y={item.labelY}
                >
                  {text}
                </text>
              )
            }
            return item.segs
              .filter((s) => s.showLabel)
              .map((seg) => (
                <text
                  key={`lbl-${item.channelId}:${seg.key}`}
                  className="edge-label group"
                  x={seg.labelX}
                  y={seg.labelY}
                >
                  {item.label}
                </text>
              ))
          })}
        </g>

        {agents.map((agent) => {
          const slug = layoutSlug(agent.agent_id)
          if (!slug) return null
          const pos = positions[slug]
          if (!pos) return null
          const inHighlightedEdge = edges.some(
            (e) =>
              highlightChannelIds.has(e.channel_id) &&
              e.participant_ids.some(
                (pid) =>
                  pid === agent.agent_id || layoutSlug(pid) === slug,
              ),
          )
          const isSelected =
            selectedAgentId === agent.agent_id || inHighlightedEdge
          const role = displayRoleForAgent(agent.agent_id, agent.role)
          const name = displayNameForAgent(agent.agent_id, agent.name)
          const isDragging = draggingSlug === slug
          const inn = inputPort({ x: 0, y: 0 })
          const out = outputPort({ x: 0, y: 0 })
          const statusClass =
            agent.status === 'busy'
              ? 'busy'
              : agent.status === 'waiting'
                ? 'waiting'
                : ''

          return (
            <g
              key={agent.agent_id}
              className={[
                'node',
                isSelected ? 'selected' : '',
                statusClass,
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
