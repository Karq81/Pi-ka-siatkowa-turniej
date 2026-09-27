import { t, tp } from '../i18n'
import { useEffect, useState } from 'react'
import { canAddPoint, isMatchDecided, isScore, scoreUnit, setCap, setTarget, setWinner, tally } from '../logic/scoring'
import { courtBoard } from '../logic/courtBoard'
import { setNextOnCourt } from '../logic/schedule'
import { canScore } from '../logic/pins'
import { store, useSession, useStore } from '../store/store'
import type { Match, State } from '../types'
import { ResultForm } from './ResultForm'
import { Upcoming } from './Public'
import { BackBar, courtLabel, courtMatch, formatTime, PinGate, StatusPill, useLookups, useNow } from '../ui'

/** List of courts for referees to pick from. */
export function CourtPicker() {
  return (
    <div className="page">
      <BackBar fallback="panel-sedziowie" />
      <header className="bar">
        <h1>{t('Tryb sędziego')}</h1>
      </header>
      <CourtList />
    </div>
  )
}

/** Every court with its current match and the two ways to score it. */
export function CourtList() {
  const state = useStore()
  const session = useSession()
  const { side } = useLookups(state)
  const courts = Array.from({ length: state.tournament.courts }, (_, i) => i + 1)
  const now = useNow(15000)
  return (
    <>
      <p className="muted">
        {t('Wybierz boisko i wpisz klucz, który dostałeś od sędziego głównego. Przy każdym boisku wisi też kartka z kodem QR, który prowadzi prosto do tego boiska.')}
      </p>
      <ul className="court-picker">
        {courts.map((c) => {
          const board = courtBoard(state, c, now)
          const current = board.match
          const mine = canScore(session, c)
          const res = current?.sets.at(-1)
          return (
            <li key={c} className={`picker-card ${board.mode === 'live' ? 'is-live' : ''}`}>
              <span className="picker-head">
                <b>{t('Boisko {n}', { n: courtLabel(c) })}</b>
                {board.mode === 'live' && <StatusPill status="live" />}
                {board.mode === 'finished' && <StatusPill status="finished" />}
                {board.mode === 'next' && <span className="pill pill-next">{t('Następne')}<span className="pill-long"> {t('spotkanie')}</span></span>}
              </span>
              <span className="small">
                {current ? (
                  <>
                    <b>{formatTime(current.start)}</b> {side(current, 'a')} – {side(current, 'b')}
                    {board.mode === 'finished' && res && <b> · {res.a}:{res.b}</b>}
                  </>
                ) : t('Brak meczów')}
              </span>
              <span className="ref-links">
                <a className="btn btn-ref" href={`#boisko-${c}`}>{t('Sędziuj na żywo')}</a>
                <a className="btn btn-ref" href={`#wynik-${c}`}>{t('Podaj wynik')}</a>
              </span>
              {!mine && <span className="muted small">{t('Wymaga klucza boiska {n}', { n: courtLabel(c) })}</span>}
              {session?.role === 'admin' && <NextTimeForm state={state} court={c} />}
            </li>
          )
        })}
      </ul>
      <Upcoming state={state} />
      {session && (
        <p className="muted small">
          {session.role === 'admin'
            ? t('Ten telefon jest zalogowany jako sędzia główny.')
            : t('Ten telefon jest zalogowany jako sędzia boiska {court}.', { court: courtLabel(session.court ?? 0) })}{' '}
          <button className="linklike" onClick={() => store.logout()}>{t('Wyloguj')}</button>
        </p>
      )}
    </>
  )
}

/**
 * Chief referee only: set by hand when the court's next match starts (normally it is
 * 2 minutes after the last result). The court's later matches that day move with it.
 */
