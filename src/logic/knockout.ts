import type { Group, KoInfo, KoRound, KoSource, Match, State } from '../types'
import { toLocalIso } from './schedule'
import { isMatchDecided, standings, tally } from './scoring'

export const ROUND_NAMES: Record<KoRound, string> = {
  QF: 'Ćwierćfinały',
  SF: 'Półfinały',
  P: 'Mecze o miejsca',
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

export function placeLabel(place: number): string {
  return place === 1 ? 'Finał' : `O ${place}. miejsce`
}

type Pair = [KoSource, KoSource]

/**
 * One part of the classification: 8, 4 or 2 teams playing for places from..from+n-1.
 * 8 teams: quarter-finals, then winners and losers play on, every team gets a place.
 */
function tierPlan(categoryId: string, from: number, pairs: Pair[]): PlanItem[] {
  const id = (key: string) => koId(categoryId, key)
  const k = (x: string) => `T${from}-${x}`
  const to = from + pairs.length * 2 - 1
  const top = from === 1
  const item = (key: string, round: KoRound, label: string, [srcA, srcB]: Pair, place?: number): PlanItem =>
    ({ key: k(key), info: { round, tierFrom: from, tierTo: to, ...(place ? { place } : {}), label, srcA, srcB } })
  const final = (place: number, a: KoSource, b: KoSource) => item(`P${place}`, 'P', placeLabel(place), [a, b], place)

  if (pairs.length === 1) return [final(from, ...pairs[0])]

  if (pairs.length === 2) {
    const s1 = top ? 'Półfinał 1' : `Miejsca ${from}–${to}, mecz 1`
    const s2 = top ? 'Półfinał 2' : `Miejsca ${from}–${to}, mecz 2`
    return [
      item('S1', 'SF', s1, pairs[0]),
      item('S2', 'SF', s2, pairs[1]),
      final(from, w(id(k('S1')), s1), w(id(k('S2')), s2)),
      final(from + 2, l(id(k('S1')), s1), l(id(k('S2')), s2)),
    ]
  }

  // 8 teams
  const q = (n: number) => (top ? `Ćwierćfinał ${n}` : `Miejsca ${from}–${to}, mecz ${n}`)
  const sw = (n: number) => (top ? `Półfinał ${n}` : `Miejsca ${from}–${from + 3}, półfinał ${n}`)
  const sl = (n: number) => `Miejsca ${from + 4}–${to}, półfinał ${n}`
  return [
    ...pairs.map((p, i) => item(`Q${i + 1}`, 'QF', q(i + 1), p)),
    item('W1', 'SF', sw(1), [w(id(k('Q1')), q(1)), w(id(k('Q2')), q(2))]),
    item('W2', 'SF', sw(2), [w(id(k('Q3')), q(3)), w(id(k('Q4')), q(4))]),
    item('L1', 'SF', sl(1), [l(id(k('Q1')), q(1)), l(id(k('Q2')), q(2))]),
    item('L2', 'SF', sl(2), [l(id(k('Q3')), q(3)), l(id(k('Q4')), q(4))]),
    final(from, w(id(k('W1')), sw(1)), w(id(k('W2')), sw(2))),
    final(from + 2, l(id(k('W1')), sw(1)), l(id(k('W2')), sw(2))),
    final(from + 4, w(id(k('L1')), sl(1)), w(id(k('L2')), sl(2))),
    final(from + 6, l(id(k('L1')), sl(1)), l(id(k('L2')), sl(2))),
  ]
}

/**
 * Full classification for one category, like the PZPS youth tournaments: every team
 * plays on for a final place. With 4 groups, places 1–2 of each group play for 1–8
 * (1A–2B, 1C–2D, 1B–2A, 1D–2C), places 3–4 for 9–16, 5–6 for 17–24, and a lone 7th
 * place for 25–28. Teams from the same group can meet again only in the later rounds.
 * Supports 1, 2 or 4 groups; returns null otherwise.
 */
export function bracketPlan(categoryId: string, groups: Group[]): PlanItem[] | null {
  const n = groups.length
  if (n === 0 || ![1, 2, 4].includes(n)) return null
  // Positions every group has, so each tier is complete.
  const depth = Math.min(...groups.map((x) => x.teamIds.length))
  const plan: PlanItem[] = []
  if (n === 1) {
    const [A] = groups
    if (depth >= 4) plan.push(...tierPlan(categoryId, 1, [[g(A, 1), g(A, 4)], [g(A, 2), g(A, 3)]]))
    else if (depth >= 2) plan.push(...tierPlan(categoryId, 1, [[g(A, 1), g(A, 2)]]))
    return plan.length ? plan : null
  }
  for (let p = 1; p <= depth; p += 2) {
    const from = n * (p - 1) + 1
    if (n === 4) {
      const [A, B, C, D] = groups
      if (p + 1 <= depth) {
        plan.push(...tierPlan(categoryId, from, [
          [g(A, p), g(B, p + 1)], [g(C, p), g(D, p + 1)], [g(B, p), g(A, p + 1)], [g(D, p), g(C, p + 1)],
        ]))
      } else {
        plan.push(...tierPlan(categoryId, from, [[g(A, p), g(D, p)], [g(B, p), g(C, p)]]))
      }
    } else {
      const [A, B] = groups
      if (p + 1 <= depth) plan.push(...tierPlan(categoryId, from, [[g(A, p), g(B, p + 1)], [g(B, p), g(A, p + 1)]]))
      else plan.push(...tierPlan(categoryId, from, [[g(A, p), g(B, p)]]))
    }
  }
  return plan.length ? plan : null
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

/** Whether every match of a group has been played. */
export function groupFinished(state: State, groupId: string): boolean {
  const ms = state.matches.filter((m) => m.groupId === groupId)
  return ms.length > 0 && ms.every((m) => m.status === 'finished')
}

/**
 * Team in a group place, only once the group has finished: until then the bracket
 * shows the place ("1. miejsce · Grupa A"), not whoever leads the table right now.
 */
function groupPlace(state: State, groupId: string, pos: number): string {
  const group = state.groups.find((x) => x.id === groupId)
  if (!group || !groupFinished(state, groupId)) return ''
  return standings(state.tournament.rules, group, state.matches, state.teams)[pos - 1]?.teamId ?? ''
}

/** Places a group position plays for in the knockout phase, e.g. 2nd in a group → [1, 8]. */
export function tierForGroupPlace(state: State, groupId: string, pos: number): [number, number] | null {
  const group = state.groups.find((x) => x.id === groupId)
  if (!group) return null
  const plan = bracketPlan(group.categoryId, groupsOf(state, group.categoryId))
  const item = plan?.find((p) => [p.info.srcA, p.info.srcB].some((s) => s.kind === 'group' && s.groupId === groupId && s.pos === pos))
  return item ? [item.info.tierFrom, item.info.tierTo] : null
}

export function resolveSource(state: State, src: KoSource): string {
  return src.kind === 'group' ? groupPlace(state, src.groupId, src.pos) : outcome(state, src.matchId, src.take)
}

/** Short description of a source, shown while the team is unknown. */
export function sourceLabel(state: State, src: KoSource): string {
  if (src.kind === 'group') {
    const name = state.groups.find((x) => x.id === src.groupId)?.name ?? ''
    return `${src.pos}. miejsce · ${name}`
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
  // Round by round across all tiers; placement matches last, the final at the very end.
  const rounds: PlanItem[][] = [
    plan.filter((p) => p.info.round === 'QF'),
    plan.filter((p) => p.info.round === 'SF'),
    plan.filter((p) => p.info.round === 'P').sort((x, y) => (y.info.place ?? 0) - (x.info.place ?? 0)),
  ]
  const result: Match[] = []
  let slot = new Date(opts.start)
  for (const items of rounds) {
    if (!items.length) continue
    let court = 0
    for (const p of items) {
      if (court === opts.courts.length) {
        court = 0
        slot = new Date(slot.getTime() + opts.slotMinutes * 60000)
      }
      result.push({
        id: koId(categoryId, p.key), categoryId, groupId: '', ko: p.info,
        court: opts.courts[court++], start: toLocalIso(slot),
        teamA: '', teamB: '', sets: [], status: 'scheduled', updatedAt: 0,
      })
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
  for (let pass = 0; pass < 5; pass++) {
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
