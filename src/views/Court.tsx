import { useEffect, useState } from 'react'
import { isMatchDecided, setTarget, setWinner, tally } from '../logic/scoring'
import { store, useStore } from '../store/store'
import type { Match, State } from '../types'
import { courtMatch, formatTime, PinGate, useLookups } from '../ui'

/** List of courts for referees to pick from. */
export function CourtPicker() {
  const state = useStore()
  const { side } = useLookups(state)
  const courts = Array.from({ length: state.tournament.courts }, (_, i) => i + 1)
  return (
    <div className="page">
      <header className="bar">
        <a href="#" className="back">← Wyniki</a>
        <h1>Wybierz boisko</h1>
      </header>
      <p className="muted">Przy każdym boisku wisi kartka z kodem QR, który prowadzi prosto do panelu tego boiska.</p>
      <ul className="court-picker">
        {courts.map((c) => {
          const { current } = courtMatch(state, c)
          return (
            <li key={c}>
              <a href={`#boisko-${c}`}>
                <b>Boisko {c}</b>
                <span className="muted small">
                  {current ? `${formatTime(current.start)} ${side(current, 'a')} – ${side(current, 'b')}` : 'Brak meczów'}
                </span>
              </a>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function Court({ court }: { court: number }) {
  const state = useStore()
  useWakeLock()
  return (
    <div className="page page-court">
      <header className="bar">
        <a href="#sedzia" className="back">← Boiska</a>
        <h1>Boisko {court}</h1>
      </header>
      <PinGate role="court" label={`Boisko ${court}`}>
        <CourtPanel state={state} court={court} />
      </PinGate>
    </div>
  )
}

function CourtPanel({ state, court }: { state: State; court: number }) {
  const { categoryName, stageName, side } = useLookups(state)
  const [justFinished, setJustFinished] = useState<string | null>(null)
  const { current, next } = courtMatch(state, court)
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
          {current.teamA && current.teamB ? 'Rozpocznij mecz' : 'Czekamy na wyniki poprzednich meczów'}
        </button>
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
      </section>
    )
  }

  return <LiveScoring state={state} match={current} meta={meta} onFinish={() => setJustFinished(current.id)} />
}

function LiveScoring({ state, match, meta, onFinish }: { state: State; match: Match; meta: string; onFinish: () => void }) {
  const { side } = useLookups(state)
  const rules = state.tournament.rules
  const idx = match.sets.length - 1
  const set = match.sets[idx]
  const winner = setWinner(rules, idx, set)
  const decided = isMatchDecided(rules, match.sets)
  const t = tally(rules, match.sets)

  const change = (side: 'a' | 'b', delta: number) =>
    store.updateMatch(match.id, (m) => {
      const sets = m.sets.map((s, i) => (i === idx ? { ...s, [side]: Math.max(0, s[side] + delta) } : s))
      return { ...m, sets }
    })

  const nextSet = () => store.updateMatch(match.id, (m) => ({ ...m, sets: [...m.sets, { a: 0, b: 0 }] }))
  const finish = () => {
    store.updateMatch(match.id, (m) => ({ ...m, status: 'finished' }))
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
            <button className="btn-plus" onClick={() => change(s, 1)} aria-label={`Punkt dla ${side(match, s)}`}>
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
