import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { sourceLabel } from './logic/knockout'
import { setsText, setText, tally } from './logic/scoring'
import { canScore } from './logic/pins'
import { store, useSession, useSync } from './store/store'
import type { Match, Rules, State } from './types'
import { locale, t } from './i18n'

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

// Screens visited in this session, so "Wstecz" only goes back within the site.
const currentRoute = () => location.hash.replace(/^#\/?/, '')
const visited: string[] = [currentRoute()]
window.addEventListener('hashchange', () => {
  const r = currentRoute()
  // Going back (by our button or the phone's) lands on the previous entry.
  if (visited.length > 1 && visited[visited.length - 2] === r) visited.pop()
  else visited.push(r)
})

/**
 * Big "back" button for phones: returns to the previous screen, or to `fallback`
 * when the page was opened straight from a link (nothing to go back to).
 */
export function BackBar({ fallback }: { fallback: string }) {
  return (
    <div className="backbar">
      <button
        className="btn-back"
        onClick={() => {
          if (visited.length > 1) history.back()
          else location.hash = fallback
        }}
      >
        <span aria-hidden="true">←</span> {t('Wstecz')}
      </button>
    </div>
  )
}

/** A court's name as shown to people: "A" for court 1 at Albatros CUP, else its number. */
export function courtLabel(n: number): string {
  return store.get().tournament.courtNames?.[n - 1] ?? String(n)
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

export function formatTime(iso: string) {
  return iso.slice(11, 16)
}

export function formatDay(iso: string) {
  const d = new Date(iso)
  const day = new Intl.DateTimeFormat(locale(), { weekday: 'short' }).format(d)
  return `${day} ${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** The match a court is playing now, or the next one waiting for it. */
export function courtMatch(state: State, court: number): { current?: Match; next?: Match } {
  const onCourt = state.matches
    .filter((m) => m.court === court && !m.skipped)
    .sort((a, b) => a.start.localeCompare(b.start))
  const live = onCourt.find((m) => m.status === 'live')
  const waiting = onCourt.filter((m) => m.status === 'scheduled')
  return live ? { current: live, next: waiting[0] } : { current: waiting[0], next: waiting[1] }
}

/** Current time, refreshed every `ms`, for time-based displays (countdowns, "Trwa"). */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

export function StatusPill({ status }: { status: Match['status'] }) {
  if (status === 'live') return <span className="pill pill-live"><i />{t('Trwa')}</span>
  if (status === 'finished') return <span className="pill pill-done">{t('Koniec meczu')}</span>
  return <span className="pill">{t('Zaplanowany')}</span>
}

/** Compact score line: sets won and each set's points. */
export function ScoreLine({ match, rules }: { match: Match; rules: Rules }) {
  if (match.status === 'scheduled') return <span className="muted">{formatTime(match.start)}</span>
  if (!match.sets.length) return <span className="muted">{t('wynik po meczu')}</span>
  if (match.sets.length === 1) return <span className="scoreline"><b>{setText(rules, match.sets[0])}</b></span>
  const score = tally(rules, match.sets)
  return (
    <span className="scoreline">
      <b>{score.setsA}:{score.setsB}</b>
      <span className="muted">({setsText(rules, match.sets)})</span>
    </span>
  )
}

/**
 * Asks for a key before showing a panel. Without `court` only the admin PIN opens it;
 * with `court`, that court's key works too.
 */
export function PinGate({ court, label, children }: { court?: number; label: string; children: ReactNode }) {
  const session = useSession()
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const allowed = court ? canScore(session, court) : session?.role === 'admin'
  if (allowed) return <>{children}</>
  return (
    <form
      className="pin"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        const ok = await store.login(value.trim(), court)
        setBusy(false)
        setError(!ok)
      }}
    >
      <label htmlFor="pin-input">{court ? t('{label}: wpisz klucz boiska', { label }) : t('{label}: wpisz PIN', { label })}</label>
      <input
        id="pin-input"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(e) => { setValue(e.target.value); setError(false) }}
      />
      {error && <p className="error">{court ? t('To nie jest klucz do boiska {court}. Zapytaj sędziego głównego.', { court }) : t('Nieprawidłowy PIN.')}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy || !value}>{busy ? t('Sprawdzam…') : t('Wejdź')}</button>
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
  if (sync.mode === 'local') {
    return (
      <div className="banner" role="status">
        {t('Tryb pokazowy: dane zapisują się tylko na tym urządzeniu i nikt inny ich nie widzi.')}
      </div>
    )
  }
  if (sync.mode === 'online' && !sync.connected) {
    return (
      <div className="banner" role="status">
        {t('Brak połączenia.')} {sync.pending ? t('Wyniki są zapisane w telefonie i wyślą się same, gdy wróci internet.') : t('Pokazuję ostatnie znane wyniki.')}
      </div>
    )
  }
  return null
}

/**
 * A button that asks first: a clear window in the middle of the screen with the question
 * and two big answers, so a slip of the finger on the phone changes nothing.
 */
export function ConfirmButton({ className, label, question, yes, onYes }: {
  className: string; label: ReactNode; question: string; yes: string; onYes: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{label}</button>
      {open && (
        <div className="confirm-back" role="presentation" onClick={() => setOpen(false)}>
          <div className="confirm-box" role="alertdialog" aria-modal="true" aria-label={question} onClick={(e) => e.stopPropagation()}>
            <p className="confirm-q">{question}</p>
            <div className="confirm-actions">
              <button type="button" className="btn btn-lg" autoFocus onClick={() => setOpen(false)}>{t('Nie')}</button>
              <button type="button" className="btn btn-danger btn-lg" onClick={() => { setOpen(false); onYes() }}>{yes}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/**
 * A number box that lets people type freely: deleting the last digit leaves the box empty
 * (instead of snapping back to the smallest value or the old one), and the value is taken
 * only when it is a proper number within the limits. Leaving an empty or wrong box brings
 * the current value back.
 */
export function NumberField({ value, onChange, min, max, step, decimals = false, id, disabled, ariaLabel, lazy = false }: {
  value: number
  onChange: (v: number) => void
  /** Take the value only on leaving the box or Enter (for settings saved to the database). */
  lazy?: boolean
  min?: number
  max?: number
  step?: number
  /** Allow 1,5 or 1.5. */
  decimals?: boolean
  id?: string
  disabled?: boolean
  ariaLabel?: string
}) {
  const show = (v: number) => (decimals ? String(v).replace('.', ',') : String(v))
  const [text, setText] = useState(show(value))
  const [focused, setFocused] = useState(false)
  useEffect(() => { if (!focused) setText(show(value)) }, [value, focused])
  const parse = (s: string) => {
    if (!s.trim()) return null
    const n = Number(s.replace(',', '.'))
    if (!Number.isFinite(n) || (!decimals && !Number.isInteger(n))) return null
    if ((min !== undefined && n < min) || (max !== undefined && n > max)) return null
    return n
  }
  const bad = focused && text.trim() !== '' && parse(text) === null
  return (
    <input
      id={id}
      type="text"
      inputMode={decimals ? 'decimal' : 'numeric'}
      autoComplete="off"
      aria-label={ariaLabel}
      aria-invalid={bad}
      className={bad ? 'num-bad' : undefined}
      disabled={disabled}
      value={text}
      data-step={step}
      onFocus={(e) => { setFocused(true); e.target.select() }}
      onChange={(e) => {
        const s = e.target.value.replace(decimals ? /[^\d.,-]/g : /[^\d-]/g, '')
        setText(s)
        const n = parse(s)
        if (!lazy && n !== null && n !== value) onChange(n)
      }}
      onKeyDown={(e) => { if (lazy && e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      onBlur={() => {
        setFocused(false)
        const n = parse(text)
        if (lazy && n !== null && n !== value) { onChange(n); setText(show(n)) } else setText(show(value))
      }}
    />
  )
}

/**
 * "This breaks the rules, save anyway?": the window of ConfirmButton, opened by the caller
 * (e.g. after the save button when the result does not follow the rules).
 */
export function ConfirmDialog({ question, yes, no, onYes, onNo }: { question: ReactNode; yes: string; no?: string; onYes: () => void; onNo: () => void }) {
  return (
    <div className="confirm-back" role="presentation" onClick={onNo}>
      <div className="confirm-box" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-q">{question}</div>
        <div className="confirm-actions">
          <button type="button" className="btn btn-lg" autoFocus onClick={onNo}>{no ?? t('Nie, poprawię')}</button>
          <button type="button" className="btn btn-danger btn-lg" onClick={onYes}>{yes}</button>
        </div>
      </div>
    </div>
  )
}
