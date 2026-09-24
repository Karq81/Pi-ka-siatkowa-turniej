import type { Group, KoInfo, KoRound, KoSource, Match, State } from '../types'
import { toLocalIso } from './schedule'
import { isMatchDecided, standings, tally } from './scoring'

export const ROUND_NAMES: Record<KoRound, string> = {
  QF: 'Ćwierćfinały',
  SF: 'Półfinały',
  F: 'Finał',
  '3P': 'Mecz o 3. miejsce',
}

interface PlanItem {
  key: string
  info: KoInfo
}

const g = (group: Group, pos: number): KoSource => ({ kind: 'group', groupId: group.id, pos })
const w = (matchId: string, label: string): KoSource => ({ kind: 'match', matchId, take: 'winner', label })
const l = (matchId: string, label: string): KoSource => ({ kind: 'match', matchId, take: 'loser', label })

export function koId(categoryId: string, key: string) {
  return `ko-${categoryId}-${key}`
}

/**
 * Bracket shape for one category, depending on the number of groups.
 * Group winners from the same half (A/B) can only meet again in the final.
 * Returns null when the group count has no standard bracket yet.
 */
export function bracketPlan(categoryId: string, groups: Group[]): PlanItem[] | null {
  const id = (key: string) => koId(categoryId, key)
  const item = (key: string, round: KoRound, label: string, srcA: KoSource, srcB: KoSource): PlanItem =>
    ({ key, info: { round, label, srcA, srcB } })
  const finals = [
    item('F', 'F', 'Finał', w(id('SF1'), 'Półfinał 1'), w(id('SF2'), 'Półfinał 2')),
    item('3P', '3P', 'Mecz o 3. miejsce', l(id('SF1'), 'Półfinał 1'), l(id('SF2'), 'Półfinał 2')),
  ]
  if (groups.length === 4) {
    const [A, B, C, D] = groups
    return [
      item('QF1', 'QF', 'Ćwierćfinał 1', g(A, 1), g(B, 2)),
      item('QF2', 'QF', 'Ćwierćfinał 2', g(C, 1), g(D, 2)),
      item('QF3', 'QF', 'Ćwierćfinał 3', g(B, 1), g(A, 2)),
      item('QF4', 'QF', 'Ćwierćfinał 4', g(D, 1), g(C, 2)),
      item('SF1', 'SF', 'Półfinał 1', w(id('QF1'), 'Ćwierćfinał 1'), w(id('QF2'), 'Ćwierćfinał 2')),
      item('SF2', 'SF', 'Półfinał 2', w(id('QF3'), 'Ćwierćfinał 3'), w(id('QF4'), 'Ćwierćfinał 4')),
      ...finals,
    ]
  }
  if (groups.length === 2) {
    const [A, B] = groups
    return [
      item('SF1', 'SF', 'Półfinał 1', g(A, 1), g(B, 2)),
      item('SF2', 'SF', 'Półfinał 2', g(B, 1), g(A, 2)),
      ...finals,
    ]
  }
  if (groups.length === 1) {
    const [A] = groups
    return [
      item('SF1', 'SF', 'Półfinał 1', g(A, 1), g(A, 4)),
      item('SF2', 'SF', 'Półfinał 2', g(A, 2), g(A, 3)),
      ...finals,
    ]
  }
  return null
}

/** Winner/loser of a finished, decided match, or '' if not known yet. */
function outcome(state: State, matchId: string, take: 'winner' | 'loser'): string {
  const m = state.matches.find((x) => x.id === matchId)
  if (!m || m.status !== 'finished' || !m.teamA || !m.teamB) return ''
  const rules = state.tournament.rules
  if (!isMatchDecided(rules, m.sets)) return ''
  const t = tally(rules, m.sets)
  if (t.setsA === t.setsB) return ''
  const aWon = t.setsA > t.setsB
  return (take === 'winner') === aWon ? m.teamA : m.teamB
}

/** Team currently in a group place (from the live table). */
function groupPlace(state: State, groupId: string, pos: number): string {
  const group = state.groups.find((x) => x.id === groupId)
  if (!group) return ''
  return standings(state.tournament.rules, group, state.matches, state.teams)[pos - 1]?.teamId ?? ''
}

export function resolveSource(state: State, src: KoSource): string {
  return src.kind === 'group' ? groupPlace(state, src.groupId, src.pos) : outcome(state, src.matchId, src.take)
}

/** Short description of a source, shown while the team is unknown. */
export function sourceLabel(state: State, src: KoSource): string {
  if (src.kind === 'group') {
    const name = state.groups.find((x) => x.id === src.groupId)?.name ?? ''
    return `${src.pos}. miejsce, ${name}`
  }
  return `${src.take === 'winner' ? 'Zwycięzca' : 'Przegrany'}: ${src.label}`
}

