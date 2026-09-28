import { t } from '../i18n'
import type { KoInfo, KoSource, Match, State, Tournament } from '../types'
import { koId, propagate, placeLabel, type KnockoutOptions } from './knockout'
import { nextSlot, toLocalIso } from './schedule'

/*
 * Knockout from the start, without groups:
 * - 'knockout': single elimination, the loser is out; optionally a match for 3rd place.
 * - 'double': double elimination. Everybody starts in the winners' bracket; a first loss
 *   moves you to the losers' bracket, a second loss ends your tournament. The winners'
 *   bracket winner meets the losers' bracket winner in the grand final; if the losers'
 *   bracket winner wins it, both have one loss and a second match decides (the reset).
 *
 * The bracket has 2, 4, 8, 16… places. With fewer players, the best-placed draw positions
 * get a free pass (bye) into the next round, so there is never a round with an odd number:
 * 17 players = one preliminary match, then 16 in the round of 16. Matches with a bye are
 * never created; whoever had the bye simply appears in the next match.
 */

export type System = 'groups' | 'knockout' | 'double' | 'custom' | 'swiss' | 'stepladder' | 'consolation' | 'measured'

export function systemOf(t: Pick<Tournament, 'system'>): System {
  return t.system ?? 'groups'
}

export function isElimination(t: Pick<Tournament, 'system'>): boolean {
  const s = systemOf(t)
  return s === 'knockout' || s === 'double' || s === 'custom' || s === 'stepladder' || s === 'consolation'
}

interface PlanItem {
  key: string
  info: KoInfo
}

/** Draw positions 1…size in bracket order, so the top seeds meet last: 1, 8, 4, 5, 2, 7, 3, 6. */
export function seedOrder(size: number): number[] {
  let order = [1]
  while (order.length < size) {
    const n = order.length * 2
    order = order.flatMap((s) => [s, n + 1 - s])
  }
  return order
}

/** The round (1 = first) in which bracket positions i and j could meet. */
function meetRound(i: number, j: number): number {
  return 32 - Math.clz32(i ^ j)
}

/**
 * Bracket order for a draw that keeps players of one club apart: the players of one club
 * go into different halves, then quarters…, so they meet as late as possible. `fixed`
 * (seeding from the list): only players of the same seeding tier swap places (1, 2, 3–4,
 * 5–8, 9–16…), so the top seeds stay where they are; otherwise any two may swap. Players
 * without a club (undefined) are never a reason to move.
 */
export function arrangeSeeds<T>(items: T[], clubOf: (x: T) => string | undefined, fixed: boolean): T[] {
  const n = items.length
  const list = [...items]
  if (n < 3) return list
  let size = 2
  while (size < n) size *= 2
  const rounds = Math.log2(size)
  const pos: number[] = []
  seedOrder(size).forEach((seed, i) => { pos[seed - 1] = i })
  const tier = (i: number) => (!fixed ? 0 : i < 2 ? i : Math.ceil(Math.log2(i + 1)) + 1)
  // Cost of a player of `club` at seed `i`: meeting a clubmate early costs more.
  const cost = (i: number, club: string | undefined, skip: number) => {
    if (club === undefined) return 0
    let c = 0
    for (let q = 0; q < n; q++) {
      if (q === i || q === skip || clubOf(list[q]) !== club) continue
      c += 2 ** (rounds - meetRound(pos[i], pos[q]))
    }
    return c
  }
  for (let pass = 0; pass < 20; pass++) {
    let better = false
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (tier(i) !== tier(j)) continue
        const ci = clubOf(list[i])
        const cj = clubOf(list[j])
        if (ci === cj) continue
        const now = cost(i, ci, j) + cost(j, cj, i)
        const swapped = cost(i, cj, j) + cost(j, ci, i)
        if (swapped < now) {
          ;[list[i], list[j]] = [list[j], list[i]]
          better = true
        }
      }
    }
    if (!better) break
  }
  return list
}

/** Name of a round by how many places it has left: final, semi-final, quarter-final, 1/8… */
function roundName(matchesInRound: number, round: number, n: number): string {
  if (matchesInRound === 1) return t('Finał')
  if (matchesInRound === 2) return t('Półfinał {n}', { n })
  if (matchesInRound === 4) return t('Ćwierćfinał {n}', { n })
  if (matchesInRound === 8) return t('1/8 finału · {n}', { n })
  if (matchesInRound === 16) return t('1/16 finału · {n}', { n })
  return t('Runda {r} · {n}', { r: round, n })
}

/**
 * The bracket for players in draw order (already shuffled). Keys: W{round}-{n} in the
 * winners' bracket, L{round}-{n} in the losers' bracket, GF and GF2 for the grand final,
 * P3 for 3rd place.
 */
