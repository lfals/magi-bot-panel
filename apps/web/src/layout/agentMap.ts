/**
 * UUID (Grok Bot / L2S_BUS_ALLOWLIST) → slug do wireframe v7 + rótulos.
 * agent_id na API permanece UUID; o SPA só usa o slug para NODE_POS / canais canônicos.
 * Display name: sempre preferir este mapa (API name vazio/UUID não vaza no card).
 */

export type AgentMeta = {
  slug: string
  name: string
  role: string
}

/** 11 agentes L2S Labs + Nuvi (allowlist). Keys em lowercase. */
export const AGENT_BY_ID: Record<string, AgentMeta> = {
  '98bc92e8-95ca-4940-bb65-1abe3a7f606c': {
    slug: 'po',
    name: 'PO',
    role: 'PO',
  },
  '201686cf-6a25-46cd-8961-6256b6f47075': {
    slug: 'arquiteto',
    name: 'Arquiteto',
    role: 'ARQ',
  },
  '8dcf78ee-e98e-41f4-bdbc-3e1a35104dee': {
    slug: 'backend',
    name: 'Backend',
    role: 'BE',
  },
  '7a2691a9-6727-4427-959c-ab6b8e369e0d': {
    slug: 'frontend',
    name: 'Frontend',
    role: 'FE',
  },
  '56b362c5-1ee9-466b-a058-346ba35b3bd3': {
    slug: 'devops',
    name: 'DevOps',
    role: 'OPS',
  },
  '2abf0353-ec22-4d54-87b6-5b62b7c0ab6b': {
    slug: 'designer',
    name: 'Designer',
    role: 'UX',
  },
  '4acc8622-064e-44af-b276-9e7c31c948d3': {
    slug: 'nuvi',
    name: 'Nuvi',
    role: 'NV',
  },
  // Fora do wireframe v7 — posições extras em NODE_POS
  '5e6a660d-4d89-4c17-a5b6-b3827174a8f6': {
    slug: 'ciber',
    name: 'Cibersegurança',
    role: 'SEC',
  },
  '462a1b92-ef15-42c3-8af5-23db26d22688': {
    slug: 'qa',
    name: 'QA',
    role: 'QA',
  },
  'c4fd4f54-17f1-4f35-a7b1-e261e55318a4': {
    slug: 'sm',
    name: 'Scrum Master',
    role: 'SM',
  },
  'a9833784-f10a-4f7f-8a58-98fda84a8d3a': {
    slug: 'analista-bd',
    name: 'Analista BD',
    role: 'BD',
  },
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function normId(agentId: string): string {
  return agentId.trim().toLowerCase()
}

export function looksLikeUuid(value: string): boolean {
  return UUID_RE.test(value.trim())
}

export function metaForAgentId(agentId: string): AgentMeta | undefined {
  return AGENT_BY_ID[normId(agentId)] ?? AGENT_BY_ID[agentId]
}

/** Resolve slug de layout a partir do agent_id (UUID ou slug mock). Nunca devolve UUID cru. */
export function layoutSlug(agentId: string): string | undefined {
  const meta = metaForAgentId(agentId)
  if (meta) return meta.slug
  // mocks DEV: agent_id já é slug conhecido
  if (agentId in UUID_BY_SLUG) return agentId
  return undefined
}

/** Label do card: agentMap.name > API name (se não for UUID) > slug. */
export function displayNameForAgent(
  agentId: string,
  apiName?: string | null,
): string {
  const meta = metaForAgentId(agentId)
  if (meta?.name) return meta.name
  const api = apiName?.trim()
  if (api && api !== agentId && !looksLikeUuid(api)) return api
  return layoutSlug(agentId) ?? 'bot'
}

export function displayRoleForAgent(
  agentId: string,
  apiRole?: string | null,
): string {
  const meta = metaForAgentId(agentId)
  if (meta?.role) return meta.role
  const role = apiRole?.trim()
  if (role && !looksLikeUuid(role)) return role
  return 'bot'
}

/** slug → UUID (Grok Bot / allowlist). */
export const UUID_BY_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(AGENT_BY_ID).map(([id, meta]) => [meta.slug, id]),
)

export function uuidForSlug(slug: string): string | undefined {
  return UUID_BY_SLUG[slug]
}

/** channel_id DM na API = sorted(uuidA:uuidB). */
export function dmApiChannelId(slugA: string, slugB: string): string | undefined {
  const a = UUID_BY_SLUG[slugA]
  const b = UUID_BY_SLUG[slugB]
  if (!a || !b) return undefined
  return [a, b].sort().join(':')
}

/** Grupos Grok Bot do time (Time Dev). */
export const GROUP_CHANNEL_IDS = {
  engenharia: '0c1ce563-03df-40a7-9ad3-0cbf4d3e0732',
  produto: 'e3433f3d-bfc2-483e-b6ae-450eab3e5405',
  /** id canônico do wireframe / skill emit */
  l2s: 'group-l2s',
} as const

export function isGroupChannelId(channelId: string): boolean {
  return (
    channelId === GROUP_CHANNEL_IDS.l2s ||
    channelId === GROUP_CHANNEL_IDS.engenharia ||
    channelId === GROUP_CHANNEL_IDS.produto
  )
}

/** Layout channel_id (slug:slug / group-l2s) → id da API (UUID:UUID / group UUID). */
export function apiChannelIdFromLayout(layoutOrApiId: string): string {
  if (!layoutOrApiId) return layoutOrApiId
  if (layoutOrApiId === GROUP_CHANNEL_IDS.l2s || layoutOrApiId === 'group-l2s') {
    return GROUP_CHANNEL_IDS.produto
  }
  if (isGroupChannelId(layoutOrApiId)) return layoutOrApiId
  const parts = layoutOrApiId.split(':')
  if (parts.length === 2) {
    const api = dmApiChannelId(parts[0], parts[1])
    if (api) return api
  }
  return layoutOrApiId
}