function groupsOf(state: State, categoryId: string) {
  return state.groups.filter((x) => x.categoryId === categoryId)
}

export function hasKnockout(state: State, categoryId: string) {
  return state.matches.some((m) => m.ko && m.categoryId === categoryId)
}

/** Group matches of a category that are not finished yet. */
export function openGroupMatches(state: State, categoryId: string) {
  return state.matches.filter((m) => !m.ko && m.categoryId === categoryId && m.status !== 'finished').length
}

export interface KnockoutOptions {
  start: string
  slotMinutes: number
  /** Courts to use, e.g. [1, 2, 3, 4]. */
  courts: number[]
}

/**
 * Creates the bracket matches for a category. Teams from group places are taken
 * from the current tables; later rounds fill in as results come in (see `propagate`).
 */
export function createKnockout(state: State, categoryId: string, opts: KnockoutOptions): Match[] {
  const plan = bracketPlan(categoryId, groupsOf(state, categoryId))
  if (!plan) return []
  const rounds: KoRound[][] = [['QF'], ['SF'], ['F', '3P']]
  const result: Match[] = []
  let slot = new Date(opts.start)
  for (const roundSet of rounds) {
    const items = plan.filter((p) => roundSet.includes(p.info.round))
    if (!items.length) continue
    let court = 0
    for (const p of items) {
      if (court === opts.courts.length) {
        court = 0
        slot = new Date(slot.getTime() + opts.slotMinutes * 60000)
      }
      const draft: Match = {
        id: koId(categoryId, p.key), categoryId, groupId: '', ko: p.info,
        court: opts.courts[court++], start: toLocalIso(slot),
        teamA: '', teamB: '', sets: [], status: 'scheduled', updatedAt: 0,
      }
      result.push(draft)
    }
    slot = new Date(slot.getTime() + opts.slotMinutes * 60000)
  }
  const withNew: State = { ...state, matches: [...state.matches.filter((m) => !m.ko || m.categoryId !== categoryId), ...result] }
  const filled = propagate(withNew)
  return result.map((m) => filled.find((f) => f.id === m.id) ?? m)
}

/**
 * Knockout matches whose teams changed: group places follow the live tables and later
 * rounds fill in from finished matches. Only matches that have not started are changed.
 */
export function propagate(state: State): Match[] {
  const changed: Match[] = []
  let current = state
  // Repeat so a correction can flow through several rounds.
  for (let pass = 0; pass < 3; pass++) {
    let any = false
    for (const m of current.matches) {
      if (!m.ko || m.status !== 'scheduled') continue
      const a = resolveSource(current, m.ko.srcA)
      const b = resolveSource(current, m.ko.srcB)
      if (a !== m.teamA || b !== m.teamB) {
        const next = { ...m, teamA: a, teamB: b }
        current = { ...current, matches: current.matches.map((x) => (x.id === m.id ? next : x)) }
        const i = changed.findIndex((x) => x.id === m.id)
        if (i >= 0) changed[i] = next
        else changed.push(next)
        any = true
      }
    }
    if (!any) break
  }
  return changed
}

export interface BracketSlot {
  match: Match
  /** True when shown from current tables because the bracket was not created yet. */
  projected: boolean
}

/** The bracket to display: real knockout matches, or a projection from the current tables. */
export function bracketView(state: State, categoryId: string): BracketSlot[] | null {
  const real = state.matches.filter((m) => m.ko && m.categoryId === categoryId)
  if (real.length) return real.map((match) => ({ match, projected: false }))
  const plan = bracketPlan(categoryId, groupsOf(state, categoryId))
  if (!plan) return null
  return plan.map((p) => ({
    projected: true,
    match: {
      id: koId(categoryId, p.key), categoryId, groupId: '', ko: p.info, court: 0, start: '',
      teamA: resolveSource(state, p.info.srcA),
      teamB: resolveSource(state, p.info.srcB),
      sets: [], status: 'scheduled', updatedAt: 0,
    },
  }))
}

/**
 * Applies a change to one match and fills in any knockout teams that follow from it.
 * Returns every match that changed.
 */
export function applyMatchUpdate(state: State, id: string, update: (m: Match) => Match): Match[] {
  const target = state.matches.find((m) => m.id === id)
  if (!target) return []
  const next = { ...update(target), updatedAt: Date.now() }
  const after: State = { ...state, matches: state.matches.map((m) => (m.id === id ? next : m)) }
  return [next, ...propagate(after).filter((m) => m.id !== id)]
}
