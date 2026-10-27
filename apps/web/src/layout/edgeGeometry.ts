import { NODE_H, NODE_W, type EdgeSeg } from './positions'

export type NodePos = { x: number; y: number }

/** Pares DM canônicos do wireframe (channel_id slug:slug). */
export const DM_EDGE_PAIRS: { channel_id: string; a: string; b: string; label: string }[] =
  [
    { channel_id: 'designer:po', a: 'designer', b: 'po', label: 'DM' },
    { channel_id: 'designer:frontend', a: 'designer', b: 'frontend', label: 'DM' },
    { channel_id: 'arquiteto:backend', a: 'arquiteto', b: 'backend', label: 'DM' },
    { channel_id: 'nuvi:po', a: 'nuvi', b: 'po', label: 'DM' },
  ]

/** Ponto na borda do card A na direção do card B (evita atravessar o retângulo). */
export function borderPoint(from: NodePos, to: NodePos): { x: number; y: number } {
  const cx = from.x + NODE_W / 2
  const cy = from.y + NODE_H / 2
  const tx = to.x + NODE_W / 2
  const ty = to.y + NODE_H / 2
  const dx = tx - cx
  const dy = ty - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  const hw = NODE_W / 2
  const hh = NODE_H / 2
  const sx = dx !== 0 ? hw / Math.abs(dx) : Infinity
  const sy = dy !== 0 ? hh / Math.abs(dy) : Infinity
  const t = Math.min(sx, sy)
  return { x: cx + dx * t, y: cy + dy * t }
}

export function dmPath(a: NodePos, b: NodePos): { d: string; labelX: number; labelY: number } {
  const p0 = borderPoint(a, b)
  const p1 = borderPoint(b, a)
  return {
    d: `M${p0.x},${p0.y} L${p1.x},${p1.y}`,
    labelX: (p0.x + p1.x) / 2,
    labelY: (p0.y + p1.y) / 2 - 6,
  }
}

/** Segmentos de grupo fixos do wireframe (não recalculados no drag MVP). */
export function groupEdgeSegs(all: EdgeSeg[]): EdgeSeg[] {
  return all.filter((s) => s.channel_id === 'group-l2s')
}
