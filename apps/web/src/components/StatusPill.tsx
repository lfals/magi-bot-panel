import type { PanelUiState } from '../types'

const LABELS: Record<PanelUiState, { cls: string; text: string }> = {
  live: { cls: '', text: 'WS connected · <2s' },
  empty: { cls: '', text: 'WS connected · idle' },
  loading: { cls: 'spin', text: 'WS connected · loading' },
  delayed: { cls: 'warn', text: 'WS lag · >30s' },
  disconnected: { cls: 'bad', text: 'WS disconnected' },
}

export function StatusPill({ state }: { state: PanelUiState }) {
  const { cls, text } = LABELS[state]
  return (
    <div className="status-pill">
      <span className={`dot${cls ? ` ${cls}` : ''}`} />
      <span>{text}</span>
    </div>
  )
}
