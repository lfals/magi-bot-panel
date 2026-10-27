import type { WsConnStatus } from '../types'
import { StatusPill } from './StatusPill'

type Props = {
  wsStatus: WsConnStatus
}

export function TopBar({ wsStatus }: Props) {
  return (
    <header className="top">
      <div className="brand">
        magi-bot-panel <span>nodes v7 · Tailscale</span>
      </div>
      <StatusPill status={wsStatus} />
    </header>
  )
}
