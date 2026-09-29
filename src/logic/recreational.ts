import { t } from '../i18n'
import type { Group, Match, State, Team, Tournament } from '../types'
import { rng, shuffle } from './draw'
import { singleWinner } from './legs'
import { scheduleOf } from './newTournament'
import { nextSlot } from './schedule'
import { tally } from './scoring'

/*
 * Recreational formats (docs/specyfikacja-turnieje.md 2.9):
 *   americano: players change partners every round; a match to a fixed number of points;
 *              each player collects the points their pair scored.
 *   mexicano:  the same, but from round 2 the pairs come from the table: in each four,
 *              1st + 4th against 2nd + 3rd.
 *   king:      king of the court – the winner stays on, the loser goes to the back of the queue.
 *   ladder:    a ranking list; a player challenges someone up to 3 places higher and takes
 *              their place by winning.
 * A pair playing together is written "id1+id2" in the match (both names shown).
 */

export type Recreational = 'americano' | 'mexicano' | 'king' | 'ladder'
export const LADDER_REACH = 3

export function recreationalOf(t: Pick<Tournament, 'system'>): Recreational | null {
  return t.system === 'americano' || t.system === 'mexicano' || t.system === 'king' || t.system === 'ladder' ? t.system : null
}

export function recGroupId(categoryId: string): string {
  return `${categoryId}rec`
}

export function recGroup(state: State, categoryId: string): Group | undefined {
  return state.groups.find((g) => g.id === recGroupId(categoryId))
}

export const pairId = (a: string, b: string) => [a, b].sort().join('+')
export const membersOf = (id: string) => (id ? id.split('+') : [])

/** A team's or a pair's name ("Ala / Bea"). */
export function sideName(teams: Team[], id: string): string {
  return membersOf(id).map((x) => teams.find((tm) => tm.id === x)?.name ?? '').join(' / ')
}

function recMatches(state: State, categoryId: string): Match[] {
  const gid = recGroupId(categoryId)
  return state.matches.filter((m) => m.groupId === gid).sort((a, b) => (a.swissRound ?? 0) - (b.swissRound ?? 0) || a.court - b.court)
}

export function currentRound(state: State, categoryId: string): number {
  return Math.max(0, ...recMatches(state, categoryId).map((m) => m.swissRound ?? 0))
}

export function openRec(state: State, categoryId: string): Match[] {
  return recMatches(state, categoryId).filter((m) => m.status !== 'finished' && !m.skipped)
}

/** The group of everybody and nothing else of the category (the draw). */
export function startRecreational(state: State, categoryId: string, teamIds: string[]): State {
  const group: Group = { id: recGroupId(categoryId), categoryId, name: t('Tabela'), teamIds }
  let next: State = {
    ...state,
    groups: [...state.groups.filter((g) => g.categoryId !== categoryId), group],
    matches: state.matches.filter((m) => m.categoryId !== categoryId),
  }
  const sys = recreationalOf(state.tournament)
  if (sys === 'americano' || sys === 'mexicano') next = { ...next, matches: [...next.matches, ...nextPadelRound(next, categoryId)] }
  if (sys === 'king') { const m = kingNext(next, categoryId); if (m) next = { ...next, matches: [...next.matches, m] } }
  return next
}

/** The slot after the category's last match (or the start). */
function nextStart(state: State, categoryId: string): string {
  const sched = scheduleOf(state.tournament)
  const last = recMatches(state, categoryId).map((m) => m.start).sort().at(-1)
  return last ? nextSlot(last, sched) : sched.start
}

export interface PlayerRow {
  teamId: string
  played: number
  won: number
  /** Americano / Mexicano: points scored by the player's pairs; king: wins; ladder: place. */
  points: number
  diff: number
  place: number
  /** King of the court: the longest run of wins; now on court as the king. */
  streak?: number
  king?: boolean
}

/** Americano / Mexicano table: points scored with every partner, then wins, then the difference. */
export function padelTable(state: State, categoryId: string): PlayerRow[] {
  const group = recGroup(state, categoryId)
  if (!group) return []
  const rules = state.tournament.rules
  const rows = new Map(group.teamIds.map((id) => [id, { teamId: id, played: 0, won: 0, points: 0, diff: 0, place: 0 }]))
  for (const m of recMatches(state, categoryId)) {
    if (m.status !== 'finished' || m.skipped) continue
    const tl = tally(rules, m.sets)
    for (const [side, mine, theirs, won] of [[m.teamA, tl.pointsA, tl.pointsB, tl.setsA > tl.setsB], [m.teamB, tl.pointsB, tl.pointsA, tl.setsB > tl.setsA]] as const) {
      for (const p of membersOf(side)) {
        const r = rows.get(p)
        if (!r) continue
        r.played++
        r.points += mine
        r.diff += mine - theirs
        if (won) r.won++
      }
    }
  }
  const name = (id: string) => state.teams.find((x) => x.id === id)?.name ?? id
  const list = [...rows.values()].sort((a, b) => b.points - a.points || b.won - a.won || b.diff - a.diff || name(a.teamId).localeCompare(name(b.teamId), 'pl'))
  list.forEach((r, i) => { r.place = i > 0 && list[i - 1].points === r.points && list[i - 1].won === r.won && list[i - 1].diff === r.diff ? list[i - 1].place : i + 1 })
  return list
}

