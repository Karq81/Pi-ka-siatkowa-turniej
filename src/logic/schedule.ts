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
  /** Last slot of a day starts no later than this time (HH:MM); then move to next day's `start` time. */
  dayEnd: string
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
  const startTime = opts.start.slice(11)
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