function NextTimeForm({ state, court }: { state: State; court: number }) {
  const next = state.matches
    .filter((m) => m.court === court && m.status === 'scheduled')
    .sort((a, b) => a.start.localeCompare(b.start))[0]
  const [time, setTime] = useState(next ? next.start.slice(11, 16) : '')
  const [msg, setMsg] = useState('')
  useEffect(() => { if (next) setTime(next.start.slice(11, 16)) }, [next?.start])
  if (!next) return null
  const live = state.matches.some((m) => m.court === court && m.status === 'live')
  const valid = /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  const save = async () => {
    const moved = setNextOnCourt(state.matches, court, time)
    if (!moved.length) { setMsg(t('Bez zmian.')); return }
    const byId = new Map(moved.map((m) => [m.id, m]))
    await store.replace({ ...state, matches: state.matches.map((m) => byId.get(m.id) ?? m) })
    setMsg(`${t('Następny mecz o {time}.', { time })} ${tp(moved.length, 'Przesunięto {n} mecz na tym boisku.|Przesunięto {n} mecze na tym boisku.|Przesunięto {n} meczów na tym boisku.')}`)
  }
  return (
    <div className="next-time">
      <label>{t('Następny mecz o')}
        <input
          id={`next-time-${court}`} type="text" inputMode="numeric" placeholder="15:45" maxLength={5} value={time} disabled={live}
          onChange={(e) => {
            // 24-hour HH:MM whatever the phone's settings; "1545" becomes "15:45".
            const d = e.target.value.replace(/\D/g, '').slice(0, 4)
            setTime(d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d)
            setMsg('')
          }}
        />
      </label>
      <button className="btn btn-sm" disabled={live || !valid || time === next.start.slice(11, 16)} onClick={save}>{t('Ustaw')}</button>
      {live && <span className="muted small">{t('Mecz trwa: godzinę następnego ustawisz po jego zakończeniu.')}</span>}
      {msg && <span className="ok small">{msg}</span>}
    </div>
  )
}

