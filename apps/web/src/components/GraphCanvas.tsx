import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Agent, Edge } from '../types'
import {
  EDGE_SEGS,
  NODE_H,
  NODE_PRIMARY_CHANNEL,
  NODE_W,
  VIEW_H,
  VIEW_W,
} from '../layout/positions'
import { layoutSlug, metaForAgentId } from '../layout/agentMap'
import { DM_EDGE_PAIRS, dmPath } from '../layout/edgeGeometry'
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

function edgeById(edges: Edge[], id: string) {
  return edges.find((e) => e.channel_id === id)
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

  const sendingChannel =
    edges.find((e) => e.sending)?.channel_id ??
    (forceSending ? 'designer:po' : null)
  const sendingFrom =
    edges.find((e) => e.sending)?.sending_from_agent_id ??
    (forceSending ? 'po' : null)

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
      if (
        prev &&
        (Math.abs(prev.x - x) > 2 || Math.abs(prev.y - y) > 2)
      ) {
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
        if (primary) onSelectAgent(agentId, primary)
      }
    },
    [onSelectAgent],
  )

  const groupSegs = EDGE_SEGS.filter((s) => s.channel_id === 'group-l2s')

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
            const { d } = dmPath(a, b)
            const edge = edgeById(edges, pair.channel_id)
            const kind = edge?.channel_type ?? 'dm'
            const isSending = sendingChannel === pair.channel_id
            const isSelected = selectedChannelId === pair.channel_id
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
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelectChannel(pair.channel_id)
                  }}
                />
                <path
                  className={cls}
                  d={d}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelectChannel(pair.channel_id)
                  }}
                />
              </g>
            )
          })}
          {groupSegs.map((seg, i) => {
            const edge = edgeById(edges, seg.channel_id)
            const kind = edge?.channel_type ?? 'group'
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
              <g key={`group-${i}`}>
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
          {DM_EDGE_PAIRS.map((pair) => {
            const a = positions[pair.a]
            const b = positions[pair.b]
            if (!a || !b) return null
            const { labelX, labelY } = dmPath(a, b)
            const isSending = sendingChannel === pair.channel_id
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
            .filter((s) => s.label)
            .map((seg) => (
              <text
                key={`lbl-group-${seg.label!.x}`}
                className="edge-label group"
                x={seg.label!.x}
                y={seg.label!.y}
              >
                {seg.label!.text}
              </text>
            ))}
        </g>

        {agents.map((agent) => {
          const meta = metaForAgentId(agent.agent_id)
          const slug = layoutSlug(agent.agent_id)
          if (!slug) return null
          const pos = positions[slug]
          if (!pos) return null
          const isSending =
            sendingFrom === agent.agent_id || sendingFrom === slug
          const isSelected = selectedAgentId === agent.agent_id
          const role = meta?.role ?? agent.role ?? 'bot'
          const name =
            meta?.name ??
            (agent.name && agent.name !== agent.agent_id ? agent.name : slug)
          const isDragging = draggingSlug === slug

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
