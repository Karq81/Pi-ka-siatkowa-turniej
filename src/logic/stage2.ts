import { STAGE2 } from '../content/stage2'
import type { Group, Match, State } from '../types'
import { standings, type StandingRow } from './scoring'
import { buildGroupsOnOwnCourts, toLocalIso } from './schedule'
import { DEFAULT_SCHEDULE } from './demo'

/*
 * Albatros CUP, second stage: after the group phase every team gets a rank – first by its
 * place in the group, then, among teams with the same place, by table points, set ratio
 * and small-points ratio – and the ranked list is cut into the new groups (Dwójki 5–8,
 * Trójki 6–10), each playing for its places, each with each, on the courts of the category.
 */

const STAGE2_TAG = 's2'

/** Groups of the second stage (their ids end the category id with "s2g…"). */
export function isStage2Group(g: Group): boolean {
  return g.id.startsWith(`${g.categoryId}${STAGE2_TAG}g`)
}

export function stage2Groups(state: State, categoryId: string): Group[] {
  return state.groups.filter((g) => g.categoryId === categoryId && isStage2Group(g))
}

function firstStage(state: State, categoryId: string): Group[] {
  return state.groups.filter((g) => g.categoryId === categoryId && !isStage2Group(g))
}

/** Group matches of the first stage still to be played. */
export function openFirstStage(state: State, categoryId: string): number {
  return openFirstStageMatches(state, categoryId).length
}

export function openFirstStageMatches(state: State, categoryId: string): Match[] {
  const ids = new Set(firstStage(state, categoryId).map((g) => g.id))
  return state.matches.filter((m) => ids.has(m.groupId) && m.status !== 'finished' && !m.skipped)
    .sort((a, b) => a.start.localeCompare(b.start) || a.court - b.court)
}

const ratio = (won: number, lost: number) => (lost === 0 ? (won === 0 ? 0 : Number.POSITIVE_INFINITY) : won / lost)
const desc = (x: number, y: number) => (x === y ? 0 : y > x ? 1 : -1)

/** Every team of the category in second-stage order (best first). */
export function stage2Ranking(state: State, categoryId: string): string[] {
  const rows: { row: StandingRow; pos: number }[] = []
  for (const g of firstStage(state, categoryId)) {
    standings(state.tournament.rules, g, state.matches, state.teams).forEach((row, i) => rows.push({ row, pos: i + 1 }))
  }
  rows.sort((a, b) =>
    a.pos - b.pos
    || b.row.tablePoints - a.row.tablePoints
    || desc(ratio(a.row.setsWon, a.row.setsLost), ratio(b.row.setsWon, b.row.setsLost))
    || desc(ratio(a.row.pointsWon, a.row.pointsLost), ratio(b.row.pointsWon, b.row.pointsLost))
    || (b.row.pointsWon - b.row.pointsLost) - (a.row.pointsWon - a.row.pointsLost))
  return rows.map((r) => r.row.teamId)
}

/** Size of each new group, from its places ("1–7" → 7). */
function sizes(categoryId: string): number[] {
  return (STAGE2[categoryId]?.groups ?? []).map((g) => {
    const [from, to] = g.places.split(/[–-]/).map(Number)
    return to - from + 1
  })
}

/** First place a second-stage group plays for (Grupa 6 → 8). */
export function stage2FirstPlace(categoryId: string, index: number): number {
  return Number(STAGE2[categoryId]?.groups[index]?.places.split(/[–-]/)[0] ?? 1)
}

/**
 * The tournament with the category's second stage: new groups from the ranking, their
 * matches on the category's courts, starting after its last group match. A second stage
 * made before (without results) is replaced.
 */
export function buildStage2(state: State, categoryId: string): State {
  const plan = STAGE2[categoryId]
  if (!plan) return state
  const ranking = stage2Ranking(state, categoryId)
  const groups: Group[] = []
  let at = 0
  sizes(categoryId).forEach((n, i) => {
    groups.push({ id: `${categoryId}${STAGE2_TAG}g${i + 1}`, categoryId, name: plan.groups[i].name, teamIds: ranking.slice(at, at + n) })
    at += n
  })
  const oldIds = new Set(stage2Groups(state, categoryId).map((g) => g.id))
  const first = firstStage(state, categoryId)
  const firstIds = new Set(first.map((g) => g.id))
  // The category's courts, in order, and the next slot after its group phase.
  const own = state.matches.filter((m) => firstIds.has(m.groupId))
  const courts = [...new Set(own.map((m) => m.court))].sort((a, b) => a - b)
  const slot = state.tournament.slotMinutes ?? DEFAULT_SCHEDULE.slotMinutes
  const dayEnd = state.tournament.dayEnd ?? DEFAULT_SCHEDULE.dayEnd
  const dayStart = state.tournament.dayStart ?? DEFAULT_SCHEDULE.dayStart
  const last = own.map((m) => m.start).sort().at(-1) ?? DEFAULT_SCHEDULE.start
  const next = new Date(last)
  next.setMinutes(next.getMinutes() + slot)
  let start = toLocalIso(next)
  if (start.slice(11) > dayEnd) {
    const day = new Date(`${last.slice(0, 10)}T12:00`)
    day.setDate(day.getDate() + 1)
    start = `${toLocalIso(day).slice(0, 10)}T${dayStart}`
  }
  // Each new group on its own court (more groups than courts: the extra ones share from the first).
  const usable = groups.map((_, i) => courts[i % Math.max(1, courts.length)] ?? i + 1)
  const made: Match[] = buildGroupsOnOwnCourts(groups, usable, { courts: courts.length, start, slotMinutes: slot, dayEnd, dayStart, breaks: state.tournament.breaks })
    .map((m, i) => ({ ...m, id: `${categoryId}${STAGE2_TAG}m${i + 1}` }))
  return {
    ...state,
    groups: [...state.groups.filter((g) => !oldIds.has(g.id)), ...groups],
    matches: [...state.matches.filter((m) => !oldIds.has(m.groupId)), ...made],
  }
}

