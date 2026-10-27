import type { Edge, Message } from '../types'
import { CHANNEL_TITLES } from '../api/mockData'
import { AGENT_BY_ID, GROUP_CHANNEL_IDS, isGroupChannelId } from '../layout/agentMap'

function titleForChannel(channelId: string, edge: Edge | null): string {
  if (CHANNEL_TITLES[channelId]) return CHANNEL_TITLES[channelId]
  if (edge?.label) return edge.label
  if (channelId === GROUP_CHANNEL_IDS.produto) return 'Time Dev — Produto'
  if (channelId === GROUP_CHANNEL_IDS.engenharia) return 'Time Dev — Engenharia'
  if (isGroupChannelId(channelId)) return 'Grupo L2S'
  const parts = channelId.split(':')
  if (parts.length === 2) {
    const a = AGENT_BY_ID[parts[0]]?.name ?? parts[0].slice(0, 8)
    const b = AGENT_BY_ID[parts[1]]?.name ?? parts[1].slice(0, 8)
    return `${a} ↔ ${b}`
  }
  return channelId
}
import { displayNameForAgent } from '../layout/agentMap'

type Props = {
  channelId: string | null
  edge: Edge | null
  messages: Message[]
  loading: boolean
  onClose: () => void
}

function formatTime(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    })
  } catch {
    return iso
  }
}

export function DetailDrawer({ channelId, edge, messages, loading, onClose }: Props) {
  const title = channelId ? titleForChannel(channelId, edge) : '—'
  const tag = edge?.channel_type ?? null
  const sub = !channelId
    ? 'Selecione uma linha (conversa)'
    : edge?.sending
      ? `${tag === 'group' ? 'grupo' : 'DM'} · envio em curso`
      : edge?.last_preview
        ? `${tag === 'group' ? 'grupo' : 'DM'} · ${edge.last_preview}`
        : tag === 'group'
          ? 'grupo · linhas tracejadas entre bots membros'
          : 'DM · read-only'

  return (
    <aside className="detail">
      <div className="detail-head">
        <button type="button" className="close" onClick={onClose}>
          fechar
        </button>
        <h1>
          {title}
          {tag ? <span className={`tag ${tag}`}>{tag === 'group' ? 'grupo' : 'dm'}</span> : null}
        </h1>
        <div className="sub">{sub}</div>
      </div>
      <div className="sending-banner">
        ● Envio em curso — aresta piscando + status “enviando pra …” no nó
      </div>
      <div className="msgs">
        {!channelId ? (
          <div className="placeholder">
            Clique numa <strong>linha</strong> para a conversa. O status no retângulo
            mostra o que o bot está fazendo agora.
          </div>
        ) : loading ? (
          <div className="placeholder">Carregando mensagens…</div>
        ) : messages.length === 0 ? (
          <div className="placeholder">Sem mensagens neste canal.</div>
        ) : (
          messages.map((m) => (
            <article key={m.event_id} className="msg">
              <div className="msg-head">
                <span className="msg-from">{displayNameForAgent(m.from_agent_id, m.from_name)}</span>
                {m.priority ? <span className="prio">priority</span> : null}
                <span className="msg-time">{formatTime(m.ts)}</span>
              </div>
              <div>{m.body}</div>
            </article>
          ))
        )}
      </div>
    </aside>
  )
}
