import type { Agent, Channel, Edge, GraphSnapshot, Message } from '../types'

const now = '2026-10-27T10:34:00-03:00'

export const MOCK_AGENTS: Agent[] = [
  {
    agent_id: 'po',
    name: 'PO',
    role: 'product',
    status: 'busy',
    status_text: 'enviando pra Designer',
    last_seen_at: now,
  },
  {
    agent_id: 'designer',
    name: 'Designer',
    role: 'ux/ui',
    status: 'busy',
    status_text: 'aguardando PO',
    last_seen_at: now,
  },
  {
    agent_id: 'frontend',
    name: 'Frontend',
    role: 'ui',
    status: 'idle',
    status_text: 'idle · pause design',
    last_seen_at: '2026-10-27T10:09:00-03:00',
  },
  {
    agent_id: 'nuvi',
    name: 'Nuvi',
    role: 'helper',
    status: 'idle',
    status_text: 'idle',
    last_seen_at: '2026-10-27T10:08:00-03:00',
  },
  {
    agent_id: 'backend',
    name: 'Backend',
    role: 'api',
    status: 'busy',
    status_text: 'aguardando contrato WS',
    last_seen_at: '2026-10-27T09:55:00-03:00',
  },
  {
    agent_id: 'arquiteto',
    name: 'Arquiteto',
    role: 'adr',
    status: 'idle',
    status_text: 'idle',
    last_seen_at: '2026-10-27T09:55:00-03:00',
  },
  {
    agent_id: 'devops',
    name: 'DevOps',
    role: 'magi',
    status: 'busy',
    status_text: 'aguardando OK design',
    last_seen_at: '2026-10-27T10:03:00-03:00',
  },
]

/** channel_id DM = sorted(a:b); group = groupId (ADR-002). */
export const MOCK_EDGES: Edge[] = [
  {
    channel_id: 'designer:po',
    channel_type: 'dm',
    participant_ids: ['designer', 'po'],
    last_message_at: '2026-10-27T10:34:00-03:00',
    last_preview: 'v7: drawer à direita + arestas…',
    sending: true,
    sending_from_agent_id: 'po',
  },
  {
    channel_id: 'designer:frontend',
    channel_type: 'dm',
    participant_ids: ['designer', 'frontend'],
    last_message_at: '2026-10-27T10:09:00-03:00',
    last_preview: 'Scaffold parado até OK do Luis.',
    sending: false,
    sending_from_agent_id: null,
  },
  {
    channel_id: 'arquiteto:backend',
    channel_type: 'dm',
    participant_ids: ['arquiteto', 'backend'],
    last_message_at: '2026-10-27T09:55:00-03:00',
    last_preview: 'Tailscale-only.',
    sending: false,
    sending_from_agent_id: null,
  },
  {
    channel_id: 'nuvi:po',
    channel_type: 'dm',
    participant_ids: ['nuvi', 'po'],
    last_message_at: '2026-10-27T10:08:00-03:00',
    last_preview: 'Design só via PO até OK do Luis.',
    sending: false,
    sending_from_agent_id: null,
  },
  {
    channel_id: 'group-l2s',
    channel_type: 'group',
    participant_ids: [
      'po',
      'designer',
      'frontend',
      'nuvi',
      'backend',
      'arquiteto',
      'devops',
    ],
    label: 'Time L2S Labs',
    last_message_at: '2026-10-27T10:34:00-03:00',
    last_preview: 'v7: endpoints nas bordas; drawer direita.',
    sending: false,
    sending_from_agent_id: null,
  },
]

export const MOCK_GRAPH: GraphSnapshot = {
  agents: MOCK_AGENTS,
  edges: MOCK_EDGES,
}

export const CHANNEL_TITLES: Record<string, string> = {
  'designer:po': 'PO ↔ Designer',
  'designer:frontend': 'Frontend ↔ Designer',
  'arquiteto:backend': 'Backend ↔ Arquiteto',
  'nuvi:po': 'PO ↔ Nuvi',
  'group-l2s': 'Time L2S Labs',
}

