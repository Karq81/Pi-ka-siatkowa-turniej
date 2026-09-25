import { useEffect, useState } from 'react'
import { canAddPoint, isMatchDecided, setTarget, setWinner, tally } from '../logic/scoring'
import { canScore } from '../logic/pins'
import { store, useSession, useStore } from '../store/store'
import type { Match, State } from '../types'
import { ResultForm } from './ResultForm'
import { courtMatch, formatTime, PinGate, StatusPill, useLookups } from '../ui'

/** List of courts for referees to pick from. */
export function CourtPicker() {
  const state = useStore()
  const session = useSession()
  const { side } = useLookups(state)
  const courts = Array.from({ length: state.tournament.courts }, (_, i) => i + 1)
  return (
    <div className="page">
      <header className="bar">
        <a href="#na-zywo" className="back">← Wyniki</a>
        <h1>Tryb sędziego</h1>
      </header>
      <p className="muted">
        Wybierz swoje boisko i wpisz klucz, który dostałeś od sędziego głównego. Przy każdym boisku wisi też kartka
        z kodem QR, który prowadzi prosto tutaj.
      </p>
      <ul className="court-picker">
        {courts.map((c) => {
          const { current } = courtMatch(state, c)
          const mine = canScore(session, c)
          return (
            <li key={c}>
              <a href={`#boisko-${c}`} className={current?.status === 'live' ? 'is-live' : ''}>
                <span className="picker-head">
                  <b>Boisko {c}</b>
                  {current?.status === 'live' && <StatusPill status="live" />}
                </span>
                <span className="muted small">
                  {current ? `${formatTime(current.start)} ${side(current, 'a')} – ${side(current, 'b')}` : 'Brak meczów'}
                </span>
                <span className="picker-cta">{mine ? 'Otwórz punktację →' : 'Sędziuj (wymaga klucza) →'}</span>
              </a>
            </li>
          )
        })}
      </ul>
      {session && (
        <p className="muted small">
          Ten telefon jest zalogowany jako {session.role === 'admin' ? 'sędzia główny' : `sędzia boiska ${session.court}`}.{' '}
          <button className="linklike" onClick={() => store.logout()}>Wyloguj</button>
        </p>
      )}
    </div>
  )
}

/** `manual`: open straight in "type the result from the score sheet" mode. */
export function Court({ court, manual = false }: { court: number; manual?: boolean }) {
  const state = useStore()
  useWakeLock()
  return (
    <div className="page page-court">
      <header className="bar">
        <a href="#sedzia" className="back">← Boiska</a>
        <h1>Boisko {court}</h1>
      </header>
      <PinGate court={court} label={`Boisko ${court}`}>
        <CourtPanel state={state} court={court} manualFirst={manual} />
      </PinGate>
    </div>
  )
}

function CourtPanel({ state, court, manualFirst }: { state: State; court: number; manualFirst: boolean }) {
  const { categoryName, stageName, side } = useLookups(state)
  const [justFinished, setJustFinished] = useState<string | null>(null)
  const { current, next } = courtMatch(state, court)
  const [manual, setManual] = useState<string | null>(null)
  // "Podaj wynik" mode: every new match on this court opens straight in the result form.
  const ready = !!current?.teamA && !!current?.teamB && current.status !== 'finished'
  useEffect(() => {
    if (manualFirst && ready && current) setManual(current.id)
  }, [manualFirst, ready, current?.id])
  const finished = justFinished ? state.matches.find((m) => m.id === justFinished) : undefined

  if (finished) {
    const t = tally(state.tournament.rules, finished.sets)
    return (
      <section className="ref-card">
        <p className="eyebrow">Mecz zakończony</p>
        <h2>{side(finished, 'a')} {t.setsA}:{t.setsB} {side(finished, 'b')}</h2>
        <p className="muted">{finished.sets.map((s) => `${s.a}:${s.b}`).join(', ')}</p>
        <p>Wynik jest już na stronie. Pomyłkę może poprawić tylko sędzia główny.</p>
        <button className="btn btn-primary btn-lg" onClick={() => setJustFinished(null)}>
          {current ? 'Następny mecz' : 'Wróć'}
        </button>
      </section>
    )
  }

  if (!current) return <p className="muted">Na tym boisku nie ma już zaplanowanych meczów.</p>

  const meta = `${categoryName(current.categoryId)} · ${stageName(current)} · ${formatTime(current.start)}`
  const known = !!current.teamA && !!current.teamB
  const manualLink = known && (
    <button className="btn btn-lg" onClick={() => setManual(current.id)}>Podaj wynik z kartki</button>
  )

  if (manual === current.id) {
    return (
      <section className="ref-card">
        <p className="eyebrow">Podaj wynik</p>
        <p className="muted">{meta}</p>
        <ResultForm
          state={state}
          match={current}
          submitLabel="Zakończ mecz i wyślij wynik"
          onSubmit={(sets) => {
            store.updateMatch(current.id, (m) => ({ ...m, status: 'finished', sets }))
            setManual(null)
            setJustFinished(current.id)
          }}
        >
          <button type="button" className="btn" onClick={() => setManual(null)}>Anuluj</button>
        </ResultForm>
      </section>
    )
  }

  if (current.status === 'scheduled') {
    return (
      <section className="ref-card">
        <p className="eyebrow">Następny mecz</p>
        <p className="muted">{meta}</p>
        <h2 className="vs">
          <span>{side(current, 'a')}</span>
          <span className="muted">vs</span>
          <span>{side(current, 'b')}</span>
        </h2>
        <button
          className="btn btn-primary btn-lg"
          disabled={!current.teamA || !current.teamB}
          onClick={() => store.updateMatch(current.id, (m) => ({ ...m, status: 'live', sets: [{ a: 0, b: 0 }] }))}
        >
          {known ? 'Rozpocznij mecz i licz punkty' : 'Czekamy na wyniki poprzednich meczów'}
        </button>
        {manualLink}
        {next && <p className="muted small">Potem: {formatTime(next.start)} {side(next, 'a')} – {side(next, 'b')}</p>}
      </section>
    )
  }

  if (!current.sets.length) {
    // Marked as started by the chief referee without point-by-point scoring.
    return (
      <section className="ref-card">
        <p className="eyebrow">Mecz trwa</p>
        <p className="muted">{meta}</p>
        <h2 className="vs">
          <span>{side(current, 'a')}</span>
          <span className="muted">vs</span>
          <span>{side(current, 'b')}</span>
        </h2>
        <p>Sędzia główny oznaczył ten mecz jako trwający, bez liczenia punktów na żywo.</p>
        <button className="btn btn-primary btn-lg" onClick={() => store.updateMatch(current.id, (m) => ({ ...m, sets: [{ a: 0, b: 0 }] }))}>
          Licz punkty na żywo
        </button>
        {manualLink}
      </section>
    )
  }

  return (
    <>
      <LiveScoring state={state} match={current} meta={meta} onFinish={() => setJustFinished(current.id)} />
      <button className="btn btn-lg" onClick={() => setManual(current.id)}>Nie liczę na żywo, podaj wynik z kartki</button>
    </>
  )
}

