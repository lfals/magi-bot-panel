import { useState, type FormEvent } from 'react'
import { getPanelToken, setPanelToken } from '../auth/token'

type Props = {
  onSaved: () => void
}

/** Banner simples quando não há token — cola ou abre com ?token=. */
export function AuthBanner({ onSaved }: Props) {
  const [value, setValue] = useState('')
  if (getPanelToken()) return null

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!value.trim()) return
    setPanelToken(value)
    setValue('')
    onSaved()
  }

  return (
    <div className="auth-banner" role="status">
      <span>
        Sem token do painel. Abra com <code>?token=…</code> (salva em
        localStorage e some da URL) ou cole abaixo.
      </span>
      <form onSubmit={submit} className="auth-banner-form">
        <input
          type="password"
          autoComplete="off"
          placeholder="MAGI_PANEL_TOKEN"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button type="submit">Salvar</button>
      </form>
    </div>
  )
}
