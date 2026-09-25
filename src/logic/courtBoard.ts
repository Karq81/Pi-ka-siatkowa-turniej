import type { Match, State } from '../types'

/** How long before the next match the court board switches to it. */
export const NEXT_MATCH_LEAD_MS = 5 * 60 * 1000

const at = (m: Match) => new Date(m.start).getTime()

/**
 * Whether a match is being played: started by a referee, or its start time has come
 * and no result is in yet (so the board says "Trwa" even if nobody pressed start).
 */
export function isUnderway(m: Match, now: number): boolean {
  if (m.status === 'live') return true
  return m.status === 'scheduled' && !!m.teamA && !!m.teamB && !!m.start && at(m) <= now
}

export interface CourtBoard {
  /** live: being played · finished: result on show · next: coming up · none: nothing left */
  mode: 'live' | 'finished' | 'next' | 'none'
  match?: Match
  /** The match after the one shown. */
  next?: Match
}

/**
 * What a court's board shows right now: the match being played; otherwise the last
 * result, until 5 minutes before the next match; then that next match.
 */
export function courtBoard(state: State, court: number, now: number): CourtBoard {
  const onCourt = state.matches.filter((m) => m.court === court).sort((a, b) => a.start.localeCompare(b.start))
  const upcoming = onCourt.filter((m) => m.status !== 'finished')
  const playing = upcoming.find((m) => isUnderway(m, now))
  if (playing) return { mode: 'live', match: playing, next: upcoming.find((m) => m !== playing && at(m) >= at(playing)) }
  const next = upcoming[0]
  const lastDone = onCourt.filter((m) => m.status === 'finished').at(-1)
  if (lastDone && (!next || now < at(next) - NEXT_MATCH_LEAD_MS)) return { mode: 'finished', match: lastDone, next }
  if (next) return { mode: 'next', match: next, next: upcoming[1] }
  return { mode: 'none' }
}