export const MOCK_MESSAGES: Record<string, Message[]> = {
  'designer:po': [
    {
      event_id: 'e-po-1',
      ts: '2026-10-27T10:27:00-03:00',
      channel_type: 'dm',
      channel_id: 'designer:po',
      from_agent_id: 'po',
      from_name: 'PO',
      to_agent_id: 'designer',
      priority: true,
      body: 'Feedback Luis: nós retangulares + status em texto no nó.',
      source: 'emit',
      dedupe_key: 'po-des-1',
    },
    {
      event_id: 'e-des-1',
      ts: '2026-10-27T10:34:00-03:00',
      channel_type: 'dm',
      channel_id: 'designer:po',
      from_agent_id: 'designer',
      from_name: 'Designer',
      to_agent_id: 'po',
      body: 'v7: drawer à direita + arestas encostando nas bordas dos cards.',
      source: 'emit',
      dedupe_key: 'po-des-2',
    },
  ],
  'designer:frontend': [
    {
      event_id: 'e-fe-1',
      ts: '2026-10-27T10:09:00-03:00',
      channel_type: 'dm',
      channel_id: 'designer:frontend',
      from_agent_id: 'frontend',
      from_name: 'Frontend',
      to_agent_id: 'designer',
      body: 'Scaffold parado até OK do Luis.',
      source: 'emit',
      dedupe_key: 'fe-des-1',
    },
  ],
  'arquiteto:backend': [
    {
      event_id: 'e-be-1',
      ts: '2026-10-27T09:40:00-03:00',
      channel_type: 'dm',
      channel_id: 'arquiteto:backend',
      from_agent_id: 'backend',
      from_name: 'Backend',
      to_agent_id: 'arquiteto',
      body: 'WS /v1/stream alinhado ao ADR-002.',
      source: 'emit',
      dedupe_key: 'be-arq-1',
    },
    {
      event_id: 'e-arq-1',
      ts: '2026-10-27T09:55:00-03:00',
      channel_type: 'dm',
      channel_id: 'arquiteto:backend',
      from_agent_id: 'arquiteto',
      from_name: 'Arquiteto',
      to_agent_id: 'backend',
      body: 'Tailscale-only.',
      source: 'emit',
      dedupe_key: 'be-arq-2',
    },
  ],
  'nuvi:po': [
    {
      event_id: 'e-nuvi-1',
      ts: '2026-10-27T10:08:00-03:00',
      channel_type: 'dm',
      channel_id: 'nuvi:po',
      from_agent_id: 'nuvi',
      from_name: 'Nuvi',
      to_agent_id: 'po',
      body: 'Design só via PO até OK do Luis.',
      source: 'emit',
      dedupe_key: 'nuvi-po-1',
    },
  ],
  'group-l2s': [
    {
      event_id: 'e-g1',
      ts: '2026-10-27T10:03:00-03:00',
      channel_type: 'group',
      channel_id: 'group-l2s',
      from_agent_id: 'po',
      from_name: 'PO',
      group_id: 'group-l2s',
      priority: true,
      body: 'HANDOFF L2S-43.',
      source: 'emit',
      dedupe_key: 'g-l2s-1',
    },
    {
      event_id: 'e-g2',
      ts: '2026-10-27T10:34:00-03:00',
      channel_type: 'group',
      channel_id: 'group-l2s',
      from_agent_id: 'designer',
      from_name: 'Designer',
      group_id: 'group-l2s',
      body: 'v7: endpoints nas bordas; drawer direita.',
      source: 'emit',
      dedupe_key: 'g-l2s-2',
    },
  ],
}

/** Channel (≠ Edge) — GET /v1/channels / GET /v1/channels/:id */
export const MOCK_CHANNELS: Channel[] = MOCK_EDGES.map((e) => {
  const agentsById = Object.fromEntries(MOCK_AGENTS.map((a) => [a.agent_id, a]))
  const msgs = MOCK_MESSAGES[e.channel_id] ?? []
  return {
    channel_id: e.channel_id,
    channel_type: e.channel_type,
    participants: e.participant_ids.map((id) => ({
      agent_id: id,
      name: agentsById[id]?.name ?? id,
    })),
    group_id: e.channel_type === 'group' ? e.channel_id : null,
    label: e.label ?? CHANNEL_TITLES[e.channel_id],
    last_ts: e.last_message_at ?? now,
    last_preview: e.last_preview ?? '',
    message_count: msgs.length || undefined,
  }
})

