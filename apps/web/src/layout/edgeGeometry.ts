import { NODE_H, NODE_W } from './positions'

export type NodePos = { x: number; y: number }
export type Pt = { x: number; y: number }

/** Pares DM canônicos do wireframe (channel_id slug:slug). */
export const DM_EDGE_PAIRS: {
  channel_id: string
  a: string
  b: string
  label: string
}[] = [
  { channel_id: 'designer:po', a: 'designer', b: 'po', label: 'DM' },
  { channel_id: 'designer:frontend', a: 'designer', b: 'frontend', label: 'DM' },
  { channel_id: 'arquiteto:backend', a: 'arquiteto', b: 'backend', label: 'DM' },
  { channel_id: 'nuvi:po', a: 'nuvi', b: 'po', label: 'DM' },
]

/** Membros do grupo L2S no canvas (arestas de grupo ligam estes nós). */
export const GROUP_L2S_MEMBERS = [
  'po',
  'designer',
  'frontend',
  'nuvi',
  'backend',
  'arquiteto',
  'devops',
] as const

/** Output = meio da borda direita do card. */
export function outputPort(pos: NodePos): Pt {
  return { x: pos.x + NODE_W, y: pos.y + NODE_H / 2 }
}

/** Input = meio da borda esquerda do card. */
export function inputPort(pos: NodePos): Pt {
  return { x: pos.x, y: pos.y + NODE_H / 2 }
}

/**
 * Direção canônica L→R: source = nó mais à esquerda (output direita),
 * target = o outro (input esquerda). Empate em x → slug lexicográfico.
 */
export function directedPair(
  slugA: string,
  posA: NodePos,
  slugB: string,
  posB: NodePos,
): { fromSlug: string; toSlug: string; from: NodePos; to: NodePos } {
  const ax = posA.x + NODE_W / 2
  const bx = posB.x + NODE_W / 2
  if (ax < bx || (ax === bx && slugA < slugB)) {
    return { fromSlug: slugA, toSlug: slugB, from: posA, to: posB }
  }
  return { fromSlug: slugB, toSlug: slugA, from: posB, to: posA }
}

/**
 * Curva cúbica: sai pela direita (output) e entra pela esquerda (input).
 * Controles horizontais → S suave que acompanha o drag.
 */
export function curvePath(from: NodePos, to: NodePos): {
  d: string
  labelX: number
  labelY: number
  out: Pt
  inn: Pt
} {
  const out = outputPort(from)
  const inn = inputPort(to)
  const dx = Math.abs(inn.x - out.x)
  const pull = Math.max(48, dx * 0.45)
  const c1x = out.x + pull
  const c2x = inn.x - pull
  const d = `M${out.x},${out.y} C${c1x},${out.y} ${c2x},${inn.y} ${inn.x},${inn.y}`
  // ponto ~médio da bezier (t=0.5)
  const t = 0.5
  const mt = 1 - t
  const labelX =
    mt * mt * mt * out.x +
    3 * mt * mt * t * c1x +
    3 * mt * t * t * c2x +
    t * t * t * inn.x
  const labelY =
    mt * mt * mt * out.y +
    3 * mt * mt * t * out.y +
    3 * mt * t * t * inn.y +
    t * t * t * inn.y -
    8
  return { d, labelX, labelY, out, inn }
}

export function dmCurve(
  slugA: string,
  posA: NodePos,
  slugB: string,
  posB: NodePos,
) {
  const { from, to } = directedPair(slugA, posA, slugB, posB)
  return curvePath(from, to)
}

/**
 * Cadeia de curvas do grupo: membros presentes ordenados por x,
 * cada um output→input do próximo — sempre ligados ao drag.
 */
export function groupCurveSegs(
  positions: Record<string, NodePos>,
): { key: string; d: string; labelX: number; labelY: number; showLabel: boolean }[] {
  type Member = { slug: string; pos: NodePos }
  const present: Member[] = []
  for (const slug of GROUP_L2S_MEMBERS) {
    const pos = positions[slug]
    if (pos) present.push({ slug, pos })
  }

  present.sort((a, b) => {
    const ax = a.pos.x + NODE_W / 2
    const bx = b.pos.x + NODE_W / 2
    if (ax !== bx) return ax - bx
    return a.slug.localeCompare(b.slug)
  })

  const segs: {
    key: string
    d: string
    labelX: number
    labelY: number
    showLabel: boolean
  }[] = []
  for (let i = 0; i < present.length - 1; i++) {
    const a = present[i]!
    const b = present[i + 1]!
    const { d, labelX, labelY } = curvePath(a.pos, b.pos)
    segs.push({
      key: `group-l2s:${a.slug}:${b.slug}`,
      d,
      labelX,
      labelY,
      showLabel: i === Math.floor((present.length - 2) / 2),
    })
  }
  return segs
}
