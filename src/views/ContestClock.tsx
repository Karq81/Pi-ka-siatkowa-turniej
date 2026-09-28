import { useEffect, useState } from 'react'
import { t } from '../i18n'
import { TOURNAMENT_ID } from '../config'
import { clock } from '../logic/judo'
import { partLabel, playOf } from '../logic/sports'
import { useNow } from '../ui'
import type { LiveClock, Match } from '../types'
import { store } from '../store/store'

/*
 * The match clock on the referee's phone: counts down each part of the game (a bout, a half,
 * a quarter), start and stop, corrections of a few seconds, and the next part. The phone
 * keeps it over a reload and sends every start, stop and correction to the fans' scoreboard.
 */

interface Saved {
  /** Time used in the current part, ms (without the run since `since`). */
  used: number
  since: number | null
  /** Current part, from 1. */
  part: number
}

const EMPTY: Saved = { used: 0, since: null, part: 1 }
const key = (id: string) => `sla:clock:${TOURNAMENT_ID}:${id}`

/** After the match: forgets the clock here and takes it off the fans' scoreboard. */
export function clearContestClock(id: string, court?: number) {
  try { localStorage.removeItem(key(id)) } catch { /* no storage */ }
  if (court && store.clock(court)?.match === id) store.publishClock(court, null)
}

/**
 * Timed penalties of one team (handball, hockey: 2 minutes; water polo: 20 s): each running
 * suspension counts down on the referee's phone; a tap on it removes it.
 */
export function PenaltyTimers({ id, seconds }: { id: string; seconds: number }) {
  const k = `sla:pen:${TOURNAMENT_ID}:${id}`
  const [ends, setEnds] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem(k) ?? '[]') as number[] } catch { return [] }
  })
  const now = useNow(500)
  const save = (next: number[]) => {
    setEnds(next)
    try { localStorage.setItem(k, JSON.stringify(next)) } catch { /* no storage */ }
  }
  const running = ends.filter((e) => e > now)
  const label = seconds >= 60 ? t('{n} min', { n: seconds / 60 }) : t('{n} s', { n: seconds })
  return (
    <div className="pen-timers">
      <button type="button" className="btn btn-sm" onClick={() => save([...running, Date.now() + seconds * 1000])}>+ {t('Kara')} {label}</button>
      {running.map((e) => (
        <button key={e} type="button" className="pen-timer" title={t('Dotknij, żeby usunąć')} onClick={() => save(running.filter((x) => x !== e))}>
          ⏱ {clock((e - now) / 1000)}
        </button>
      ))}
    </div>
  )
}

