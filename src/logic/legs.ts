import { t } from '../i18n'
import type { Match, SetScore, State, Tournament } from '../types'
import { nextSlot, type TimeBreak } from './schedule'
import { isMatchDecided, isScore, tally } from './scoring'

/*
 * Two-legged ties and series (docs/specyfikacja-turnieje.md 2.6). A bracket pairing is its
 * first match (the "tie"); the other matches of the pairing ("legs") point to it with
 * ko.legOf and are played after it.
 *   two legs: the aggregate decides (goals, or sets then points); level: away goals if the
 *     tournament counts them, then the penalties of the second leg.
 *   series (best of N): the first to win ceil(N/2) games; games no longer needed are left out.
 */

export type Ties = NonNullable<Tournament['ties']>

/** The tie's matches in order: the first match and its legs. */
export function legsOf(state: State, tie: Match): Match[] {
  const legs = state.matches.filter((m) => m.ko?.legOf === tie.id).sort((a, b) => (a.ko!.leg ?? 0) - (b.ko!.leg ?? 0))
  return [tie, ...legs]
}

export function hasLegs(state: State, m: Match): boolean {
  return state.matches.some((x) => x.ko?.legOf === m.id)
}

/** Winner of a single finished match: by the score, or by the penalties when level. */
export function singleWinner(state: State, m: Match): string {
  if (m.status !== 'finished' || !m.teamA || !m.teamB || m.skipped) return ''
  const rules = state.tournament.rules
  const tl = tally(rules, m.sets)
  if (tl.setsA === tl.setsB) {
    const p = m.penalties
    return p && p.a !== p.b ? (p.a > p.b ? m.teamA : m.teamB) : ''
  }
  if (!isMatchDecided(rules, m.sets)) return ''
  return tl.setsA > tl.setsB ? m.teamA : m.teamB
}

export interface TieScore {
  /** From the side of the tie's teamA and teamB. */
  a: number
  b: number
  /** What the numbers are: the aggregate ("suma") or games won in a series. */
  kind: 'aggregate' | 'series'
  winner: string
}

/** The standing of a two-legged tie or a series (null for a single match). */
export function tieScore(state: State, tie: Match): TieScore | null {
  const all = legsOf(state, tie)
  if (all.length < 2 || !tie.teamA || !tie.teamB) return null
  const rules = state.tournament.rules
  const ties = state.tournament.ties
  const A = tie.teamA
  const B = tie.teamB
  if (ties?.kind === 'series') {
    let a = 0
    let b = 0
    for (const m of all) {
      const w = singleWinner(state, m)
      if (w === A) a++
      else if (w === B) b++
    }
    const need = Math.floor(all.length / 2) + 1
    return { a, b, kind: 'series', winner: a >= need ? A : b >= need ? B : '' }
  }
  // Two legs: goals (points) for score games; sets, then small points, for set games.
  let a = 0; let b = 0; let pa = 0; let pb = 0; let awayA = 0; let awayB = 0
  for (const m of all) {
    const tl = tally(rules, m.sets)
    const [goalsA, goalsB] = m.teamA === A ? [tl.pointsA, tl.pointsB] : [tl.pointsB, tl.pointsA]
    const [setsA, setsB] = m.teamA === A ? [tl.setsA, tl.setsB] : [tl.setsB, tl.setsA]
    if (isScore(rules)) { a += goalsA; b += goalsB } else { a += setsA; b += setsB; pa += goalsA; pb += goalsB }
    if (m.teamA === A) awayB += goalsB
    else awayA += goalsA
  }
  const done = all.every((m) => m.status === 'finished')
  let winner = ''
  if (done) {
    if (a !== b) winner = a > b ? A : B
    else if (!isScore(rules) && pa !== pb) winner = pa > pb ? A : B
    else if (ties?.awayGoals && awayA !== awayB) winner = awayA > awayB ? A : B
    else {
      const last = all[all.length - 1]
      const p = last.penalties
      if (p && p.a !== p.b) winner = (p.a > p.b) === (last.teamA === A) ? A : B
    }
  }
  return { a, b, kind: 'aggregate', winner }
}

/** Winner of a bracket pairing: the tie's (two legs, series) or the single match's. */
export function koWinner(state: State, m: Match): string {
  const tie = tieScore(state, m)
  return tie ? tie.winner : singleWinner(state, m)
}

/** Whether the match's result may be level: a leg of a two-legged tie (not the last's aggregate). */
export function isTwoLegged(state: State, m: Match): boolean {
  return state.tournament.ties?.kind === 'two' && (!!m.ko?.legOf || hasLegs(state, m))
}

/**
 * Whether penalties are needed with this result: a level knockout match with no draws, or
 * the last leg of a two-legged tie whose aggregate (with this result) is level.
 */
