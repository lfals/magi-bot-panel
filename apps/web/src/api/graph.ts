import { API_BASE_URL, USE_MOCKS } from '../config'
import type { GraphApi, GraphSnapshot } from '../types'
import { MOCK_GRAPH } from './mockData'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** GET /v1/graph — bootstrap do canvas (ADR-002 rev.4). */
export const graphApi: GraphApi = {
  async getGraph(): Promise<GraphSnapshot> {
    if (USE_MOCKS) {
      await delay(60)
      return {
        agents: MOCK_GRAPH.agents.map((a) => ({ ...a })),
        edges: MOCK_GRAPH.edges.map((e) => ({ ...e })),
      }
    }
    const res = await fetch(`${API_BASE_URL}/v1/graph`)
    if (!res.ok) throw new Error(`GET /v1/graph → ${res.status}`)
    return (await res.json()) as GraphSnapshot
  },
}
