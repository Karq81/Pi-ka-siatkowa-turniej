import { t } from '../i18n'
import type { Group, Match, Rules, SetScore, Team } from '../types'
import { judoLine, judoOf, judoResult, judoStopped } from './judo'
import { karateResult, karateStopped } from './karate'
import { chessText } from './chess'

/** One score per match (goals, points, or a judo contest) instead of sets. */
export function isScore(rules: Rules): boolean {
  return rules.scoring === 'score' || rules.scoring === 'judo' || rules.scoring === 'karate' || rules.scoring === 'chess'
}

/** Judo contests: ippon, waza-ari, yuko and shido (see judo.ts). */
export function isJudo(rules: Rules): boolean {
  return rules.scoring === 'judo'
}

/** What the small numbers in the table count: "małe punkty", or the score's unit ("bramki"). */
export function scoreUnit(rules: Rules): string {
  if (isJudo(rules)) return t('punkty techniczne')
  if (rules.scoring === 'karate') return t('punkty')
  if (rules.scoring === 'chess') return t('punkty')
  return t(isScore(rules) ? rules.unit ?? 'bramki' : rules.unit === 'gemy' ? 'gemy' : 'małe punkty')
}

/** A set (or a whole score, or a judo contest) as shown to people: "25:20", "W1 Y2 : Y1". */
export function setText(rules: Rules, s: SetScore): string {
  if (isJudo(rules)) return judoLine(s)
  if (rules.scoring === 'chess') return chessText(s)
  return `${s.a}:${s.b}`
}

/** All sets of a match in one line. */
export function setsText(rules: Rules, sets: SetScore[]): string {
  return sets.map((s) => setText(rules, s)).join(', ')
}

/** Target points for set number `index` (0-based). */
export function setTarget(rules: Rules, index: number): number {
  const deciding = rules.setsMode === 'bestOf' && index === rules.sets - 1
  return deciding ? rules.lastSetPoints : rules.setPoints
}

function isDeciding(rules: Rules, index: number): boolean {
  return rules.setsMode === 'bestOf' && index === rules.sets - 1
}

/** Points at which a set ends whatever the lead (tie-break or cap), if any. */
export function setCap(rules: Rules, index: number): number | undefined {
  return isDeciding(rules, index) && rules.lastSetPoints !== rules.setPoints ? rules.lastSetCap : rules.cap
}

/** Winner of a single set, or null while it is still in play. */
export function setWinner(rules: Rules, index: number, s: SetScore): 'a' | 'b' | null {
  if (isJudo(rules)) return judoResult(judoOf(s))?.winner ?? null
  if (rules.scoring === 'karate') return karateResult(s, true)?.winner ?? null
  if (isScore(rules)) return s.a > s.b ? 'a' : s.b > s.a ? 'b' : null
  const target = setTarget(rules, index)
  const cap = setCap(rules, index)
  if (cap && s.a >= cap && s.a > s.b) return 'a'
  if (cap && s.b >= cap && s.b > s.a) return 'b'
  if (s.a >= target && s.a - s.b >= rules.winBy) return 'a'
  if (s.b >= target && s.b - s.a >= rules.winBy) return 'b'
  return null
}

/**
 * Why a set score cannot be a finished set: 'unfinished' (nobody has won yet) or
 * 'impossible' (the set would have ended earlier, e.g. 18:12 when playing to 15).
 */
export function setProblem(rules: Rules, index: number, s: SetScore): 'unfinished' | 'impossible' | null {
  if (isScore(rules)) return null
  const target = setTarget(rules, index)
  const hi = Math.max(s.a, s.b)
  const diff = Math.abs(s.a - s.b)
  const cap = setCap(rules, index)
  // Nobody scores past the cap (7:6 in tennis), and at the cap one point decides.
  if (cap && (hi > cap || (hi === cap && diff === 0))) return 'impossible'
  // Past the target the set ends the moment someone leads by winBy, so a bigger lead is impossible.
  if (hi > target && diff > rules.winBy) return 'impossible'
  return setWinner(rules, index, s) ? null : 'unfinished'
}

/** Whether another point can be added to this set (false once the set is won). */
export function canAddPoint(rules: Rules, index: number, s: SetScore): boolean {
  if (isJudo(rules)) return !judoStopped(judoOf(s))
  if (rules.scoring === 'karate') return !karateStopped(s)
  if (isScore(rules)) return true
  return setWinner(rules, index, s) === null
}

