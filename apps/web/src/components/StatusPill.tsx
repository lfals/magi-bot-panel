import type { WsConnStatus } from '../types'

const LABELS: Record<WsConnStatus, { cls: string; text: string }> = {
  connected: { cls: '', text: 'WS connected' },
  connecting: { cls: 'spin', text: 'WS connecting…' },
  disconnected: { cls: 'bad', text: 'WS disconnected' },
  lag: { cls: 'warn', text: 'WS lag · >30s' },
}

export function StatusPill({ status }: { status: WsConnStatus }) {
  const { cls, text } = LABELS[status]
  return (
    <div className="status-pill">
      <span className={`dot${cls ? ` ${cls}` : ''}`} />
      <span>{text}</span>
    </div>
  )
}