/**
 * The next Americano or Mexicano round: as many fours as courts (and players) allow; those
 * who sat out least sit out now. Americano: partners never repeat while it can be avoided,
 * opponents vary. Mexicano: by the table, 1st + 4th against 2nd + 3rd in each four.
 */
export function nextPadelRound(state: State, categoryId: string): Match[] {
  const group = recGroup(state, categoryId)
  if (!group || group.teamIds.length < 4) return []
  const round = currentRound(state, categoryId) + 1
  const past = recMatches(state, categoryId)
  const players = group.teamIds
  const fours = Math.min(Math.floor(players.length / 4), Math.max(1, state.tournament.courts))
  const playing = fours * 4
  // Who sits out: those who sat out least so far (the lowest in the table first in Mexicano).
  const sat = new Map(players.map((p) => [p, 0]))
  for (let r = 1; r < round; r++) {
    const inRound = new Set(past.filter((m) => m.swissRound === r).flatMap((m) => [...membersOf(m.teamA), ...membersOf(m.teamB)]))
    for (const p of players) if (!inRound.has(p)) sat.set(p, (sat.get(p) ?? 0) + 1)
  }
  const table = padelTable(state, categoryId).map((r) => r.teamId)
  const mexicano = recreationalOf(state.tournament) === 'mexicano' && round > 1
  const rand = rng(round * 7919 + players.length)
  const order = mexicano ? table : shuffle(players, rand)
  const sitters = [...order].sort((a, b) => (sat.get(a)! - sat.get(b)!) || (mexicano ? table.indexOf(b) - table.indexOf(a) : 0)).slice(0, players.length - playing)
  const active = order.filter((p) => !sitters.includes(p))
  let quads: [string, string, string, string][] = []
  if (mexicano) {
    for (let i = 0; i < fours; i++) {
      const [a, b, c, d] = active.slice(i * 4, i * 4 + 4)
      quads.push([a, d, b, c])
    }
  } else {
    // Americano: the lowest cost of partners met again (heavy) and opponents met again (light).
    const partners = new Map<string, number>()
    const opponents = new Map<string, number>()
    const bump = (map: Map<string, number>, a: string, b: string) => map.set(pairId(a, b), (map.get(pairId(a, b)) ?? 0) + 1)
    for (const m of past) {
      const [a, b] = membersOf(m.teamA)
      const [c, d] = membersOf(m.teamB)
      if (!a || !b || !c || !d) continue
      bump(partners, a, b); bump(partners, c, d)
      for (const x of [a, b]) for (const y of [c, d]) bump(opponents, x, y)
    }
    const cost = (a: string, b: string, c: string, d: string) =>
      ((partners.get(pairId(a, b)) ?? 0) + (partners.get(pairId(c, d)) ?? 0)) * 100
      + [a, b].reduce((s, x) => s + (opponents.get(pairId(x, c)) ?? 0) + (opponents.get(pairId(x, d)) ?? 0), 0)
    let best = Infinity
    for (let attempt = 0; attempt < 300; attempt++) {
      const mix = shuffle(active, rand)
      let total = 0
      const q: [string, string, string, string][] = []
      for (let i = 0; i < fours; i++) {
        const [a, b, c, d] = mix.slice(i * 4, i * 4 + 4)
        const options: [string, string, string, string][] = [[a, b, c, d], [a, c, b, d], [a, d, b, c]]
        const pick = options.reduce((x, y) => (cost(...y) < cost(...x) ? y : x))
        total += cost(...pick)
        q.push(pick)
      }
      if (total < best) { best = total; quads = q }
      if (best === 0) break
    }
  }
  const start = nextStart(state, categoryId)
  return quads.map(([a, b, c, d], i) => ({
    id: `${recGroupId(categoryId)}r${round}m${i + 1}`, categoryId, groupId: recGroupId(categoryId), swissRound: round,
    court: i + 1, start, teamA: pairId(a, b), teamB: pairId(c, d), sets: [], status: 'scheduled', updatedAt: 0,
  }))
}

