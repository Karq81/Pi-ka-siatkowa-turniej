import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { sourceLabel } from './logic/knockout'
import { tally } from './logic/scoring'
import { store, useRole, useSync } from './store/store'
import type { Match, Role, Rules, State } from './types'

/** Routes are plain hash tokens (#tabele, #boisko-3) so links survive being shared. */
export function useRoute(): string {
  const read = () => decodeURIComponent(location.hash.replace(/^#\/?/, ''))
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const on = () => setRoute(read())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

export function go(route: string) {
  location.hash = route
}

export function useLookups(state: State) {
  return useMemo(() => {
    const team = new Map(state.teams.map((t) => [t.id, t]))
    const group = new Map(state.groups.map((g) => [g.id, g]))
    const category = new Map(state.categories.map((c) => [c.id, c]))
    const teamName = (id: string) => team.get(id)?.name ?? '—'
    return {
      teamName,
      groupName: (id: string) => group.get(id)?.name ?? '',
      categoryName: (id: string) => category.get(id)?.name ?? '',
      /** Group name, or the knockout round label. */
      stageName: (m: Match) => m.ko?.label ?? group.get(m.groupId)?.name ?? '',
      /** Team name, or where the team will come from (e.g. "Zwycięzca: Półfinał 1"). */
      side: (m: Match, s: 'a' | 'b') => {
        const id = s === 'a' ? m.teamA : m.teamB
        if (id) return teamName(id)
        return m.ko ? sourceLabel(state, s === 'a' ? m.ko.srcA : m.ko.srcB) : '—'
      },
    }
  }, [state])
}

const DAYS = ['niedz.', 'pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.']

export function formatTime(iso: string) {
  return iso.slice(11, 16)
}

export function formatDay(iso: string) {
  const d = new Date(iso)
  return `${DAYS[d.getDay()]} ${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** The match a court is playing now, or the next one waiting for it. */
export function courtMatch(state: State, court: number): { current?: Match; next?: Match } {
  const onCourt = state.matches
    .filter((m) => m.court === court)
    .sort((a, b) => a.start.localeCompare(b.start))
  const live = onCourt.find((m) => m.status === 'live')
  const waiting = onCourt.filter((m) => m.status === 'scheduled')
  return live ? { current: live, next: waiting[0] } : { current: waiting[0], next: waiting[1] }
}

export function StatusPill({ status }: { status: Match['status'] }) {
  if (status === 'live') return <span className="pill pill-live"><i />Na żywo</span>
  if (status === 'finished') return <span className="pill pill-done">Koniec</span>
  return <span className="pill">Zaplanowany</span>
}

/** Compact score line: sets won and each set's points. */
export function ScoreLine({ match, rules }: { match: Match; rules: Rules }) {
  if (match.status === 'scheduled') return <span className="muted">{formatTime(match.start)}</span>
  if (!match.sets.length) return <span className="muted">wynik po meczu</span>
  const t = tally(rules, match.sets)
  return (
    <span className="scoreline">
      <b>{t.setsA}:{t.setsB}</b>
      <span className="muted">({match.sets.map((s) => `${s.a}:${s.b}`).join(', ')})</span>
    </span>
  )
}

export function PinGate({ role, label, children }: { role: Role; label: string; children: ReactNode }) {
  const current = useRole()
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  if (current === 'admin' || current === role) return <>{children}</>
  return (
    <form
      className="pin"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        const ok = await store.login(role, value.trim())
        setBusy(false)
        setError(!ok)
      }}
    >
      <label htmlFor="pin-input">{label}: wpisz PIN</label>
      <input
        id="pin-input"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(e) => { setValue(e.target.value); setError(false) }}
      />
      {error && <p className="error">Nieprawidłowy PIN. Zapytaj sędziego głównego.</p>}
      <button className="btn btn-primary" type="submit" disabled={busy || !value}>{busy ? 'Sprawdzam…' : 'Wejdź'}</button>
    </form>
  )
}

/** Connection state and save errors, shown on every screen. */
export function SyncBanner() {
  const sync = useSync()
  if (sync.error) {
    return (
      <div className="banner banner-error" role="alert">
        <span>{sync.error}</span>
        <button className="btn" onClick={() => store.clearError()}>OK</button>
      </div>
    )
  }
  if (sync.mode === 'online' && !sync.connected) {
    return (
      <div className="banner" role="status">
        Brak połączenia. {sync.pending ? 'Wyniki są zapisane w telefonie i wyślą się same, gdy wróci internet.' : 'Pokazuję ostatnie znane wyniki.'}
      </div>
    )
  }
  return null
}