export function needsPenalties(state: State, m: Match, sets: SetScore[]): boolean {
  const rules = state.tournament.rules
  if (!m.ko || !isScore(rules) || !sets.length) return false
  const tl = tally(rules, sets)
  if (state.tournament.ties?.kind === 'two') {
    const tieId = m.ko.legOf ?? m.id
    const tie = state.matches.find((x) => x.id === tieId)
    if (!tie) return false
    const all = legsOf(state, tie)
    if (all.length > 1) {
      if (all[all.length - 1].id !== m.id) return false
      const trial: State = { ...state, matches: state.matches.map((x) => (x.id === m.id ? { ...x, sets, status: 'finished' as const, penalties: undefined } : x)) }
      const score = tieScore(trial, trial.matches.find((x) => x.id === tieId)!)
      if (!score || score.a !== score.b) return false
      if (!state.tournament.ties.awayGoals) return true
      // Away goals decide unless they are level too.
      return !score.winner
    }
  }
  return tl.setsA === tl.setsB && !rules.draws
}

/** Home and away in game `k` (1…n) of a series: 2-2-1-1-1 for 7, 2-2-1 for 5, else by turns. */
function swapped(n: number, k: number): boolean {
  if (n === 7) return [false, false, true, true, false, true, false][k - 1]
  if (n === 5) return [false, false, true, true, false][k - 1]
  return k % 2 === 0
}

/**
 * The category's bracket with legs (the tournament's `ties` setting): every pairing gets its
 * second leg or the further games of its series, and the bracket is timed again so all the
 * games of a round come before the next round. The grand final's rematch stays single; with
 * `finalSingle` so do the final and the matches for places.
 */
export function withLegs(state: State, categoryId: string, sched: { start: string; slotMinutes: number; dayEnd: string; dayStart: string; breaks?: TimeBreak[] }): State {
  const ties = state.tournament.ties
  const base = state.matches.filter((m) => !(m.categoryId === categoryId && m.ko?.legOf))
  const ko = base.filter((m) => m.categoryId === categoryId && m.ko)
  if (!ties || ties.kind === 'one' || !ko.length) return { ...state, matches: base }
  const games = ties.kind === 'two' ? 2 : Math.max(1, ties.n ?? 3)
  const legs: Match[] = []
  for (const m of ko) {
    if (m.ko!.resetOf || (ties.finalSingle && m.ko!.place)) continue
    for (let k = 2; k <= games; k++) {
      const swap = ties.kind === 'two' ? true : swapped(games, k)
      legs.push({
        ...m, id: `${m.id}-g${k}`, sets: [], status: 'scheduled', updatedAt: 0, skipped: false,
        teamA: swap ? m.teamB : m.teamA, teamB: swap ? m.teamA : m.teamB,
        ko: {
          ...m.ko!, legOf: m.id, leg: k, swap,
          label: ties.kind === 'two' ? t('{match} · rewanż', { match: m.ko!.label }) : t('{match} · mecz {n}', { match: m.ko!.label, n: k }),
        },
      })
    }
  }
  // Times again: level by level (a match after those it waits for), each game of the
  // level after the previous one, courts filled in turn.
  const all = [...ko, ...legs]
  const byId = new Map(all.map((m) => [m.id, m]))
  const depth = new Map<string, number>()
  const depthOf = (m: Match): number => {
    if (depth.has(m.id)) return depth.get(m.id)!
    let d = 1
    for (const s of [m.ko!.srcA, m.ko!.srcB]) {
      if (s.kind === 'match') {
        const src = byId.get(s.matchId)
        if (src) d = Math.max(d, depthOf(src) + 1)
      }
    }
    depth.set(m.id, d)
    return d
  }
  const key = (m: Match) => (m.ko!.legOf ? depthOf(byId.get(m.ko!.legOf)!) : depthOf(m)) * 100 + (m.ko!.leg ?? 1)
  const order = { W: 0, L: 1, C: 2, F: 3 }
  const sorted = [...all].sort((x, y) => key(x) - key(y)
    || order[x.ko!.bracket ?? 'C'] - order[y.ko!.bracket ?? 'C'] || x.start.localeCompare(y.start) || x.court - y.court)
  let slot = ko.map((m) => m.start).sort()[0] ?? sched.start
  let court = 1
  let level = key(sorted[0])
  const timed = sorted.map((m) => {
    if (key(m) !== level || court > state.tournament.courts) {
      slot = nextSlot(slot, sched)
      court = 1
      level = key(m)
    }
    return { ...m, start: slot, court: court++ }
  })
  const timedById = new Map(timed.map((m) => [m.id, m]))
  return { ...state, matches: [...base.map((m) => timedById.get(m.id) ?? m), ...legs.map((m) => timedById.get(m.id)!)] }
}
