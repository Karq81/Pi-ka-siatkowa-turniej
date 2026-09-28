import { useEffect, useState, type ReactNode } from 'react'
import { t } from '../i18n'
import { TOURNAMENT_ID } from '../config'
import {
  clock, hasIppon, judoAdd, judoOf, judoResult, judoSet, judoStopped, judoWinName, OSAEKOMI, osaekomiScore,
  type JudoAction,
} from '../logic/judo'
import { store } from '../store/store'
import type { JudoScore, JudoSide, Match, Rules, SetScore, State } from '../types'
import { useLookups, useNow } from '../ui'

/*
 * Judo on the referee's phone, laid out like a judo scoreboard: the contest clock
 * (Hajime / Matte), golden score, osaekomi with the scores it gives, and for each judoka
 * Ippon, Waza-ari, Yuko and Shido with a way to take a mistake back. The clock lives on this
 * phone only (kept over a reload); the scores go to the fans at once.
 */

interface Clock {
  /** Regular time used, ms (not counting the run since `since`). */
  used: number
  /** Golden score time used, ms. */
  golden: number
  /** Running since (ms), or null when stopped (Matte). */
  since: number | null
  /** Osaekomi: who holds, since when. */
  hold: { side: 'a' | 'b'; since: number } | null
}

const STOPPED: Clock = { used: 0, golden: 0, since: null, hold: null }
const clockKey = (id: string) => `sla:judo:${TOURNAMENT_ID}:${id}`

function useClock(matchId: string): [Clock, (c: Clock) => void] {
  const [c, setC] = useState<Clock>(() => {
    try { return { ...STOPPED, ...JSON.parse(localStorage.getItem(clockKey(matchId)) ?? 'null') } } catch { return STOPPED }
  })
  const save = (next: Clock) => {
    setC(next)
    try { localStorage.setItem(clockKey(matchId), JSON.stringify(next)) } catch { /* no storage */ }
  }
  return [c, save]
}