/** `manual`: open straight in "type the result from the score sheet" mode. */
export function Court({ court, manual = false }: { court: number; manual?: boolean }) {
  const state = useStore()
  useWakeLock()
  return (
    <div className="page page-court">
      <BackBar fallback="panel-sedziowie" />
      <header className="bar">
        <h1>{t('Boisko {n}', { n: courtLabel(court) })}</h1>
      </header>
      <PinGate court={court} label={t('Boisko {n}', { n: courtLabel(court) })}>
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
    const tl = tally(state.tournament.rules, finished.sets)
    return (
      <section className="ref-card">
        <p className="eyebrow">{t('Mecz zakończony')}</p>
        <h2>{side(finished, 'a')} {tl.setsA}:{tl.setsB} {side(finished, 'b')}</h2>
        <p className="muted">{finished.sets.map((s) => `${s.a}:${s.b}`).join(', ')}</p>
        <p>{t('Wynik jest już na stronie. Pomyłkę może poprawić tylko sędzia główny.')}</p>
        {current && (
          <p className="next-on-court">
            {t('Następny mecz na tym boisku:')} <b>{formatTime(current.start)}</b> {t('(2 minuty po zakończeniu)')}<br />
            {side(current, 'a')} – {side(current, 'b')}
          </p>
        )}
        <button className="btn btn-primary btn-lg" onClick={() => setJustFinished(null)}>
          {current ? t('Następny mecz') : t('Wróć')}
        </button>
      </section>
    )
  }

  if (!current) return <p className="muted">{t('Na tym boisku nie ma już zaplanowanych meczów.')}</p>

  const meta = `${categoryName(current.categoryId)} · ${stageName(current)} · ${formatTime(current.start)}`
  const known = !!current.teamA && !!current.teamB
  const manualLink = known && (
    <button className="btn btn-lg" onClick={() => setManual(current.id)}>{t('Podaj wynik z kartki')}</button>
  )

  if (manual === current.id) {
    return (
      <section className="ref-card">
        <p className="eyebrow">{t('Podaj wynik')}</p>
        <p className="muted">{meta}</p>
        <ResultForm
          state={state}
          match={current}
          submitLabel={t('Zakończ mecz i wyślij wynik')}
          onSubmit={(sets) => {
            store.updateMatch(current.id, (m) => ({ ...m, status: 'finished', sets }))
            setManual(null)
            setJustFinished(current.id)
          }}
        >
          <button type="button" className="btn" onClick={() => setManual(null)}>{t('Anuluj')}</button>
        </ResultForm>
      </section>
    )
  }

  if (current.status === 'scheduled') {
    return (
      <section className="ref-card">
        <p className="eyebrow">{t('Następny mecz')}</p>
        <p className="muted">{meta}</p>
        <h2 className="vs">
          <span>{side(current, 'a')}</span>
          <span className="muted">{t('vs')}</span>
          <span>{side(current, 'b')}</span>
        </h2>
        <button
          className="btn btn-primary btn-lg"
          disabled={!current.teamA || !current.teamB}
          onClick={() => store.updateMatch(current.id, (m) => ({ ...m, status: 'live', sets: [{ a: 0, b: 0 }] }))}
        >
          {known ? t('Rozpocznij mecz i licz: {unit}', { unit: isScore(state.tournament.rules) ? scoreUnit(state.tournament.rules) : t('punkty') }) : t('Czekamy na wyniki poprzednich meczów')}
        </button>
        {manualLink}
        {next && <p className="muted small">{t('Potem:')} {formatTime(next.start)} {side(next, 'a')} – {side(next, 'b')}</p>}
      </section>
    )
  }

  if (!current.sets.length) {
    // Marked as started by the chief referee without point-by-point scoring.
    return (
      <section className="ref-card">
        <p className="eyebrow">{t('Mecz trwa')}</p>
        <p className="muted">{meta}</p>
        <h2 className="vs">
          <span>{side(current, 'a')}</span>
          <span className="muted">{t('vs')}</span>
          <span>{side(current, 'b')}</span>
        </h2>
        <p>{t('Sędzia główny oznaczył ten mecz jako trwający, bez liczenia wyniku na żywo.')}</p>
        <button className="btn btn-primary btn-lg" onClick={() => store.updateMatch(current.id, (m) => ({ ...m, sets: [{ a: 0, b: 0 }] }))}>
          {t('Licz wynik na żywo')}
        </button>
        {manualLink}
      </section>
    )
  }

  return (
    <>
      <LiveScoring state={state} match={current} meta={meta} onFinish={() => setJustFinished(current.id)} />
      <button className="btn btn-lg" onClick={() => setManual(current.id)}>{t('Nie liczę na żywo, podaj wynik z kartki')}</button>
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
  const tl = tally(rules, match.sets)
  const score = isScore(rules)

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
      <p className="set-label">
        {score
          ? t('Wynik na żywo ({unit})', { unit: scoreUnit(rules) })
          : rules.sets > 1
            ? t('Set {n} · do {target} · sety {sets}', { n: idx + 1, target: setTarget(rules, idx), sets: `${tl.setsA}:${tl.setsB}` })
            : [
                rules.unit === 'gemy' ? t('Do {n} gemów', { n: setTarget(rules, idx) }) : t('Do {n} pkt', { n: setTarget(rules, idx) }),
                t('przewaga {n}', { n: rules.winBy }),
                ...(setCap(rules, idx) ? [t('maks. {n}', { n: setCap(rules, idx)! })] : []),
              ].join(' · ')}
      </p>
      <div className="pads">
        {(['a', 'b'] as const).map((s) => (
          <div key={s} className={`pad ${!score && winner === s ? 'pad-won' : ''}`}>
            <span className="pad-team">{side(match, s)}</span>
            <span className="pad-score">{set[s]}</span>
            <button className="btn-plus" onClick={() => change(s, 1)} disabled={!canAddPoint(rules, idx, set)} aria-label={t('Punkt dla: {team}', { team: side(match, s) })}>
              +1
            </button>
            <button className="btn-minus" onClick={() => change(s, -1)} disabled={set[s] === 0}>
              −1 {t('cofnij')}
            </button>
          </div>
        ))}
      </div>
      {idx > 0 && (
        <p className="muted center">{t('Poprzednie sety:')} {match.sets.slice(0, -1).map((s) => `${s.a}:${s.b}`).join(', ')}</p>
      )}
      {!score && winner && !decided && (
        <div className="notice">
          <p>{t('Set {n} dla:', { n: idx + 1 })} <b>{side(match, winner)}</b> ({set.a}:{set.b})</p>
          <button className="btn btn-primary btn-lg" onClick={nextSet}>{t('Zatwierdź seta, zacznij set {n}', { n: idx + 2 })}</button>
        </div>
      )}
      {score && !decided && set.a === set.b && (set.a > 0) && (
        <p className="muted center">{t('Remis: bez remisów w tym turnieju, grajcie dogrywkę lub karne.')}</p>
      )}
      {decided && (
        <div className="notice">
          <p>{score ? <>{t('Koniec meczu? Wynik')} <b>{set.a}:{set.b}</b></> : <>{t('Mecz rozstrzygnięty:')} <b>{tl.setsA}:{tl.setsB}</b></>}</p>
          <button className="btn btn-primary btn-lg" onClick={finish}>{t('Zakończ mecz i wyślij wynik')}</button>
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
