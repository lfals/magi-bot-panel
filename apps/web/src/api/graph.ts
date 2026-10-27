import { authHeaders } from '../auth/token'
import { API_BASE_URL, USE_MOCKS } from '../config'
import type { Agent, Edge, GraphApi, GraphSnapshot } from '../types'
import { MOCK_GRAPH } from './mockData'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Normalize rev.4 snapshots that may omit waiting/pending (BE L2S-54 em paralelo). */
function normalizeAgent(a: Agent): Agent {
  return {
    ...a,
    waiting_for_agent_id: a.waiting_for_agent_id ?? null,
    waiting_for_name: a.waiting_for_name ?? null,
  }
}

function normalizeEdge(e: Edge & { pending?: boolean }): Edge {
  return {
    ...e,
    sending: Boolean(e.sending),
    sending_from_agent_id: e.sending_from_agent_id ?? null,
    pending: Boolean(e.pending),
    pending_from_agent_id: e.pending_from_agent_id ?? null,
    pending_to_agent_id: e.pending_to_agent_id ?? null,
  }
}

/** GET /v1/graph — bootstrap do canvas (ADR-002 rev.5). */
export const graphApi: GraphApi = {
  async getGraph(): Promise<GraphSnapshot> {
    if (USE_MOCKS) {
      await delay(60)
      return {
        agents: MOCK_GRAPH.agents.map((a) => normalizeAgent({ ...a })),
        edges: MOCK_GRAPH.edges.map((e) => normalizeEdge({ ...e })),
      }
    }
    const res = await fetch(`${API_BASE_URL}/v1/graph`, {
      headers: { ...authHeaders() },
    })
    if (res.status === 401) {
      throw new Error(
        'GET /v1/graph → 401 (token ausente ou inválido — abra com ?token=… ou cole no banner)',
      )
    }
    if (!res.ok) throw new Error(`GET /v1/graph → ${res.status}`)
    const snap = (await res.json()) as GraphSnapshot
    return {
      agents: (snap.agents ?? []).map(normalizeAgent),
      edges: (snap.edges ?? []).map(normalizeEdge),
    }
  },
}
