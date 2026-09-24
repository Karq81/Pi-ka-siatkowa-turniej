import type { Group, Match, Rules, SetScore, Team } from '../types'

/** Target points for set number `index` (0-based). */
export function setTarget(rules: Rules, index: number): number {
  const deciding = rules.setsMode === 'bestOf' && index === rules.sets - 1
  return deciding ? rules.lastSetPoints : rules.setPoints
}

/** Winner of a single set, or null while it is still in play. */
export function setWinner(rules: Rules, index: number, s: SetScore): 'a' | 'b' | null {
  const target = setTarget(rules, index)
  if (s.a >= target && s.a - s.b >= rules.winBy) return 'a'
  if (s.b >= target && s.b - s.a >= rules.winBy) return 'b'
  return null
}

export interface MatchTally {
  setsA: number
  setsB: number
  pointsA: number
  pointsB: number
  /** Sets that have a winner. */
  completeSets: number
}

export function tally(rules: Rules, sets: SetScore[]): MatchTally {
  const t: MatchTally = { setsA: 0, setsB: 0, pointsA: 0, pointsB: 0, completeSets: 0 }
  sets.forEach((s, i) => {
    t.pointsA += s.a
    t.pointsB += s.b
    const w = setWinner(rules, i, s)
    if (w === 'a') t.setsA++
    if (w === 'b') t.setsB++
    if (w) t.completeSets++
  })
  return t
}

/** True once the match result is decided under the rules. */
export function isMatchDecided(rules: Rules, sets: SetScore[]): boolean {
  const t = tally(rules, sets)
  if (rules.setsMode === 'fixed') return t.completeSets >= rules.sets
  const need = Math.floor(rules.sets / 2) + 1
  return t.setsA >= need || t.setsB >= need
}

export interface StandingRow {
  teamId: string
  played: number
  won: number
  drawn: number
  lost: number
  setsWon: number
  setsLost: number
  pointsWon: number
  pointsLost: number
  tablePoints: number
}

function ratio(won: number, lost: number): number {
  if (lost === 0) return won === 0 ? 0 : Number.POSITIVE_INFINITY
  return won / lost
}

/** Descending comparator that copes with Infinity (MAX ratios). */
function desc(x: number, y: number): number {
  return x === y ? 0 : y > x ? 1 : -1
}

/**
 * Group table from finished matches. Order: table points, set ratio,
 * small-points ratio, head-to-head (for two teams level), then name.
 */
export function standings(
  rules: Rules,
  group: Group,
  matches: Match[],
  teams: Team[],
): StandingRow[] {
  const rows = new Map<string, StandingRow>()
  for (const id of group.teamIds) {
    rows.set(id, {
      teamId: id, played: 0, won: 0, drawn: 0, lost: 0,
      setsWon: 0, setsLost: 0, pointsWon: 0, pointsLost: 0, tablePoints: 0,
    })
  }
  const finished = matches.filter((m) => m.groupId === group.id && m.status === 'finished')
  for (const m of finished) {
    const a = rows.get(m.teamA)
    const b = rows.get(m.teamB)
    if (!a || !b) continue
    const t = tally(rules, m.sets)
    a.played++; b.played++
    a.setsWon += t.setsA; a.setsLost += t.setsB
    b.setsWon += t.setsB; b.setsLost += t.setsA
    a.pointsWon += t.pointsA; a.pointsLost += t.pointsB
    b.pointsWon += t.pointsB; b.pointsLost += t.pointsA
    if (t.setsA > t.setsB) {
      a.won++; b.lost++
      a.tablePoints += rules.pointsWin; b.tablePoints += rules.pointsLoss
    } else if (t.setsB > t.setsA) {
      b.won++; a.lost++
      b.tablePoints += rules.pointsWin; a.tablePoints += rules.pointsLoss
    } else {
      a.drawn++; b.drawn++
      a.tablePoints += rules.pointsDraw; b.tablePoints += rules.pointsDraw
    }
  }

  const name = (id: string) => teams.find((t) => t.id === id)?.name ?? id
  const headToHead = (x: string, y: string): number => {
    const m = finished.find(
      (m) => (m.teamA === x && m.teamB === y) || (m.teamA === y && m.teamB === x),
    )
    if (!m) return 0
    const t = tally(rules, m.sets)
    const xSets = m.teamA === x ? t.setsA : t.setsB
    const ySets = m.teamA === x ? t.setsB : t.setsA
    return ySets - xSets
  }

  return [...rows.values()].sort(
    (x, y) =>
      y.tablePoints - x.tablePoints ||
      desc(ratio(x.setsWon, x.setsLost), ratio(y.setsWon, y.setsLost)) ||
      desc(ratio(x.pointsWon, x.pointsLost), ratio(y.pointsWon, y.pointsLost)) ||
      headToHead(x.teamId, y.teamId) ||
      name(x.teamId).localeCompare(name(y.teamId), 'pl'),
  )
}

export function formatRatio(won: number, lost: number): string {
  const r = ratio(won, lost)
  if (r === Number.POSITIVE_INFINITY) return 'MAX'
  return r.toFixed(3).replace('.', ',')
}