/** Problem with a full result typed from a score sheet, or null when it is a valid finished match. */
export function resultProblem(rules: Rules, sets: SetScore[]): string | null {
  if (isJudo(rules)) {
    if (!sets.length) return t('Wpisz wynik walki.')
    if (!judoResult(judoOf(sets[0]))) return t('Walka nie jest rozstrzygnięta. Przy równym wyniku jest golden score: wygrywa pierwsza ocena. Możesz też zaznaczyć decyzję sędziów.')
    return null
  }
  if (rules.scoring === 'karate') {
    if (!sets.length) return t('Wpisz wynik walki.')
    if (!karateResult(sets[0], true)) return t('Walka nie jest rozstrzygnięta: równy wynik bez senshu. Zaznacz decyzję sędziów (hantei).')
    return null
  }
  if (rules.scoring === 'chess') {
    if (!sets.length) return t('Wpisz wynik partii.')
    const s = sets[0]
    if (s.a + s.b !== 1 || ![0, 0.5, 1].includes(s.a)) return t('Partia kończy się 1–0, ½–½ albo 0–1.')
    return null
  }
  if (isScore(rules)) {
    if (!sets.length) return t('Wpisz wynik meczu.')
    if (!rules.draws && sets[0].a === sets[0].b) return t('Remis nie jest możliwy: wpisz wynik po dogrywce lub rzutach karnych.')
    return null
  }
  if (!sets.length) return t('Wpisz wynik co najmniej jednego seta.')
  for (let i = 0; i < sets.length; i++) {
    const p = setProblem(rules, i, sets[i])
    const label = t('Set {n} ({score})', { n: i + 1, score: `${sets[i].a}:${sets[i].b}` })
    const rule = { target: setTarget(rules, i), lead: rules.winBy }
    if (p === 'impossible') return t('{label}: taki wynik jest niemożliwy, set kończy się wcześniej (do {target}, przewaga {lead}).', { label, ...rule })
    if (p === 'unfinished') return t('{label}: set nie jest zakończony (do {target}, przewaga {lead}).', { label, ...rule })
    if (i < sets.length - 1 && isMatchDecided(rules, sets.slice(0, i + 1))) return t('Mecz rozstrzygnął się po secie {n}, kolejne sety są zbędne.', { n: i + 1 })
  }
  if (!isMatchDecided(rules, sets)) return t('Mecz nie jest jeszcze rozstrzygnięty, brakuje seta.')
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
  // A score (goals, points) is one complete "set", also when level.
  if (isScore(rules) && sets.length) t.completeSets = 1
  return t
}

/** True once the match result is decided under the rules. */
export function isMatchDecided(rules: Rules, sets: SetScore[]): boolean {
  if (isJudo(rules)) return sets.length > 0 && !!judoResult(judoOf(sets[0]))
  if (rules.scoring === 'karate') return sets.length > 0 && !!karateResult(sets[0], true)
  if (rules.scoring === 'chess') return sets.length > 0 && sets[0].a + sets[0].b === 1
  if (isScore(rules)) return sets.length > 0 && (!!rules.draws || sets[0].a !== sets[0].b)
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
    // Volleyball: a 3:2 (or 2:1) win gives one point less to the winner and one to the loser.
    const split = rules.tieBreakSplit && rules.setsMode === 'bestOf' && t.setsA + t.setsB === rules.sets ? 1 : 0
    if (t.setsA > t.setsB) {
      a.won++; b.lost++
      a.tablePoints += rules.pointsWin - split; b.tablePoints += rules.pointsLoss + split
    } else if (t.setsB > t.setsA) {
      b.won++; a.lost++
      b.tablePoints += rules.pointsWin - split; a.tablePoints += rules.pointsLoss + split
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

  if (isScore(rules)) {
    // Goals and points: table points, goal difference, goals scored, head-to-head.
    return [...rows.values()].sort(
      (x, y) =>
        y.tablePoints - x.tablePoints ||
        (y.pointsWon - y.pointsLost) - (x.pointsWon - x.pointsLost) ||
        y.pointsWon - x.pointsWon ||
        headToHead(x.teamId, y.teamId) ||
        name(x.teamId).localeCompare(name(y.teamId), 'pl'),
    )
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
