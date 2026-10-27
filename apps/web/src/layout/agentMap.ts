/**
 * UUID (Grok Bot / L2S_BUS_ALLOWLIST) → slug do wireframe v7 + rótulos.
 * agent_id na API permanece UUID; o SPA só usa o slug para NODE_POS / canais canônicos.
 */
export type AgentMeta = {
  slug: string
  name: string
  role: string
}

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

export function metaForAgentId(agentId: string): AgentMeta | undefined {
  return AGENT_BY_ID[agentId]
}

/** Resolve slug de layout a partir do agent_id (UUID ou slug mock). */
export function layoutSlug(agentId: string): string | undefined {
  return AGENT_BY_ID[agentId]?.slug ?? (agentId in AGENT_BY_ID ? undefined : agentId)
}
