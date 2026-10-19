import type { Match } from '../types'

/** Local "YYYY-MM-DDTHH:MM" of a time, the same format as Match.start. */
const localStamp = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * The tournament is going on: from the first match (its start time, or any match already
 * live or played) until every match is finished (matches left out do not count).
 */
export function tournamentUnderway(matches: Match[], now: Date): boolean {
  const counted = matches.filter((m) => !m.skipped && !m.bye)
  if (!counted.length) return false
  if (counted.every((m) => m.status === 'finished')) return false
  const started = counted.some((m) => m.status !== 'scheduled')
  const first = counted.map((m) => m.start).filter(Boolean).sort()[0]
  return started || (!!first && localStamp(now) >= first.slice(0, 16))
}