/** Removes the category's second stage (its groups and matches). */
export function removeStage2(state: State, categoryId: string): State {
  const oldIds = new Set(stage2Groups(state, categoryId).map((g) => g.id))
  return { ...state, groups: state.groups.filter((g) => !oldIds.has(g.id)), matches: state.matches.filter((m) => !oldIds.has(m.groupId)) }
}

/** Whether any second-stage match already has a result. */
export function stage2Played(state: State, categoryId: string): boolean {
  const ids = new Set(stage2Groups(state, categoryId).map((g) => g.id))
  return state.matches.some((m) => ids.has(m.groupId) && m.status !== 'scheduled')
}


/** Second-stage matches still to be played. */
export function openStage2Matches(state: State, categoryId: string): Match[] {
  const ids = new Set(stage2Groups(state, categoryId).map((g) => g.id))
  return state.matches.filter((m) => ids.has(m.groupId) && m.status !== 'finished' && !m.skipped)
}

function setPhase(state: State, categoryId: string, patch: { groupsEnded?: boolean; stage2Ended?: boolean }): State {
  const phases = { ...(state.tournament.phases ?? {}) }
  phases[categoryId] = { ...(phases[categoryId] ?? {}), ...patch }
  return { ...state, tournament: { ...state.tournament, phases } }
}

/** Matches of these groups not played yet are set aside (or brought back). */
function skipOpen(state: State, groupIds: Set<string>, skip: boolean): State {
  return {
    ...state,
    matches: state.matches.map((m) => (groupIds.has(m.groupId) && m.status !== 'finished' && !!m.skipped !== skip
      ? (skip ? { ...m, skipped: true, status: 'scheduled' as const, sets: [] } : { ...m, skipped: false })
      : m)),
  }
}

export function groupsEnded(state: State, categoryId: string): boolean {
  return !!state.tournament.phases?.[categoryId]?.groupsEnded
}

export function stage2Ended(state: State, categoryId: string): boolean {
  return !!state.tournament.phases?.[categoryId]?.stage2Ended
}

/** Ends the group phase: matches not played are set aside and the second stage is made from the tables. */
export function endGroupPhase(state: State, categoryId: string): State {
  const ids = new Set(firstStage(state, categoryId).map((g) => g.id))
  return setPhase(buildStage2(skipOpen(state, ids, true), categoryId), categoryId, { groupsEnded: true, stage2Ended: false })
}

/** Takes back the end of the group phase: its matches are open again and the second stage is removed. */
export function reopenGroupPhase(state: State, categoryId: string): State {
  const ids = new Set(firstStage(state, categoryId).map((g) => g.id))
  return setPhase(removeStage2(skipOpen(state, ids, false), categoryId), categoryId, { groupsEnded: false, stage2Ended: false })
}

export function endStage2(state: State, categoryId: string): State {
  const ids = new Set(stage2Groups(state, categoryId).map((g) => g.id))
  return setPhase(skipOpen(state, ids, true), categoryId, { stage2Ended: true })
}

export function reopenStage2(state: State, categoryId: string): State {
  const ids = new Set(stage2Groups(state, categoryId).map((g) => g.id))
  return setPhase(skipOpen(state, ids, false), categoryId, { stage2Ended: false })
}

/** Final places: each second-stage group decides its own places (Grupa 6: 8–14). */
export function finalRanking(state: State, categoryId: string): { place: number; teamId: string }[] {
  return stage2Groups(state, categoryId).flatMap((g, i) => {
    const from = stage2FirstPlace(categoryId, i)
    return standings(state.tournament.rules, g, state.matches, state.teams).map((r, k) => ({ place: from + k, teamId: r.teamId }))
  })
}