export function JudoScoring({ state, match, meta, onFinish }: { state: State; match: Match; meta: string; onFinish: () => void }) {
  const { side } = useLookups(state)
  const rules = state.tournament.rules
  const fightMs = (rules.fightSeconds ?? 240) * 1000
  const j = judoOf(match.sets[0])
  const result = judoResult(j)
  const stopped = judoStopped(j)
  const [c, setClock] = useClock(match.id)
  const now = useNow(200)

  const run = c.since !== null ? now - c.since : 0
  const regularLeft = j.golden ? 0 : Math.max(0, fightMs - c.used - run)
  const goldenUsed = j.golden ? c.golden + run : 0
  const holdSec = c.hold ? (now - c.hold.since) / 1000 : 0
  const timeUp = !j.golden && regularLeft <= 0

  const change = (fn: (x: JudoScore) => JudoScore) => store.updateMatch(match.id, (m) => {
    const cur = judoOf(m.sets[0])
    const next = fn(cur)
    return next === cur ? m : { ...m, sets: [judoSet(next)] }
  })
  const add = (s: 'a' | 'b', a: JudoAction, d: 1 | -1) => change((x) => judoAdd(x, s, a, d))

  /** Stops the clock (Matte), keeping the time used. */
  const pause = (base: Clock = c): Clock => base.since === null ? base : j.golden
    ? { ...base, golden: base.golden + (Date.now() - base.since), since: null }
    : { ...base, used: Math.min(fightMs, base.used + (Date.now() - base.since)), since: null }
  const hajime = () => setClock({ ...c, since: Date.now() })
  const matte = () => setClock({ ...pause(), hold: null })

  // Osaekomi: at 5 s yuko (golden score ends there), 10 s waza-ari (ippon with one already), 20 s ippon.
  const endHold = (award: boolean) => {
    if (!c.hold) return
    const score = award ? osaekomiScore(holdSec) : null
    if (score) add(c.hold.side, score, 1)
    setClock({ ...c, hold: null })
  }
  useEffect(() => {
    if (!c.hold) return
    const holder = j[c.hold.side]
    const done = (j.golden && holdSec >= OSAEKOMI.yuko)
      || holdSec >= OSAEKOMI.ippon
      || (holder.wazaari >= 1 && holdSec >= OSAEKOMI.wazaari)
    if (done) endHold(true)
  })

  // Regular time over: the clock stops by itself (an osaekomi still running goes on).
  useEffect(() => {
    if (c.since !== null && !j.golden && regularLeft <= 0 && !c.hold) setClock({ ...c, used: fightMs, since: null })
  })
  // A score or penalty that ends the contest stops the clock.
  useEffect(() => {
    if (stopped && (c.since !== null || c.hold)) setClock({ ...pause(), hold: null })
  }, [stopped])

  const toGolden = () => {
    change((x) => ({ ...x, golden: true }))
    setClock({ ...c, since: null, golden: 0, hold: null })
  }
  const finish = () => {
    store.updateMatch(match.id, (m) => (judoResult(judoOf(m.sets[0])) ? { ...m, status: 'finished' } : m))
    try { localStorage.removeItem(clockKey(match.id)) } catch { /* no storage */ }
    onFinish()
  }

  const running = c.since !== null
  return (
    <section className="scoring judo">
      <p className="muted center">{meta}</p>
      <div className={`jd-clock ${j.golden ? 'gs' : ''} ${timeUp && !stopped ? 'up' : ''}`}>
        <span className="jd-time">{j.golden ? `GS ${clock(goldenUsed / 1000)}` : clock(regularLeft / 1000)}</span>
        {!stopped && !(timeUp && !c.hold) && (
          running
            ? <button type="button" className="btn btn-lg jd-matte" onClick={matte}>✋ {t('Matte (stop)')}</button>
            : <button type="button" className="btn btn-primary btn-lg jd-hajime" onClick={hajime}>▶ {t('Hajime (start)')}</button>
        )}
      </div>
      {c.hold && (
        <div className="jd-hold">
          <span>{t('Osaekomi')}: <b>{side(match, c.hold.side)}</b> · <b className="jd-hold-time">{Math.floor(holdSec)} s</b>
            {' '}<span className="muted small">{holdSec >= OSAEKOMI.wazaari ? t('waza-ari') : holdSec >= OSAEKOMI.yuko ? t('yuko') : t('jeszcze bez oceny')}</span>
          </span>
          <button type="button" className="btn btn-lg" onClick={() => endHold(true)}>{t('Toketa (koniec trzymania)')}</button>
          <button type="button" className="linklike small" onClick={() => endHold(false)}>{t('Anuluj trzymanie')}</button>
        </div>
      )}
      <div className="pads jd-pads">
        {(['a', 'b'] as const).map((s) => (
          <div key={s} className={`pad jd-pad jd-${s === 'a' ? 'white' : 'blue'} ${result?.winner === s && stopped ? 'pad-won' : ''}`}>
            <span className="pad-team">{side(match, s)}</span>
            <JudoBoard side={j[s]} />
            <div className="jd-actions">
              <button type="button" className="jd-btn jd-ippon" disabled={stopped} onClick={() => add(s, 'ippon', 1)}>{t('Ippon')}</button>
              <button type="button" className="jd-btn jd-waza" disabled={stopped} onClick={() => add(s, 'wazaari', 1)}>{t('Waza-ari')}</button>
              <button type="button" className="jd-btn jd-yuko" disabled={stopped} onClick={() => add(s, 'yuko', 1)}>{t('Yuko')}</button>
              <button type="button" className="jd-btn jd-shido" disabled={stopped} onClick={() => add(s, 'shido', 1)}>{t('Shido')}</button>
            </div>
            {!c.hold && !stopped && (
              <button type="button" className="btn jd-osae" onClick={() => setClock({ ...(running ? c : { ...c, since: Date.now() }), hold: { side: s, since: Date.now() } })}>
                ⏱ {t('Osaekomi (trzymanie)')}
              </button>
            )}
            <div className="jd-undo">
              <span className="muted small">{t('Cofnij:')}</span>
              {(['ippon', 'wazaari', 'yuko', 'shido'] as const).map((a) => (
                <button key={a} type="button" className="linklike small" disabled={!j[s][a]} onClick={() => add(s, a, -1)}>
                  −{a === 'ippon' ? 'I' : a === 'wazaari' ? 'W' : a === 'yuko' ? 'Y' : 'S'}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {timeUp && !result && !j.golden && !c.hold && (
        <div className="notice">
          <p>{t('Koniec czasu, wynik równy. Dalej golden score: bez limitu czasu, wygrywa pierwsza ocena (albo hansoku-make).')}</p>
          <button className="btn btn-primary btn-lg" onClick={toGolden}>{t('Zacznij golden score')}</button>
        </div>
      )}
      {result && (
        <div className="notice">
          <p>
            {stopped || timeUp ? t('Wygrywa:') : t('Prowadzi:')} <b>{side(match, result.winner)}</b> · {judoWinName(result.by)}{j.golden ? ' · Golden score' : ''}
            {!stopped && !timeUp && <span className="muted small"> · {t('czas jeszcze leci, walka trwa do końca czasu')}</span>}
          </p>
          <button className={`btn btn-lg ${stopped || timeUp ? 'btn-primary' : ''}`} onClick={finish}>{t('Zakończ walkę i wyślij wynik')}</button>
        </div>
      )}
      <details className="jd-more">
        <summary>{t('Inne rozstrzygnięcie (decyzja sędziów, poddanie, kontuzja)')}</summary>
        <p className="muted small">{t('Np. u dzieci po golden score albo gdy zawodnik nie może walczyć dalej (kiken).')}</p>
        <div className="actions">
          {(['a', 'b'] as const).map((s) => (
            <button key={s} type="button" className="btn" onClick={() => change((x) => ({ ...x, decision: x.decision === s ? undefined : s }))}>
              {j.decision === s ? '✓ ' : ''}{t('Wygrywa: {name}', { name: side(match, s) })}
            </button>
          ))}
        </div>
      </details>
    </section>
  )
}

/** One judoka's scores like on a judo scoreboard: I W Y and the shido cards. */
export function JudoBoard({ side }: { side: JudoSide }) {
  const ippon = hasIppon(side)
  return (
    <div className="jd-board">
      <span className={ippon ? 'on' : ''}><small>I</small><b>{ippon ? 1 : 0}</b></span>
      <span><small>W</small><b>{Math.min(side.wazaari, ippon && !side.ippon ? 2 : side.wazaari)}</b></span>
      <span><small>Y</small><b>{side.yuko}</b></span>
      <span className="jd-cards" title={t('Shido: {n}', { n: side.shido })}>
        {Array.from({ length: side.shido }, (_, i) => <i key={i} className={side.shido >= 3 ? 'red' : ''} />)}
      </span>
    </div>
  )
}

/** Under a contest's score for fans: golden score in progress, or how it was won. */
export function JudoNote({ rules, set, live }: { rules: Rules; set: SetScore; live: boolean }) {
  if (rules.scoring !== 'judo') return null
  const j = judoOf(set)
  const r = judoResult(j)
  const text: ReactNode[] = []
  if (r && (!live || judoStopped(j))) text.push(<b key="r">{judoWinName(r.by)}</b>)
  if (j.golden) text.push(<span key="g">Golden score</span>)
  if (!text.length) return null
  return <p className="jd-note">{text.reduce<ReactNode[]>((acc, x, i) => (i ? [...acc, ' · ', x] : [x]), [])}</p>
}

/** Typing a contest from the score sheet: scores, shido, golden score and a decision. */
export function JudoResultForm({ state, match, submitLabel, onSubmit, children }: {
  state: State
  match: Match
  submitLabel: string
  onSubmit: (sets: SetScore[]) => void
  children?: ReactNode
}) {
  const { side } = useLookups(state)
  const [j, setJ] = useState<JudoScore>(() => judoOf(match.sets[0]))
  const [tried, setTried] = useState(false)
  const result = judoResult(j)
  const num = (s: 'a' | 'b', k: keyof JudoSide, max: number) => (
    <input type="number" inputMode="numeric" min={0} max={max} value={j[s][k]}
      aria-label={`${k}, ${side(match, s)}`}
      onChange={(e) => setJ({ ...j, [s]: { ...j[s], [k]: Math.max(0, Math.min(max, Number(e.target.value) || 0)) } })} />
  )
  return (
    <form className="result-form jd-form" onSubmit={(e) => { e.preventDefault(); setTried(true); if (result) onSubmit([judoSet(j)]) }}>
      <table className="jd-form-table">
        <thead>
          <tr><th /><th>{t('Ippon')}</th><th>{t('Waza-ari')}</th><th>{t('Yuko')}</th><th>{t('Shido')}</th></tr>
        </thead>
        <tbody>
          {(['a', 'b'] as const).map((s) => (
            <tr key={s}>
              <th className="rf-team">{side(match, s)}</th>
              <td><input type="checkbox" checked={j[s].ippon > 0} aria-label={`Ippon, ${side(match, s)}`}
                onChange={(e) => setJ({ ...j, [s]: { ...j[s], ippon: e.target.checked ? 1 : 0 } })} /></td>
              <td>{num(s, 'wazaari', 2)}</td>
              <td>{num(s, 'yuko', 99)}</td>
              <td>{num(s, 'shido', 3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <label className="check">
        <input type="checkbox" checked={!!j.golden} onChange={(e) => setJ({ ...j, golden: e.target.checked || undefined })} /> {t('Rozstrzygnięta w golden score')}
      </label>
      <label>{t('Decyzja sędziów / poddanie (tylko gdy nie rozstrzygnęły oceny)')}
        <select value={j.decision ?? ''} onChange={(e) => setJ({ ...j, decision: (e.target.value || undefined) as JudoScore['decision'] })}>
          <option value="">{t('brak')}</option>
          <option value="a">{t('Wygrywa: {name}', { name: side(match, 'a') })}</option>
          <option value="b">{t('Wygrywa: {name}', { name: side(match, 'b') })}</option>
        </select>
      </label>
      <p className="rf-total">
        {result ? <>{t('Wygrywa:')} <b>{side(match, result.winner)}</b> · {judoWinName(result.by)}</> : <span className="muted">{t('Walka jeszcze nierozstrzygnięta.')}</span>}
      </p>
      {tried && !result && <p className="error" role="alert">{t('Walka nie jest rozstrzygnięta. Przy równym wyniku jest golden score: wygrywa pierwsza ocena. Możesz też zaznaczyć decyzję sędziów.')}</p>}
      <div className="actions">
        <button className="btn btn-primary btn-lg" type="submit">{submitLabel}</button>
        {children}
      </div>
      <p className="muted small">{t('Dwa waza-ari to ippon. Yuko nie sumują się w waza-ari. Trzecie shido to przegrana (hansoku-make).')}</p>
    </form>
  )
}