function LiveScoring({ state, match, meta, onFinish }: { state: State; match: Match; meta: string; onFinish: () => void }) {
  const { side } = useLookups(state)
  const rules = state.tournament.rules
  const idx = match.sets.length - 1
  const set = match.sets[idx]
  const winner = setWinner(rules, idx, set)
  const decided = isMatchDecided(rules, match.sets)
  const t = tally(rules, match.sets)

  // Checked again inside the update, so a quick double tap cannot go past the end of a set.
  const change = (side: 'a' | 'b', delta: number) =>
    store.updateMatch(match.id, (m) => {
      const cur = m.sets[idx]
      if (!cur || (delta > 0 && !canAddPoint(rules, idx, cur))) return m
      const sets = m.sets.map((s, i) => (i === idx ? { ...s, [side]: Math.max(0, s[side] + delta) } : s))
      return { ...m, sets }
    })

  const nextSet = () => store.updateMatch(match.id, (m) =>
    setWinner(rules, m.sets.length - 1, m.sets[m.sets.length - 1]) && !isMatchDecided(rules, m.sets)
      ? { ...m, sets: [...m.sets, { a: 0, b: 0 }] }
      : m)
  const finish = () => {
    store.updateMatch(match.id, (m) => (isMatchDecided(rules, m.sets) ? { ...m, status: 'finished' } : m))
    onFinish()
  }

  return (
    <section className="scoring">
      <p className="muted center">{meta}</p>
      <p className="set-label">Set {idx + 1} · do {setTarget(rules, idx)} · sety {t.setsA}:{t.setsB}</p>
      <div className="pads">
        {(['a', 'b'] as const).map((s) => (
          <div key={s} className={`pad ${winner === s ? 'pad-won' : ''}`}>
            <span className="pad-team">{side(match, s)}</span>
            <span className="pad-score">{set[s]}</span>
            <button className="btn-plus" onClick={() => change(s, 1)} disabled={!!winner} aria-label={`Punkt dla ${side(match, s)}`}>
              +1
            </button>
            <button className="btn-minus" onClick={() => change(s, -1)} disabled={set[s] === 0}>
              −1 cofnij
            </button>
          </div>
        ))}
      </div>
      {idx > 0 && (
        <p className="muted center">Poprzednie sety: {match.sets.slice(0, -1).map((s) => `${s.a}:${s.b}`).join(', ')}</p>
      )}
      {winner && !decided && (
        <div className="notice">
          <p>Set {idx + 1} dla: <b>{side(match, winner)}</b> ({set.a}:{set.b})</p>
          <button className="btn btn-primary btn-lg" onClick={nextSet}>Zatwierdź seta, zacznij set {idx + 2}</button>
        </div>
      )}
      {decided && (
        <div className="notice">
          <p>Mecz rozstrzygnięty: <b>{t.setsA}:{t.setsB}</b></p>
          <button className="btn btn-primary btn-lg" onClick={finish}>Zakończ mecz i wyślij wynik</button>
        </div>
      )}
    </section>
  )
}

/** Keeps the referee's phone screen on while the panel is open (where the browser allows it). */
function useWakeLock() {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    nav.wakeLock?.request('screen').then((l) => { lock = l }).catch(() => {})
    return () => { lock?.release().catch(() => {}) }
  }, [])
}
