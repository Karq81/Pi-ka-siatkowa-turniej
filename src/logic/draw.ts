import type { Group, State, Team } from '../types'
import { buildGroupSchedule, type ScheduleOptions } from './schedule'

/** Deterministic random numbers for tests; the app uses Math.random. */
export function rng(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Club of a team: its `club`, or the name without a trailing team number ("UKS Opty Mielno 2"). */
export function clubOf(team: Team): string {
  return team.club ?? team.name.replace(/\s+\d+$/, '')
}

export const GROUP_LETTERS = 'ABCDEFGHIJKL'

/**
 * Random draw of one category into `count` groups of (nearly) equal size.
 * Rule: two teams of the same club never land in the same group (as long as the
 * club has no more teams than there are groups).
 */
export function drawGroups(teams: Team[], categoryId: string, count: number, rand: () => number = Math.random): Group[] {
  const groups: Group[] = Array.from({ length: count }, (_, i) => ({
    id: `${categoryId}g${i + 1}`, categoryId, name: `Grupa ${GROUP_LETTERS[i]}`, teamIds: [],
  }))
  const clubs = new Map<string, Team[]>()
  for (const t of shuffle(teams.filter((x) => x.categoryId === categoryId), rand)) {
    const c = clubOf(t)
    clubs.set(c, [...(clubs.get(c) ?? []), t])
  }
  // Place clubs with more teams first, while every group still has room for them.
  const order = shuffle([...clubs.values()], rand).sort((a, b) => b.length - a.length)
  const clubsIn = groups.map(() => new Set<string>())
  for (const clubTeams of order) {
    for (const team of clubTeams) {
      const c = clubOf(team)
      const free = groups.map((_, i) => i).filter((i) => !clubsIn[i].has(c))
      const pool = free.length ? free : groups.map((_, i) => i)
      const min = Math.min(...pool.map((i) => groups[i].teamIds.length))
      const smallest = pool.filter((i) => groups[i].teamIds.length === min)
      const pick = smallest[Math.floor(rand() * smallest.length)]
      groups[pick].teamIds.push(team.id)
      clubsIn[pick].add(c)
    }
  }
  return groups
}

export interface DrawOptions {
  /** Number of groups for each category id. */
  groups: Record<string, number>
  schedule: ScheduleOptions
}

/**
 * New draw for the whole tournament: groups, a fresh schedule, no results and no
 * bracket. Teams, categories and settings stay.
 */
export function drawTournament(state: State, opts: DrawOptions, rand: () => number = Math.random): State {
  const groups = state.categories.flatMap((c) => drawGroups(state.teams, c.id, opts.groups[c.id] ?? 4, rand))
  return { ...state, groups, matches: buildGroupSchedule(groups, opts.schedule) }
}

/** Clears every result (group and bracket), keeping groups and schedule. */
export function resetResults(state: State): State {
  return {
    ...state,
    matches: state.matches.map((m) => ({
      ...m, sets: [], status: 'scheduled' as const, updatedAt: 0,
      ...(m.ko ? { teamA: '', teamB: '' } : {}),
    })),
  }
}

/**
 * Draws one category into `count` groups and rebuilds the schedule for all groups.
 * Groups of other categories stay as they are. Clears results and the bracket,
 * so it is meant for before the tournament.
 */
export function drawCategory(
  state: State, categoryId: string, count: number, schedule: ScheduleOptions, rand: () => number = Math.random,
): State {
  const drawn = drawGroups(state.teams, categoryId, count, rand)
  // Keep categories in their usual order.
  const groups = state.categories.flatMap((c) =>
    c.id === categoryId ? drawn : state.groups.filter((g) => g.categoryId === c.id))
  return { ...state, groups, matches: buildGroupSchedule(groups, schedule) }
}

/** Whether a category has been drawn into groups yet. */
export function isDrawn(state: State, categoryId: string): boolean {
  return state.groups.some((g) => g.categoryId === categoryId && g.teamIds.length > 0)
}
