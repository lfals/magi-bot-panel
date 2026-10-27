import type { PanelUiState } from '../types'
import { StatusPill } from './StatusPill'

const STATES: { id: PanelUiState; label: string }[] = [
  { id: 'live', label: 'live' },
  { id: 'empty', label: 'vazio' },
  { id: 'loading', label: 'loading' },
  { id: 'delayed', label: 'atraso' },
  { id: 'disconnected', label: 'desconectado' },
]

type Props = {
  uiState: PanelUiState
  sendingDemo: boolean
  onUiState: (s: PanelUiState) => void
  onSendingDemo: (on: boolean) => void
}

export function TopBar({ uiState, sendingDemo, onUiState, onSendingDemo }: Props) {
  return (
    <header className="top">
      <div className="brand">
        magi-bot-panel <span>nodes v7 · Tailscale</span>
      </div>
      <div className="state-switch">
        {STATES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={uiState === s.id ? 'active' : undefined}
            onClick={() => onUiState(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="demo-switch">
        <button
          type="button"
          className={sendingDemo ? 'active' : undefined}
          onClick={() => onSendingDemo(true)}
        >
          envio piscando
        </button>
        <button
          type="button"
          className={!sendingDemo ? 'active' : undefined}
          onClick={() => onSendingDemo(false)}
        >
          idle
        </button>
      </div>
      <StatusPill state={uiState} />
    </header>
  )
}
