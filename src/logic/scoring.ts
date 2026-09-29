import { t, tk } from '../i18n'
import type { Group, Match, Rules, SetScore, Team, Tiebreak } from '../types'
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
  /** Place in the table (the same for teams sharing it, see the "shared" criterion). */
  place: number
}

function ratio(won: number, lost: number): number {
  if (lost === 0) return won === 0 ? 0 : Number.POSITIVE_INFINITY
  return won / lost
}

/** Descending comparator that copes with Infinity (MAX ratios). */
function desc(x: number, y: number): number {
  return x === y ? 0 : y > x ? 1 : -1
}

/** Table points the two sides get for a finished match (overtime, walkover and volleyball's 3:2 rule included). */
export function matchTablePoints(rules: Rules, m: Match): [number, number] {
  // The organiser's own points for this match win over the rules.
  if (m.manualPoints) return m.manualPoints
  return rulesTablePoints(rules, m)
}

/** Table points for a match by the rules alone (what the organiser's own points are compared with). */
export function rulesTablePoints(rules: Rules, m: Match): [number, number] {
  const t = tally(rules, m.sets)
  if (t.setsA === t.setsB) return [rules.pointsDraw, rules.pointsDraw]
  // Volleyball: a 3:2 (or 2:1) win gives one point less to the winner and one to the loser.
  const split = rules.tieBreakSplit && rules.setsMode === 'bestOf' && t.setsA + t.setsB === rules.sets ? 1 : 0
  const extra = (m.decidedBy === 'overtime' || m.decidedBy === 'shootout') && rules.pointsOvertimeWin !== undefined
  const win = extra ? rules.pointsOvertimeWin! : rules.pointsWin - split
  const loss = extra
    ? rules.pointsOvertimeLoss ?? rules.pointsLoss
    : m.decidedBy === 'walkover' && rules.pointsWalkoverLoss !== undefined ? rules.pointsWalkoverLoss : rules.pointsLoss + split
  return t.setsA > t.setsB ? [win, loss] : [loss, win]
}

/** Fair-play points of the cards a team got (UEFA: yellow 1, second yellow 3, straight red 4). */
export const CARD_POINTS = { Y: 1, YR: 3, R: 4 } as const

export function cardPoints(teamId: string, matches: Match[]): number {
  let sum = 0
  for (const m of matches) {
    const side = m.teamA === teamId ? 'a' : m.teamB === teamId ? 'b' : null
    if (!side) continue
    for (const c of m.cards ?? []) if (c.side === side) sum += CARD_POINTS[c.kind]
  }
  return sum
}

