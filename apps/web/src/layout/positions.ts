/** Geometria canônica do wireframe v7 (viewBox 960×600, nós 148×64). */

export const NODE_W = 148
export const NODE_H = 64
export const VIEW_W = 960
export const VIEW_H = 600

/** Top-left do card por agent_id. */
export const NODE_POS: Record<string, { x: number; y: number }> = {
  po: { x: 146, y: 268 },
  designer: { x: 346, y: 156 },
  frontend: { x: 546, y: 268 },
  nuvi: { x: 166, y: 100 },
  backend: { x: 146, y: 420 },
  arquiteto: { x: 650, y: 420 },
  devops: { x: 780, y: 268 },
}

export type EdgeSeg = {
  channel_id: string
  d: string
  /** Label mid opcional (só 1ª aresta do canal). */
  label?: { x: number; y: number; text: string }
}

/**
 * Arestas nas bordas dos cards (não atravessam o retângulo).
 * Paths espelham o wireframe v7.
 */
export const EDGE_SEGS: EdgeSeg[] = [
  // DM PO ↔ Designer
  {
    channel_id: 'designer:po',
    d: 'M294,300 L346,188',
    label: { x: 300, y: 240, text: 'DM' },
  },
  // DM Designer ↔ Frontend
  {
    channel_id: 'designer:frontend',
    d: 'M494,188 L546,300',
    label: { x: 510, y: 235, text: 'DM' },
  },
  // DM Backend ↔ Arquiteto
  {
    channel_id: 'arquiteto:backend',
    d: 'M294,452 L650,452',
    label: { x: 450, y: 444, text: 'DM' },
  },
  // DM PO ↔ Nuvi
  {
    channel_id: 'nuvi:po',
    d: 'M220,268 L240,164',
    label: { x: 155, y: 210, text: 'DM' },
  },
  // grupo L2S (múltiplos segmentos)
  {
    channel_id: 'group-l2s',
    d: 'M220,332 C280,280 360,240 420,220',
    label: { x: 560, y: 280, text: 'grupo L2S' },
  },
  {
    channel_id: 'group-l2s',
    d: 'M494,220 C520,250 535,280 546,300',
  },
  {
    channel_id: 'group-l2s',
    d: 'M220,332 L220,420',
  },
  {
    channel_id: 'group-l2s',
    d: 'M694,332 L724,420',
  },
  {
    channel_id: 'group-l2s',
    d: 'M694,300 L780,300',
  },
]

/** Canal “primário” associado a um nó (clique no nó abre drawer). */
export const NODE_PRIMARY_CHANNEL: Record<string, string> = {
  po: 'designer:po',
  designer: 'designer:po',
  frontend: 'designer:frontend',
  nuvi: 'nuvi:po',
  backend: 'arquiteto:backend',
  arquiteto: 'arquiteto:backend',
  devops: 'group-l2s',
}
