import type { Group, Match } from '../types'

/**
 * Round-robin pairings (circle method, Berger tables): the first team stays in place, the
 * others move one position each round; with an odd number an empty "bye" place is added, so
 * each round one team rests. Returns rounds of [home (teamA), away (teamB)]. Home and away
 * (first-named, first serve, white) alternate: the fixed team switches every round, and in
 * the other pairs the team in an odd position is at home. Nobody plays three home or three
 * away matches in a row, and there are only n−2 "breaks" (two in a row), the fewest possible.
 */
export function roundRobin(teamIds: string[]): [string, string][][] {
  const ids = [...teamIds]
  if (ids.length < 2) return []
  if (ids.length % 2 === 1) ids.push('') // bye
  const n = ids.length
  const rounds: [string, string][][] = []
  for (let r = 0; r < n - 1; r++) {
    const round: [string, string][] = []
    for (let i = 0; i < n / 2; i++) {
      const a = ids[i]
      const b = ids[n - 1 - i]
      if (!a || !b) continue
      const aHome = i === 0 ? r % 2 === 0 : i % 2 === 1
      round.push(aHome ? [a, b] : [b, a])
    }
    rounds.push(round)
    ids.splice(1, 0, ids.pop()!) // rotate all but the first
  }
  return rounds
}

export interface ScheduleOptions {
  courts: number
  /** First slot, ISO local date-time. */
  start: string
  slotMinutes: number
  /** Last slot of a day starts no later than this time (HH:MM); then play moves to the next day. */
  dayEnd: string
  /** First slot on the following days (HH:MM); defaults to the time of `start`. */
  dayStart?: string
  /** Each pair plays twice, the second time with sides swapped (after all first matches). */
  twice?: boolean
  /** Rounds a team rests between its matches (0: may play in the next round; 1: sits out at least one). */
  rest?: number
  /** Times of day when no match starts (lunch): a round that would start then waits until `to`. */
  breaks?: TimeBreak[]
  /**
   * The people behind a team (a player's name; both players of a pair), so a player entered
   * in two categories (singles and doubles) never has two matches at the same time.
   */
  keysOf?: (teamId: string) => string[]
}

/** The people behind a team: "Kowalski / Nowak" → both names, lowercase. */
export function personKeys(name: string): string[] {
  return name.split(/\s*(?:\/|&|\+|,)\s*/).map((x) => x.trim().toLowerCase().replace(/\s+/g, ' ')).filter(Boolean)
}

export interface TimeBreak {
  /** HH:MM */
  from: string
  to: string
}

/**
 * The start of the round after `iso`: `slotMinutes` later, then past any break of the day,
 * and after `dayEnd` the next morning at `dayStart`.
 */
export function nextSlot(iso: string, opts: { slotMinutes: number; dayEnd: string; dayStart: string; breaks?: TimeBreak[] }): string {
  let next = addMinutes(iso, opts.slotMinutes)
  for (const b of [...(opts.breaks ?? [])].sort((x, y) => x.from.localeCompare(y.from))) {
    const at = next.slice(11)
    if (at >= b.from && at < b.to) next = `${next.slice(0, 10)}T${b.to}`
  }
  if (next.slice(11) > opts.dayEnd) next = addMinutes(`${iso.slice(0, 10)}T${opts.dayStart}`, 24 * 60)
  return next
}

function addMinutes(iso: string, minutes: number): string {
  const d = new Date(iso)
  d.setMinutes(d.getMinutes() + minutes)
  return toLocalIso(d)
}

export function toLocalIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * Builds group matches and places them on courts in time slots so that
 * no team plays twice in the same slot. Rounds from all groups are
 * interleaved so every group progresses at a similar pace.
 */
export function buildGroupSchedule(groups: Group[], opts: ScheduleOptions): Match[] {
  const queue: Omit<Match, 'court' | 'start'>[] = []
  const perGroup = groups.map((g) => {
    const rounds = roundRobin(g.teamIds)
    return { g, rounds: opts.twice ? [...rounds, ...rounds.map((r) => r.map(([a, b]) => [b, a] as [string, string]))] : rounds }
  })
  const maxRounds = Math.max(0, ...perGroup.map((x) => x.rounds.length))
  let seq = 0
  for (let r = 0; r < maxRounds; r++) {
    for (const { g, rounds } of perGroup) {
      for (const [a, b] of rounds[r] ?? []) {
        queue.push({
          id: `m${++seq}`, categoryId: g.categoryId, groupId: g.id,
          teamA: a, teamB: b, sets: [], status: 'scheduled', updatedAt: 0,
        })
      }
    }
  }

  const result: Match[] = []
  const startTime = opts.dayStart ?? opts.start.slice(11)
  const rest = Math.max(0, opts.rest ?? 0)
  // Round in which each team last played, so it rests `rest` rounds before its next match.
  const lastRound = new Map<string, number>()
  const rested = (id: string, round: number) => !lastRound.has(id) || round - lastRound.get(id)! > rest
  let slot = opts.start
  for (let round = 0; queue.length; round++) {
    const busy = new Set<string>()
    const people = (id: string) => [id, ...(opts.keysOf?.(id) ?? [])]
    const isBusy = (id: string) => people(id).some((k) => busy.has(k))
    let court = 1
    for (let i = 0; i < queue.length && court <= opts.courts; ) {
      const m = queue[i]
      if (isBusy(m.teamA) || isBusy(m.teamB) || !rested(m.teamA, round) || !rested(m.teamB, round)) { i++; continue }
      for (const k of [...people(m.teamA), ...people(m.teamB)]) busy.add(k)
      lastRound.set(m.teamA, round); lastRound.set(m.teamB, round)
      result.push({ ...m, court: court++, start: slot })
      queue.splice(i, 1)
    }
    slot = nextSlot(slot, { slotMinutes: opts.slotMinutes, dayEnd: opts.dayEnd, dayStart: startTime, breaks: opts.breaks })
  }
  return result
}

