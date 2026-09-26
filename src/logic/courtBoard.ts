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
  /** In "next" mode: the court's last result, still worth showing under the next match. */
  previous?: Match
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
  // The result on show is the one entered most recently (results are not always typed
  // in schedule order, and corrections change old ones). A result cleared later than
  // that (a match reset to not played) takes the board back to the matches to come.
  const lastDone = onCourt
    .filter((m) => m.status === 'finished')
    .reduce<Match | undefined>((best, m) => (!best || m.updatedAt >= best.updatedAt ? m : best), undefined)
  const clearedLater = lastDone && upcoming.some((m) => m.updatedAt > lastDone.updatedAt)
  if (lastDone && !clearedLater && (!next || now < at(next) - NEXT_MATCH_LEAD_MS)) return { mode: 'finished', match: lastDone, next }
  if (next) return { mode: 'next', match: next, next: upcoming[1], previous: lastDone && !clearedLater ? lastDone : undefined }
  return { mode: 'none' }
}

/**
 * The next round of matches, not on any court board yet: every match of the earliest
 * start time still to come (one per court, so up to 10). Once they start, the list
 * moves on to the round after.
 */
export function upcomingMatches(state: State, now: number): Match[] {
  const onBoards = new Set<string>()
  for (let c = 1; c <= state.tournament.courts; c++) {
    const id = courtBoard(state, c, now).match?.id
    if (id) onBoards.add(id)
  }
  const waiting = state.matches
    .filter((m) => m.status === 'scheduled' && !onBoards.has(m.id))
    .sort((a, b) => a.start.localeCompare(b.start) || a.court - b.court)
  const first = waiting[0]?.start
  return waiting.filter((m) => m.start === first)
}