export function eliminationPlan(categoryId: string, teamIds: string[], double: boolean, thirdPlace = false, bronzes = false): PlanItem[] {
  const n = teamIds.length
  if (n < 2) return []
  let size = 2
  while (size < n) size *= 2
  const rounds = Math.log2(size)
  const plan: PlanItem[] = []
  const id = (key: string) => koId(categoryId, key)
  const base = { tierFrom: 1, tierTo: n }
  type Slot = KoSource | null

  /** A match between two slots; with a bye the other side goes straight on. */
  const counters = new Map<string, number>()
  const match = (
    bracket: 'W' | 'L' | 'F', col: number, label: (k: number) => string, a: Slot, b: Slot, extra: Partial<KoInfo> = {},
  ): { win: Slot; lose: Slot } => {
    if (!a || !b) return { win: a ?? b, lose: null }
    const ck = `${bracket}${col}`
    const k = (counters.get(ck) ?? 0) + 1
    counters.set(ck, k)
    const key = extra.resetOf ? 'GF2' : bracket === 'F' ? (extra.place === 3 ? 'P3' : 'GF') : `${bracket}${col}-${k}`
    const name = label(k)
    plan.push({ key, info: { round: extra.place ? 'P' : 'R', ...base, label: name, srcA: a, srcB: b, bracket, col, ...extra } })
    return {
      win: { kind: 'match', matchId: id(key), take: 'winner', label: name },
      lose: { kind: 'match', matchId: id(key), take: 'loser', label: name },
    }
  }

  // Winners' bracket.
  const order = seedOrder(size)
  let slots: Slot[] = order.map((seed) => (seed <= n ? { kind: 'team', teamId: teamIds[seed - 1] } : null))
  const losersOf: Slot[][] = []
  for (let r = 1; r <= rounds; r++) {
    const inRound = size / 2 ** r
    const next: Slot[] = []
    const lost: Slot[] = []
    for (let i = 0; i < slots.length; i += 2) {
      const last = r === rounds
      const res = match('W', r, (k) => (last && double ? t('Finał drabinki zwycięzców') : roundName(inRound, r, k)), slots[i], slots[i + 1],
        last && !double ? { place: 1 } : bronzes && !double && r === rounds - 1 ? { loserPlace: 3 } : {})
      next.push(res.win)
      lost.push(res.lose)
    }
    losersOf.push(lost)
    slots = next
  }
  const champion = slots[0]

  if (!double) {
    // 3rd place: the two semi-final losers, when there were semi-finals.
    if (thirdPlace && !bronzes && rounds >= 2) {
      const [a, b] = losersOf[rounds - 2]
      if (a && b) match('F', rounds, () => placeLabel(3), a, b, { place: 3 })
    }
    return plan
  }

  // Losers' bracket: round 1 pairs the first-round losers; then, in turn, a round where the
  // losers coming down from the next winners' round join, and a round among themselves.
  const lr = (r: number, k: number, last: boolean) => (last ? t('Finał drabinki przegranych') : t('Przegrani · runda {r} · {n}', { r, n: k }))
  let lrNo = 0
  let lb: Slot[] = []
  const totalL = 2 * (rounds - 1)
  if (rounds >= 2) {
    lrNo = 1
    const first = losersOf[0]
    for (let i = 0; i < first.length; i += 2) lb.push(match('L', lrNo, (k) => lr(lrNo, k, lrNo === totalL), first[i], first[i + 1]).win)
    for (let j = 1; j <= rounds - 1; j++) {
      // Losers from winners' round j+1 join (in reverse order, so early rematches are rare).
      lrNo++
      const down = [...losersOf[j]].reverse()
      const joined: Slot[] = []
      for (let i = 0; i < lb.length; i++) {
        const last = lrNo === totalL
        joined.push(match('L', lrNo, (k) => lr(lrNo, k, last), lb[i], down[i], last ? { loserPlace: 3 } : {}).win)
      }
      lb = joined
      if (j < rounds - 1) {
        lrNo++
        const paired: Slot[] = []
        for (let i = 0; i < lb.length; i += 2) paired.push(match('L', lrNo, (k) => lr(lrNo, k, false), lb[i], lb[i + 1]).win)
        lb = paired
      }
    }
  } else {
    // Two players: the loser of the only match is the losers' bracket winner.
    lb = [losersOf[0][0]]
  }
  // Rounds left empty by byes are skipped in the numbering: the losers' rounds count from 1.
  const lCols = [...new Set(plan.filter((p) => p.info.bracket === 'L').map((p) => p.info.col!))].sort((a, b) => a - b)
  const relabel = new Map<string, string>()
  for (const p of plan) {
    if (p.info.bracket !== 'L') continue
    const r = lCols.indexOf(p.info.col!) + 1
    const k = Number(/(\d+)$/.exec(p.key)?.[1] ?? 1)
    const name = p.info.col === totalL ? t('Finał drabinki przegranych') : t('Przegrani · runda {r} · {n}', { r, n: k })
    relabel.set(p.info.label, name)
    p.info.label = name
    p.info.col = r
  }
  for (const p of plan) {
    for (const s of [p.info.srcA, p.info.srcB]) if (s.kind === 'match' && relabel.has(s.label)) s.label = relabel.get(s.label)!
  }
  const lbChampion = lb[0]
  const gf = match('F', 1, () => t('Wielki finał'), champion, lbChampion, { place: 1 })
  if (gf.win && gf.lose && champion && lbChampion) {
    const firstId = id('GF')
    match('F', 2, () => t('Wielki finał · rewanż'), champion, lbChampion, {
      place: 1, resetOf: firstId,
      // Filled in only when needed: the winner and the loser of the first match.
    })
    // The rematch is between the same two players: take them from the first match.
    const reset = plan[plan.length - 1]
    reset.info.srcA = { kind: 'match', matchId: firstId, take: 'loser', label: t('Wielki finał') }
    reset.info.srcB = { kind: 'match', matchId: firstId, take: 'winner', label: t('Wielki finał') }
  }
  return plan
}

