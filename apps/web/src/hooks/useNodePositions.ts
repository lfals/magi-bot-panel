import { useCallback, useMemo, useState } from 'react'
import { NODE_POS } from '../layout/positions'

export type NodePos = { x: number; y: number }

const STORAGE_KEY = 'magi_panel_node_pos_v1'

function loadOverrides(): Record<string, NodePos> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, NodePos> = {}
    for (const [slug, v] of Object.entries(parsed)) {
      if (
        v &&
        typeof v === 'object' &&
        typeof (v as NodePos).x === 'number' &&
        typeof (v as NodePos).y === 'number' &&
        Number.isFinite((v as NodePos).x) &&
        Number.isFinite((v as NodePos).y)
      ) {
        out[slug] = { x: (v as NodePos).x, y: (v as NodePos).y }
      }
    }
    return out
  } catch {
    return {}
  }
}

function persist(overrides: Record<string, NodePos>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
  } catch {
    /* private mode / quota */
  }
}

/** Posições: defaults do wireframe + overrides do usuário (localStorage). */
export function useNodePositions() {
  const [overrides, setOverrides] = useState<Record<string, NodePos>>(loadOverrides)

  const positions = useMemo(() => {
    const merged: Record<string, NodePos> = { ...NODE_POS }
    for (const [slug, pos] of Object.entries(overrides)) {
      merged[slug] = pos
    }
    return merged
  }, [overrides])

  const setPosition = useCallback((slug: string, pos: NodePos) => {
    setOverrides((prev) => {
      const next = { ...prev, [slug]: pos }
      persist(next)
      return next
    })
  }, [])

  const resetPositions = useCallback(() => {
    setOverrides({})
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  return { positions, setPosition, resetPositions }
}