/** `parts`: how many parts the game has (2 halves, 4 quarters…); `partName`: "połowa", "kwarta"… */
export function ContestClock({ id, court, seconds, parts = 1, partName, onTimeUp }: {
  id: string
  /** The court whose scoreboard shows this clock to the fans. */
  court?: number
  seconds: number
  parts?: number
  partName?: (n: number) => string
  /** Tells whether the whole game's time is over (last part at 0:00). */
  onTimeUp?: (over: boolean) => void
}) {
  const [c, setC] = useState<Saved>(() => {
    try { return { ...EMPTY, ...JSON.parse(localStorage.getItem(key(id)) ?? 'null') } } catch { return EMPTY }
  })
  const total = seconds * 1000
  const publish = (s: Saved) => {
    if (!court) return
    const t0 = Date.now()
    const used = Math.min(total, s.used + (s.since !== null ? t0 - s.since : 0))
    store.publishClock(court, {
      match: id, ms: total - used, run: s.since !== null && used < total, at: store.now(),
      ...(parts > 1 ? { part: s.part } : {}),
    })
  }
  const save = (next: Saved) => {
    setC(next)
    try { localStorage.setItem(key(id), JSON.stringify(next)) } catch { /* no storage */ }
    publish(next)
  }
  // Opening the match (or reloading the page) shows the clock to the fans again.
  useEffect(() => { publish(c) }, [id, court])
  const now = useNow(250)
  const left = Math.max(0, total - c.used - (c.since !== null ? now - c.since : 0))
  const partOver = left <= 0
  const lastPart = c.part >= parts
  // At 0:00 the clock stops by itself.
  useEffect(() => {
    if (c.since !== null && partOver) save({ ...c, used: total, since: null })
  })
  const over = partOver && lastPart
  useEffect(() => { onTimeUp?.(over) }, [over])

  const start = () => save({ ...c, since: Date.now() })
  const stop = () => save({ ...c, used: Math.min(total, c.used + (c.since !== null ? Date.now() - c.since : 0)), since: null })
  const adjust = (d: number) => {
    const base = c.since !== null ? { used: c.used + (Date.now() - c.since), since: Date.now() } : { used: c.used, since: null }
    save({ ...c, ...base, used: Math.max(0, Math.min(total, base.used - d * 1000)) })
  }
  const running = c.since !== null
  return (
    <div className={`jd-clock contest-clock ${partOver ? 'up' : ''}`}>
      {parts > 1 && <span className="cc-part">{partName ? partName(c.part) : t('Część {n}', { n: c.part })}</span>}
      <span className="jd-time">{clock(left / 1000)}</span>
      {!partOver && (running
        ? <button type="button" className="btn btn-lg jd-matte" onClick={stop}>⏸ {t('Stop')}</button>
        : <button type="button" className="btn btn-primary btn-lg jd-hajime" onClick={start}>▶ {t('Start')}</button>)}
      {partOver && !lastPart && (
        <button type="button" className="btn btn-primary btn-lg" onClick={() => save({ used: 0, since: null, part: c.part + 1 })}>
          {t('Zacznij: {part}', { part: partName ? partName(c.part + 1) : t('Część {n}', { n: c.part + 1 }) })}
        </button>
      )}
      {over && <span className="cc-over">{t('Koniec czasu gry')}</span>}
      <details className="jd-fix">
        <summary>{t('Popraw czas')}</summary>
        <div className="jd-fix-row">
          {[-10, -1, 1, 10].map((d) => (
            <button key={d} type="button" className="btn btn-sm" onClick={() => adjust(d)}>{d > 0 ? `+${d}` : d} s</button>
          ))}
          {parts > 1 && c.part > 1 && <button type="button" className="btn btn-sm" onClick={() => save({ used: 0, since: null, part: c.part - 1 })}>← {t('poprzednia część')}</button>}
          <button type="button" className="btn btn-sm" onClick={() => save({ ...EMPTY, part: c.part })}>{t('Od nowa')}</button>
        </div>
      </details>
    </div>
  )
}

/** The time a court's clock shows now (ms), counting on from the referee's last message. */
export function clockShows(c: LiveClock, now: number): number {
  if (!c.run) return c.ms
  const ran = Math.max(0, now - c.at)
  return c.up ? c.ms + ran : Math.max(0, c.ms - ran)
}

/**
 * The game clock for the fans (live courts, the match page, the TV and the camera
 * scoreboard): shown while the referee runs a clock for this match.
 */
export function FanClock({ match, className = '' }: { match: Match; className?: string }) {
  useNow(500)
  const c = store.clock(match.court)
  if (!c || c.match !== match.id || match.status !== 'live') return null
  const ms = clockShows(c, store.now())
  const play = c.part ? playOf(store.get().tournament.rules) : null
  const label = c.golden ? 'Golden score' : c.part ? partLabel(play?.part ?? 'część', c.part) : ''
  return (
    <p className={`fan-clock ${c.run ? 'run' : 'stop'} ${!c.up && ms <= 0 ? 'over' : ''} ${className}`}>
      <span className="fc-icon" aria-hidden>⏱</span>
      {label && <span className="fc-label">{label}</span>}
      <b className="fc-time">{clock(ms / 1000)}</b>
      {!c.run && <span className="fc-note">{!c.up && ms <= 0 ? t('koniec czasu') : t('zegar zatrzymany')}</span>}
    </p>
  )
}