/** How far into the tournament a match is: 1 + the latest match it waits for. */
function depths(plan: PlanItem[], categoryId: string): Map<string, number> {
  const byId = new Map(plan.map((p) => [koId(categoryId, p.key), p]))
  const memo = new Map<string, number>()
  const depth = (p: PlanItem): number => {
    const k = p.key
    if (memo.has(k)) return memo.get(k)!
    let d = 1
    for (const s of [p.info.srcA, p.info.srcB]) {
      if (s.kind === 'match') {
        const src = byId.get(s.matchId)
        if (src) d = Math.max(d, depth(src) + 1)
      }
    }
    memo.set(k, d)
    return d
  }
  plan.forEach(depth)
  return memo
}

/**
 * The bracket's matches with times and courts: round after round (a match never before
 * the ones it waits for), winners' bracket first, then the losers', the final(s) last.
 */
export function createElimination(state: State, categoryId: string, teamIds: string[], opts: KnockoutOptions): Match[] {
  const system = systemOf(state.tournament)
  const plan = eliminationPlan(categoryId, teamIds, system === 'double', !!state.tournament.thirdPlace, !!state.tournament.bronzes)
  if (!plan.length) return []
  const depth = depths(plan, categoryId)
  const order = { W: 0, L: 1, F: 2, C: 3 }
  const levels = [...new Set(plan.map((p) => depth.get(p.key)!))].sort((a, b) => a - b)
  const result: Match[] = []
  const step = (iso: string) => (opts.dayEnd && opts.dayStart
    ? nextSlot(iso, { slotMinutes: opts.slotMinutes, dayEnd: opts.dayEnd, dayStart: opts.dayStart, breaks: opts.breaks })
    : toLocalIso(new Date(new Date(iso).getTime() + opts.slotMinutes * 60000)))
  let slot = opts.start
  for (const level of levels) {
    const items = plan.filter((p) => depth.get(p.key) === level)
      .sort((a, b) => order[a.info.bracket ?? 'W'] - order[b.info.bracket ?? 'W'] || (a.info.col ?? 0) - (b.info.col ?? 0))
    let court = 0
    for (const p of items) {
      if (court === opts.courts.length) {
        court = 0
        slot = step(slot)
      }
      result.push({
        id: koId(categoryId, p.key), categoryId, groupId: '', ko: p.info,
        court: opts.courts[court++], start: slot,
        teamA: '', teamB: '', sets: [], status: 'scheduled', updatedAt: 0,
      })
    }
    slot = step(slot)
  }
  const withNew: State = { ...state, matches: [...state.matches.filter((m) => m.categoryId !== categoryId), ...result] }
  const filled = propagate(withNew)
  return result.map((m) => filled.find((f) => f.id === m.id) ?? m)
}

/** Whether a category is played as a bracket from the start (its matches say so). */
export function hasElimination(state: State, categoryId: string): boolean {
  return state.matches.some((m) => m.categoryId === categoryId && !!m.ko?.bracket && m.ko.bracket !== 'C')
}

/**
 * Final places decided so far: 1 and 2 from the (last) final, 3 from the 3rd place match
 * or the losers' final, two 3rd places with two bronzes.
 */
export function eliminationPlaces(state: State, categoryId: string, winnerOf: (m: Match) => string): { place: number; teamId: string }[] {
  const ms = state.matches.filter((m) => m.categoryId === categoryId && m.ko?.bracket && m.ko.bracket !== 'C' && !m.ko.legOf && !m.skipped)
  const out: { place: number; teamId: string }[] = []
  const add = (place: number, teamId: string) => {
    if (!teamId) return
    const i = out.findIndex((x) => x.teamId === teamId)
    if (i >= 0) { if (out[i].place > place) out[i].place = place; return }
    out.push({ place, teamId })
  }
  const finals = ms.filter((m) => m.ko!.place === 1).sort((a, b) => (a.ko!.resetOf ? 1 : 0) - (b.ko!.resetOf ? 1 : 0))
  const final = finals[finals.length - 1]
  if (final) {
    const w = winnerOf(final)
    if (w) { add(1, w); add(2, w === final.teamA ? final.teamB : final.teamA) }
  }
  for (const m of ms) {
    const w = winnerOf(m)
    if (!w) continue
    const loser = w === m.teamA ? m.teamB : m.teamA
    if (m.ko!.place === 3) { add(3, w); add(4, loser) }
    if (m.ko!.loserPlace) add(m.ko!.loserPlace, loser)
  }
  return out.sort((a, b) => a.place - b.place)
}
