import blossom from 'edmonds-blossom-fixed'
import { t } from '../i18n'
import type { Group, Match, State, Tiebreak } from '../types'
import { scheduleOf } from './newTournament'
import { criteriaToTiebreaks } from './profiles'
import { SPORTS } from './sports'
import { nextSlot } from './schedule'
import { standings } from './scoring'

/*
 * Swiss system (chess, darts, e-sport): everybody plays every round, never the same opponent
 * twice, against players with about the same score. Round 1 pairs the top half of the list
 * with the bottom half; each next round is paired when the previous one is over, by the
 * table so far (maximum weighted matching: similar scores first, no rematches). With an odd
 * number the lowest player who has not had one gets a free round, counted as a win.
 * The whole category is one "group" (its table is the Swiss table, Buchholz for ties).
 */

export function swissGroupId(categoryId: string): string {
  return `${categoryId}sw`
}

export function swissGroup(state: State, categoryId: string): Group | undefined {
  return state.groups.find((g) => g.id === swissGroupId(categoryId))
}

/** Usual number of rounds: enough to find a clear winner (log2 of the players + 1, at least 3). */
export function defaultSwissRounds(players: number): number {
  return Math.max(3, Math.ceil(Math.log2(Math.max(2, players))) + 1)
}

export function swissRounds(state: State, categoryId: string): number {
  const g = swissGroup(state, categoryId)
  return Math.min(state.tournament.swissRounds ?? defaultSwissRounds(g?.teamIds.length ?? 2), Math.max(1, (g?.teamIds.length ?? 2) - 1))
}

function roundMatches(state: State, categoryId: string, round: number): Match[] {
  const gid = swissGroupId(categoryId)
  return state.matches.filter((m) => m.groupId === gid && m.swissRound === round)
}

export function currentSwissRound(state: State, categoryId: string): number {
  const gid = swissGroupId(categoryId)
  return Math.max(0, ...state.matches.filter((m) => m.groupId === gid).map((m) => m.swissRound ?? 0))
}

/** Matches of the round still to be played. */
export function swissOpen(state: State, categoryId: string, round = currentSwissRound(state, categoryId)): Match[] {
  return roundMatches(state, categoryId, round).filter((m) => m.status !== 'finished' && !m.skipped)
}

/** Places round `round` on the boards (courts): best pairs first, more pairs than boards go on later. */
function place(state: State, categoryId: string, round: number, pairs: [string, string][], bye: string | null): Match[] {
  const sched = scheduleOf(state.tournament)
  const previous = state.matches.filter((m) => m.groupId === swissGroupId(categoryId) && m.start).map((m) => m.start).sort()
  let slot = previous.length ? nextSlot(previous[previous.length - 1], sched) : sched.start
  const out: Match[] = []
  let board = 1
  pairs.forEach(([a, b], i) => {
    if (board > state.tournament.courts) { board = 1; slot = nextSlot(slot, sched) }
    out.push({
      id: `${swissGroupId(categoryId)}r${round}m${i + 1}`, categoryId, groupId: swissGroupId(categoryId), swissRound: round,
      court: board++, start: slot, teamA: a, teamB: b, sets: [], status: 'scheduled', updatedAt: 0,
    })
  })
  if (bye) {
    out.push({
      id: `${swissGroupId(categoryId)}r${round}bye`, categoryId, groupId: swissGroupId(categoryId), swissRound: round, bye: true,
      court: 0, start: slot, teamA: bye, teamB: '', sets: [], status: 'finished', updatedAt: 0,
    })
  }
  return out
}

/** The discipline profile's Swiss criteria, or the usual chess ones. */
function swissTiebreaks(sport: string | undefined): Tiebreak[] {
  const profile = SPORTS.find((s) => s.label === sport)?.profile
  return profile?.swissCriteria ? criteriaToTiebreaks(profile.swissCriteria) : ['buchholz_cut1', 'buchholz', 'sonneborn_berger', 'wins', 'lots']
}

