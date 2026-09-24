import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { tally } from './logic/scoring'
import type { Match, Rules, State } from './types'

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
    return {
      teamName: (id: string) => team.get(id)?.name ?? '—',
      groupName: (id: string) => group.get(id)?.name ?? '',
      categoryName: (id: string) => category.get(id)?.name ?? '',
    }
  }, [state.teams, state.groups, state.categories])
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
  const t = tally(rules, match.sets)
  return (
    <span className="scoreline">
      <b>{t.setsA}:{t.setsB}</b>
      <span className="muted">({match.sets.map((s) => `${s.a}:${s.b}`).join(', ')})</span>
    </span>
  )
}

export function PinGate({ pin, label, children }: { pin: string; label: string; children: ReactNode }) {
  const storageKey = `siatkalive:pin:${label}`
  const [ok, setOk] = useState(() => {
    try { return sessionStorage.getItem(storageKey) === pin } catch { return false }
  })
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)
  if (ok) return <>{children}</>
  return (
    <form
      className="pin"
      onSubmit={(e) => {
        e.preventDefault()
        if (value === pin) {
          try { sessionStorage.setItem(storageKey, pin) } catch { /* in-memory only */ }
          setOk(true)
        } else {
          setError(true)
        }
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
      <button className="btn btn-primary" type="submit">Wejdź</button>
    </form>
  )
}