/** A fixed pseudo-random number for a team: the "draw of lots" that never changes. */
function lotOf(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

const isH2h = (k: Tiebreak | undefined) => !!k && (k === 'h2h' || k.startsWith('h2h_'))

/**
 * Group table from finished matches: table points, then the tie-breakers in the order of
 * the rules (tiebreakOrder), each applied only to the teams still level. Head-to-head
 * criteria count the matches among the teams level when the head-to-head run started, or,
 * with `h2hReapply`, again among those still level after a split (UEFA). `place` is the
 * position shown; teams left level by "shared" have the same place (ex aequo).
 */
export function standings(
  rules: Rules,
  group: Group,
  matches: Match[],
  teams: Team[],
): StandingRow[] {
  const rows = new Map<string, StandingRow>()
  // A team withdrawn early (option A): out of the table, and its matches do not count.
  const voided = new Set(teams.filter((x) => x.voided).map((x) => x.id))
  for (const id of group.teamIds.filter((x) => !voided.has(x))) {
    rows.set(id, {
      teamId: id, played: 0, won: 0, drawn: 0, lost: 0,
      setsWon: 0, setsLost: 0, pointsWon: 0, pointsLost: 0, tablePoints: 0, place: 0,
    })
  }
  const finished = matches.filter((m) => m.groupId === group.id && m.status === 'finished' && !m.skipped && !voided.has(m.teamA) && !voided.has(m.teamB))
  for (const m of finished) {
    const a = rows.get(m.teamA)
    const b = rows.get(m.teamB)
    // A free round (Swiss system) counts as a win.
    if (m.bye && a) { a.played++; a.won++; a.tablePoints += rules.byePoints ?? rules.pointsWin; continue }
    if (!a || !b) continue
    const t = tally(rules, m.sets)
    a.played++; b.played++
    a.setsWon += t.setsA; a.setsLost += t.setsB
    b.setsWon += t.setsB; b.setsLost += t.setsA
    a.pointsWon += t.pointsA; a.pointsLost += t.pointsB
    b.pointsWon += t.pointsB; b.pointsLost += t.pointsA
    const [pa, pb] = matchTablePoints(rules, m)
    a.tablePoints += pa; b.tablePoints += pb
    if (t.setsA > t.setsB) { a.won++; b.lost++ } else if (t.setsB > t.setsA) { b.won++; a.lost++ } else { a.drawn++; b.drawn++ }
  }

  const team = (id: string) => teams.find((t) => t.id === id)
  const name = (id: string) => team(id)?.name ?? id
  const order = tiebreakOrder(rules)
  const played = finished.filter((m) => !m.bye)
  // The opponents' table points, one per match (Buchholz family).
  const opponents = (id: string): number[] => played
    .filter((m) => m.teamA === id || m.teamB === id)
    .map((m) => rows.get(m.teamA === id ? m.teamB : m.teamA)?.tablePoints ?? 0)
  const sum = (xs: number[]) => xs.reduce((x, y) => x + y, 0)
  // Head-to-head among the teams of `base`: points, difference, goals and wins in those matches.
  const h2h = (id: string, base: StandingRow[]) => {
    const ids = new Set(base.map((b) => b.teamId))
    let pts = 0; let diff = 0; let scored = 0; let wins = 0
    for (const m of played) {
      if (!ids.has(m.teamA) || !ids.has(m.teamB) || (m.teamA !== id && m.teamB !== id)) continue
      const t = tally(rules, m.sets)
      const home = m.teamA === id
      const [pa, pb] = matchTablePoints(rules, m)
      const mine = home ? t.setsA : t.setsB
      const theirs = home ? t.setsB : t.setsA
      const goalsMine = home ? t.pointsA : t.pointsB
      const goalsTheirs = home ? t.pointsB : t.pointsA
      pts += home ? pa : pb
      // Goals for goals, sets for sets.
      diff += isScore(rules) ? goalsMine - goalsTheirs : mine - theirs
      scored += goalsMine
      if (mine > theirs) wins++
    }
    return { pts, diff, scored, wins }
  }
  // Running score round by round, added up (chess "progressive").
  const progressive = (id: string): number => {
    let run = 0
    let total = 0
    const mine = finished
      .filter((m) => m.teamA === id || m.teamB === id)
      .sort((x, y) => (x.swissRound ?? 0) - (y.swissRound ?? 0) || x.start.localeCompare(y.start))
    for (const m of mine) {
      run += m.bye ? rules.byePoints ?? rules.pointsWin : matchTablePoints(rules, m)[m.teamA === id ? 0 : 1]
      total += run
    }
    return total
  }
  const value = (key: Tiebreak, r: StandingRow, base: StandingRow[]): number => {
    switch (key) {
      case 'wins': return r.won
      case 'win_pct': return r.played ? (r.won + r.drawn / 2) / r.played : 0
      case 'diff': return r.pointsWon - r.pointsLost
      case 'scored': return r.pointsWon
      case 'setDiff': return r.setsWon - r.setsLost
      case 'setRatio': return ratio(r.setsWon, r.setsLost)
      case 'pointRatio': return ratio(r.pointsWon, r.pointsLost)
      case 'h2h': { const h = h2h(r.teamId, base); return h.pts * 100000 + h.diff }
      case 'h2h_points': return h2h(r.teamId, base).pts
      case 'h2h_diff': return h2h(r.teamId, base).diff
      case 'h2h_scored': return h2h(r.teamId, base).scored
      case 'h2h_result': return h2h(r.teamId, base).wins
      case 'buchholz': return sum(opponents(r.teamId))
      case 'buchholz_cut1': {
        const o = opponents(r.teamId)
        return o.length > 1 ? sum(o) - Math.min(...o) : sum(o)
      }
      case 'buchholz_median': {
        const o = opponents(r.teamId)
        return o.length > 2 ? sum(o) - Math.min(...o) - Math.max(...o) : sum(o)
      }
      case 'sonneborn_berger': return played
        .filter((m) => m.teamA === r.teamId || m.teamB === r.teamId)
        .reduce((acc, m) => {
          const home = m.teamA === r.teamId
          const t = tally(rules, m.sets)
          const mine = home ? t.setsA : t.setsB
          const theirs = home ? t.setsB : t.setsA
          const opp = rows.get(home ? m.teamB : m.teamA)?.tablePoints ?? 0
          return acc + (mine > theirs ? opp : mine === theirs ? opp / 2 : 0)
        }, 0)
      case 'progressive': return progressive(r.teamId)
      // Seed: 1 is the strongest; without seeds, the order the teams were entered in.
      case 'seed': return -(team(r.teamId)?.seed ?? 1000 + group.teamIds.indexOf(r.teamId))
      case 'rating': return team(r.teamId)?.rating ?? 0
      case 'lots': return lotOf(r.teamId)
      // Fair play: the fewer card points, the better (yellow 1, second yellow 3, red 4).
      case 'fair_play': return -cardPoints(r.teamId, played)
      case 'shared': return 0
    }
  }
  const shared = new Map<string, number>()
  let sharedBlock = 0
  const byName = (block: StandingRow[]) => [...block].sort((x, y) => name(x.teamId).localeCompare(name(y.teamId), 'pl'))
  // Orders a block of teams level so far, from criterion `i` on. `base`: the block the
  // current head-to-head run is counted among (without h2hReapply).
  const rank = (block: StandingRow[], i: number, base?: StandingRow[]): StandingRow[] => {
    if (block.length < 2) return block
    if (i >= order.length) return byName(block)
    const key = order[i]
    if (key === 'shared') {
      sharedBlock++
      for (const r of block) shared.set(r.teamId, sharedBlock)
      return byName(block)
    }
    const h2hBase = isH2h(key) ? (rules.h2hReapply ? block : base ?? block) : undefined
    const scored = block.map((r) => ({ r, v: value(key, r, h2hBase ?? block) }))
    const levels = [...new Set(scored.map((x) => x.v))].sort((x, y) => desc(x, y))
    const keepBase = isH2h(order[i + 1]) ? h2hBase : undefined
    if (levels.length === 1) return rank(block, i + 1, keepBase)
    // Start of this head-to-head run, where h2hReapply begins again.
    let runStart = i
    while (runStart > 0 && isH2h(order[runStart - 1])) runStart--
    return levels.flatMap((v) => {
      const sub = scored.filter((x) => x.v === v).map((x) => x.r)
      if (isH2h(key) && rules.h2hReapply && sub.length > 1) return rank(sub, runStart)
      return rank(sub, i + 1, keepBase)
    })
  }
  // The organiser's penalties and bonuses (e.g. −3 for a walkover given away).
  for (const r of rows.values()) r.tablePoints += teams.find((x) => x.id === r.teamId)?.adjust?.points ?? 0
  const all = [...rows.values()]
  const pointsLevels = [...new Set(all.map((r) => r.tablePoints))].sort((x, y) => y - x)
  const ranked = pointsLevels.flatMap((p) => rank(all.filter((r) => r.tablePoints === p), 0))
  ranked.forEach((r, i) => {
    const prev = ranked[i - 1]
    const same = prev && shared.has(r.teamId) && shared.get(r.teamId) === shared.get(prev.teamId)
    r.place = same ? prev.place : i + 1
  })
  return ranked
}

/** The tie-breakers in use: the tournament's own, or the usual ones for the scoring. */
export function tiebreakOrder(rules: Rules): Tiebreak[] {
  if (rules.tiebreak?.length) return rules.tiebreak
  return isScore(rules) ? ['diff', 'scored', 'h2h'] : ['setRatio', 'pointRatio', 'h2h']

}

export function formatRatio(won: number, lost: number): string {
  const r = ratio(won, lost)
  if (r === Number.POSITIVE_INFINITY) return 'MAX'
  return r.toFixed(3).replace('.', ',')
}

/** Names of the tie-breakers, for the settings and the fans' tables. */
export const TIEBREAK_NAMES: Record<Tiebreak, string> = {
  h2h: tk('Mecz bezpośredni (mała tabela)'),
  wins: tk('Liczba wygranych meczów'),
  diff: tk('Różnica bramek / punktów'),
  scored: tk('Bramki / punkty zdobyte'),
  setRatio: tk('Stosunek setów'),
  setDiff: tk('Różnica setów'),
  pointRatio: tk('Stosunek małych punktów'),
  buchholz: tk('Buchholz (suma punktów rywali)'),
  win_pct: tk('Procent zwycięstw'),
  h2h_points: tk('Punkty w meczach bezpośrednich'),
  h2h_diff: tk('Różnica w meczach bezpośrednich'),
  h2h_scored: tk('Bramki / punkty zdobyte w meczach bezpośrednich'),
  h2h_result: tk('Wygrane mecze bezpośrednie'),
  buchholz_cut1: tk('Buchholz bez najsłabszego rywala'),
  buchholz_median: tk('Buchholz bez najlepszego i najsłabszego rywala'),
  sonneborn_berger: tk('Sonneborn-Berger (punkty pokonanych rywali + połowa zremisowanych)'),
  progressive: tk('Wynik narastający (suma po każdej rundzie)'),
  seed: tk('Rozstawienie'),
  rating: tk('Ranking (np. Elo)'),
  lots: tk('Losowanie'),
  shared: tk('Miejsce ex aequo'),
  fair_play: tk('Fair play (mniej kartek)'),
}