/** The tournament with the category played in the Swiss system: its table and round 1. */
export function startSwiss(state: State, categoryId: string, teamIds: string[]): State {
  const group: Group = { id: swissGroupId(categoryId), categoryId, name: t('Tabela'), teamIds }
  const base: State = {
    ...state,
    groups: [...state.groups.filter((g) => g.categoryId !== categoryId), group],
    matches: state.matches.filter((m) => m.categoryId !== categoryId),
    tournament: {
      ...state.tournament,
      // Buchholz first, as in chess, unless the organiser set their own order with it.
      rules: state.tournament.rules.tiebreak?.some((k) => k.startsWith('buchholz')) ? state.tournament.rules : { ...state.tournament.rules, tiebreak: swissTiebreaks(state.tournament.rules.sport) },
    },
  }
  // Round 1: top half against bottom half (1–5, 2–6, 3–7, 4–8 for 8 players); the last one rests when odd.
  const list = [...teamIds]
  const bye = list.length % 2 ? list.pop()! : null
  const half = list.length / 2
  const pairs: [string, string][] = list.slice(0, half).map((a, i) => (i % 2 ? [list[half + i], a] : [a, list[half + i]]))
  return { ...base, matches: [...base.matches, ...place(base, categoryId, 1, pairs, bye)] }
}

/**
 * The next round's pairs from the table so far: similar scores meet, nobody meets the same
 * opponent twice (unless there is no other way), the lowest player without a free round
 * gets one when the number is odd. The player who had the first move (side A) less often
 * gets it now.
 */
export function pairNextRound(state: State, categoryId: string): Match[] {
  const group = swissGroup(state, categoryId)
  if (!group) return []
  const round = currentSwissRound(state, categoryId) + 1
  const table = standings(state.tournament.rules, group, state.matches, state.teams)
  const score = new Map(table.map((r) => [r.teamId, r.tablePoints]))
  const rankOf = new Map(table.map((r, i) => [r.teamId, i]))
  const gid = swissGroupId(categoryId)
  const mine = state.matches.filter((m) => m.groupId === gid)
  const met = new Set(mine.filter((m) => !m.bye).map((m) => [m.teamA, m.teamB].sort().join('|')))
  const hadBye = new Set(mine.filter((m) => m.bye).map((m) => m.teamA))
  const sideA = new Map<string, number>()
  for (const m of mine) if (!m.bye) sideA.set(m.teamA, (sideA.get(m.teamA) ?? 0) + 1)

  let players = table.map((r) => r.teamId)
  let bye: string | null = null
  if (players.length % 2) {
    bye = [...players].reverse().find((id) => !hadBye.has(id)) ?? players[players.length - 1]
    players = players.filter((id) => id !== bye)
  }
  const edges: [number, number, number][] = []
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i]
      const b = players[j]
      const diff = Math.abs((score.get(a) ?? 0) - (score.get(b) ?? 0))
      const rematch = met.has([a, b].sort().join('|'))
      // Higher is better: close scores, close places, a rematch only as the last resort.
      const w = 1_000_000 - diff * diff * 1000 - Math.abs(rankOf.get(a)! - rankOf.get(b)!) - (rematch ? 500_000 : 0)
      edges.push([i, j, w])
    }
  }
  const mate = blossom(edges, true)
  const pairs: [string, string][] = []
  const used = new Set<number>()
  players.forEach((_, i) => {
    const j = mate[i]
    if (j === undefined || j < 0 || used.has(i) || used.has(j)) return
    used.add(i); used.add(j)
    const [x, y] = [players[i], players[j]]
    // Side A to the one who had it less often.
    pairs.push((sideA.get(x) ?? 0) <= (sideA.get(y) ?? 0) ? [x, y] : [y, x])
  })
  // Best pairs on the first boards.
  pairs.sort((p, q) => Math.max(score.get(q[0])!, score.get(q[1])!) - Math.max(score.get(p[0])!, score.get(p[1])!))
  return place(state, categoryId, round, pairs, bye)
}

export function hasSwiss(state: State, categoryId: string): boolean {
  return !!swissGroup(state, categoryId)
}