/**
 * New match interval for the rest of the tournament. Time slots that have started
 * (a match in them is live or finished) keep their times; the first slot still to be
 * played keeps its time too, and every later slot follows it at `slotMinutes`,
 * moving to the next morning (`dayStart`) after `dayEnd`. Courts and pairings stay.
 */
export function retimeSchedule(
  matches: Match[], opts: { slotMinutes: number; dayEnd: string; dayStart: string; breaks?: TimeBreak[] },
): Match[] {
  const starts = [...new Set(matches.map((m) => m.start).filter(Boolean))].sort()
  let first = 0
  starts.forEach((s, i) => {
    if (matches.some((m) => m.start === s && m.status !== 'scheduled')) first = i + 1
  })
  if (first >= starts.length) return matches
  const moved = new Map<string, string>()
  let time = starts[first]
  moved.set(time, time)
  for (let i = first + 1; i < starts.length; i++) {
    // Past a break and past the day's end (next morning).
    const next = nextSlot(time, opts)
    moved.set(starts[i], next)
    time = next
  }
  return matches.map((m) => (moved.has(m.start) && moved.get(m.start) !== m.start ? { ...m, start: moved.get(m.start)! } : m))
}

/**
 * Every group on its own court (`courts[i]` for `groups[i]`): the group's round robin is
 * played one match after another on that court, all courts starting together, moving
 * to the next morning after `dayEnd`.
 */
export function buildGroupsOnOwnCourts(groups: Group[], courts: number[], opts: ScheduleOptions): Match[] {
  const startTime = opts.dayStart ?? opts.start.slice(11)
  const times: string[] = []
  const timeAt = (i: number) => {
    while (times.length <= i) {
      if (!times.length) { times.push(opts.start); continue }
      times.push(nextSlot(times[times.length - 1], { slotMinutes: opts.slotMinutes, dayEnd: opts.dayEnd, dayStart: startTime, breaks: opts.breaks }))
    }
    return times[i]
  }
  const placed = groups.flatMap((g, gi) =>
    roundRobin(g.teamIds).flat().map(([a, b], i) => ({
      categoryId: g.categoryId, groupId: g.id, teamA: a, teamB: b,
      court: courts[gi], start: timeAt(i), sets: [], status: 'scheduled' as const, updatedAt: 0,
    })))
  placed.sort((x, y) => x.start.localeCompare(y.start) || x.court - y.court)
  return placed.map((m, i) => ({ id: `m${i + 1}`, ...m }))
}

/** Minutes between the end of a match and the start of the next one on the same court. */
export const NEXT_MATCH_GAP_MINUTES = 2

/**
 * When a match on a court ends (its result is entered), the court's next match starts
 * 2 minutes later: it gets that time of day, and the court's later matches that day move
 * by the same amount. Only when every earlier match on the court is over, and never
 * across days (the next morning keeps its times). Results typed in on another day (tests
 * before the tournament) set the same time of day on the match's own day; "Wyzeruj
 * wszystkie wyniki" restores the timetable. Returns the matches that moved.
 */
export function followOnCourt(matches: Match[], finished: Match, now: number): Match[] {
  const onCourt = matches
    .filter((m) => m.court === finished.court && m.start && !m.skipped)
    .sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id))
  const at = onCourt.findIndex((m) => m.id === finished.id)
  if (at < 0 || onCourt.slice(0, at).some((m) => m.status !== 'finished')) return []
  const rest = onCourt.slice(at + 1)
  const next = rest[0]
  if (!next || next.status !== 'scheduled') return []
  const day = next.start.slice(0, 10)
  if (finished.start.slice(0, 10) !== day) return []
  const d = new Date(now)
  d.setSeconds(0, 0)
  const soon = addMinutes(toLocalIso(d), NEXT_MATCH_GAP_MINUTES)
  const start = `${day}T${soon.slice(11)}`
  const shift = new Date(start).getTime() - new Date(next.start).getTime()
  if (!shift) return []
  return rest
    .filter((m) => m.status === 'scheduled' && m.start.slice(0, 10) === day)
    .map((m) => ({ ...m, start: toLocalIso(new Date(new Date(m.start).getTime() + shift)), ...(m.id === next.id ? { calledAt: now } : {}) }))
}

/**
 * Manual time for a court's next match (HH:MM, same day): the next match still to be
 * played on the court gets it, and the court's later matches that day move by the same
 * amount. Returns the matches that moved.
 */
export function setNextOnCourt(matches: Match[], court: number, time: string, now = Date.now()): Match[] {
  const onCourt = matches
    .filter((m) => m.court === court && m.start && !m.skipped)
    .sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id))
  if (onCourt.some((m) => m.status === 'live')) return []
  const next = onCourt.find((m) => m.status === 'scheduled')
  if (!next || !/^\d{2}:\d{2}$/.test(time)) return []
  const day = next.start.slice(0, 10)
  const shift = new Date(`${day}T${time}`).getTime() - new Date(next.start).getTime()
  if (!shift) return []
  return onCourt
    .filter((m) => m.status === 'scheduled' && m.start.slice(0, 10) === day && m.start >= next.start)
    .map((m) => ({ ...m, start: toLocalIso(new Date(new Date(m.start).getTime() + shift)), ...(m.id === next.id ? { calledAt: now } : {}) }))
}
