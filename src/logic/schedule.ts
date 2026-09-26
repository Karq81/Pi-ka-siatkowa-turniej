import type { Group, Match } from '../types'

/** Round-robin pairings (circle method). Returns rounds of [teamA, teamB]. */
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
      if (a && b) round.push(r % 2 === 0 ? [a, b] : [b, a])
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
  const perGroup = groups.map((g) => ({ g, rounds: roundRobin(g.teamIds) }))
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
  let slot = opts.start
  while (queue.length) {
    const busy = new Set<string>()
    let court = 1
    for (let i = 0; i < queue.length && court <= opts.courts; ) {
      const m = queue[i]
      if (busy.has(m.teamA) || busy.has(m.teamB)) { i++; continue }
      busy.add(m.teamA); busy.add(m.teamB)
      result.push({ ...m, court: court++, start: slot })
      queue.splice(i, 1)
    }
    let next = addMinutes(slot, opts.slotMinutes)
    if (next.slice(11) > opts.dayEnd) {
      next = addMinutes(`${slot.slice(0, 10)}T${startTime}`, 24 * 60)
    }
    slot = next
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
  matches: Match[], opts: { slotMinutes: number; dayEnd: string; dayStart: string },
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
    let next = addMinutes(time, opts.slotMinutes)
    // Past the day's end: next morning.
    if (next.slice(11) > opts.dayEnd) {
      next = `${addMinutes(`${time.slice(0, 10)}T00:00`, 24 * 60).slice(0, 10)}T${opts.dayStart}`
    }
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
      const prev = times[times.length - 1]
      let next = addMinutes(prev, opts.slotMinutes)
      if (next.slice(11) > opts.dayEnd) next = addMinutes(`${prev.slice(0, 10)}T${startTime}`, 24 * 60)
      times.push(next)
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