/** King of the court: the queue and the king after the matches played so far. */
function kingState(state: State, categoryId: string): { queue: string[]; king: string } {
  const group = recGroup(state, categoryId)
  const queue = [...(group?.teamIds ?? [])]
  let king = ''
  for (const m of recMatches(state, categoryId)) {
    const w = singleWinner(state, m)
    if (!w) continue
    const loser = w === m.teamA ? m.teamB : m.teamA
    king = w
    const i = queue.indexOf(loser)
    if (i >= 0) queue.splice(i, 1)
    queue.push(loser)
    const k = queue.indexOf(w)
    if (k >= 0) queue.splice(k, 1)
  }
  return { queue, king }
}

/** The next match on the king's court, or null while one is being played. */
export function kingNext(state: State, categoryId: string): Match | null {
  if (openRec(state, categoryId).length) return null
  const { queue, king } = kingState(state, categoryId)
  const [a, b] = king ? [king, queue[0]] : [queue[0], queue[1]]
  if (!a || !b) return null
  const n = currentRound(state, categoryId) + 1
  return {
    id: `${recGroupId(categoryId)}k${n}`, categoryId, groupId: recGroupId(categoryId), swissRound: n,
    court: 1, start: nextStart(state, categoryId), teamA: a, teamB: b, sets: [], status: 'scheduled', updatedAt: 0,
  }
}

/** King of the court: wins, the longest run of wins, and who is king now. */
export function kingTable(state: State, categoryId: string): PlayerRow[] {
  const group = recGroup(state, categoryId)
  if (!group) return []
  const rows = new Map(group.teamIds.map((id) => [id, { teamId: id, played: 0, won: 0, points: 0, diff: 0, place: 0, streak: 0 }]))
  const run = new Map<string, number>()
  for (const m of recMatches(state, categoryId)) {
    const w = singleWinner(state, m)
    if (!w) continue
    const loser = w === m.teamA ? m.teamB : m.teamA
    for (const id of [w, loser]) { const r = rows.get(id); if (r) r.played++ }
    const r = rows.get(w)
    if (r) { r.won++; r.points++; run.set(w, (run.get(w) ?? 0) + 1); r.streak = Math.max(r.streak, run.get(w)!) }
    run.set(loser, 0)
  }
  const { king } = kingState(state, categoryId)
  const list = [...rows.values()].map((r) => ({ ...r, king: r.teamId === king })).sort((a, b) => b.won - a.won || b.streak - a.streak || a.played - b.played)
  list.forEach((r, i) => { r.place = i > 0 && list[i - 1].won === r.won && list[i - 1].streak === r.streak ? list[i - 1].place : i + 1 })
  return list
}

/** Ladder: the list after the challenges played so far (a winning challenger takes the place). */
export function ladderOrder(state: State, categoryId: string): string[] {
  const order = [...(recGroup(state, categoryId)?.teamIds ?? [])]
  for (const m of recMatches(state, categoryId)) {
    const w = singleWinner(state, m)
    if (w !== m.teamA) continue
    const from = order.indexOf(m.teamA)
    const to = order.indexOf(m.teamB)
    if (from < 0 || to < 0 || to > from) continue
    order.splice(from, 1)
    order.splice(to, 0, m.teamA)
  }
  return order
}

/** Why a challenge cannot be made, or '' when it can. */
export function challengeProblem(state: State, categoryId: string, challenger: string, defender: string): string {
  const order = ladderOrder(state, categoryId)
  const a = order.indexOf(challenger)
  const b = order.indexOf(defender)
  if (a < 0 || b < 0 || a === b) return t('Wybierz dwóch różnych zawodników.')
  if (b > a) return t('Wyzywa się tylko kogoś wyżej na liście.')
  if (a - b > LADDER_REACH) return t('Można wyzwać najwyżej {n} miejsca wyżej.', { n: LADDER_REACH })
  if (openRec(state, categoryId).some((m) => [m.teamA, m.teamB].some((x) => x === challenger || x === defender))) return t('Jeden z nich ma już niedokończone wyzwanie.')
  return ''
}

/** A new challenge match: the challenger (side A) against the one higher up. */
export function ladderChallenge(state: State, categoryId: string, challenger: string, defender: string): Match {
  const n = currentRound(state, categoryId) + 1
  return {
    id: `${recGroupId(categoryId)}c${n}`, categoryId, groupId: recGroupId(categoryId), swissRound: n,
    court: 1, start: nextStart(state, categoryId), teamA: challenger, teamB: defender, sets: [], status: 'scheduled', updatedAt: 0,
  }
}
