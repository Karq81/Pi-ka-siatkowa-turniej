import { t } from '../i18n'
import type { CustomMatch, KoSource, Match, State } from '../types'
import { koId, propagate } from './knockout'
import { scheduleOf } from './newTournament'
import { nextSlot } from './schedule'

/*
 * The organiser's own plan: any shape of tournament described in words and turned by the
 * AI assistant into matches. Each side of a match says where its player comes from:
 *   team:Jan Kowalski   – named directly
 *   group:A:1           – 1st place of group A (after the group has finished)
 *   winner:Półfinał 1   – the winner of another match of the plan
 *   loser:Półfinał 1    – its loser (repechage, matches for places, …)
 * Matches are played after the groups (if any), each after the ones it waits for; later
 * matches fill in by themselves as results come in (see knockout.ts, propagate).
 */

export type Side =
  | { kind: 'team'; name: string }
  | { kind: 'group'; group: string; pos: number }
  | { kind: 'winner' | 'loser'; match: string }

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

export function parseSide(text: string): Side | null {
  const m = /^\s*(team|group|winner|loser)\s*:\s*(.+?)\s*$/i.exec(text)
  if (!m) return null
  const kind = m[1].toLowerCase()
  const rest = m[2]
  if (kind === 'team') return { kind: 'team', name: rest }
  if (kind === 'group') {
    const g = /^(.+?)\s*:\s*(\d+)$/.exec(rest)
    return g ? { kind: 'group', group: g[1], pos: Number(g[2]) } : null
  }
  return { kind: kind as 'winner' | 'loser', match: rest }
}

/** Finds a group by letter ("A"), by name ("Grupa A") or by number ("1"). */
function findGroup<G extends { name: string }>(groups: G[], ref: string): G | undefined {
  const r = norm(ref)
  return groups.find((g) => norm(g.name) === r)
    ?? groups.find((g) => norm(g.name).replace(/^grupa\s+/, '') === r.replace(/^grupa\s+/, ''))
    ?? (/^\d+$/.test(r) ? groups[Number(r) - 1] : undefined)
    ?? (/^[a-z]$/.test(r) ? groups[r.charCodeAt(0) - 97] : undefined)
}

/**
 * What is wrong with a plan, in plain words: sides that cannot be read, players or groups
 * that do not exist, matches that wait for themselves. Empty when the plan is fine.
 * `groups` null: the groups will be drawn later, so any group letter up to `groupCount`.
 */
export function checkCustom(plan: CustomMatch[], teamNames: string[], groups: { name: string }[] | null, groupCount = 0): string[] {
  const problems: string[] = []
  const names = new Set(plan.map((m) => norm(m.name)))
  if (names.size !== plan.length) problems.push(t('Dwa spotkania planu mają tę samą nazwę.'))
  const teams = new Set(teamNames.map(norm))
  const known = groups ?? Array.from({ length: groupCount }, (_, i) => ({ name: t('Grupa {letter}', { letter: 'ABCDEFGHIJKL'[i] ?? String(i + 1) }) }))
  for (const m of plan) {
    for (const side of [m.a, m.b]) {
      const s = parseSide(side)
      if (!s) problems.push(t('„{match}”: nie rozumiem „{side}”.', { match: m.name, side }))
      else if (s.kind === 'team' && !teams.has(norm(s.name))) problems.push(t('„{match}”: nie ma na liście „{name}”.', { match: m.name, name: s.name }))
      else if (s.kind === 'group' && !findGroup(known, s.group)) problems.push(t('„{match}”: nie ma grupy „{group}”.', { match: m.name, group: s.group }))
      else if ((s.kind === 'winner' || s.kind === 'loser') && !names.has(norm(s.match))) problems.push(t('„{match}”: nie ma spotkania „{other}”.', { match: m.name, other: s.match }))
    }
  }
  // A match may not wait for itself, directly or through others.
  const deps = new Map(plan.map((m) => [norm(m.name), [m.a, m.b].map(parseSide).flatMap((s) => (s && (s.kind === 'winner' || s.kind === 'loser') ? [norm(s.match)] : []))]))
  const state = new Map<string, 1 | 2>()
  const visit = (k: string): boolean => {
    if (state.get(k) === 2) return true
    if (state.get(k) === 1) return false
    state.set(k, 1)
    const ok = (deps.get(k) ?? []).every(visit)
    state.set(k, 2)
    return ok
  }
  if (![...deps.keys()].every(visit)) problems.push(t('Plan ma spotkania, które czekają same na siebie.'))
  return problems
}

/** One category's plan as matches: sides resolved, times after the category's groups. */
export function customMatches(state: State, categoryId: string): Match[] {
  const plan = state.tournament.custom?.[categoryId] ?? []
  if (!plan.length) return []
  const teams = state.teams.filter((x) => x.categoryId === categoryId)
  const groups = state.groups.filter((g) => g.categoryId === categoryId)
  const idOf = new Map(plan.map((m, i) => [norm(m.name), koId(categoryId, `C${i + 1}`)]))
  const source = (text: string): KoSource | null => {
    const s = parseSide(text)
    if (!s) return null
    if (s.kind === 'team') {
      const team = teams.find((x) => norm(x.name) === norm(s.name))
      return team ? { kind: 'team', teamId: team.id } : null
    }
    if (s.kind === 'group') {
      const g = findGroup(groups, s.group)
      return g ? { kind: 'group', groupId: g.id, pos: s.pos } : null
    }
    const id = idOf.get(norm(s.match))
    const other = plan.find((x) => norm(x.name) === norm(s.match))
    return id && other ? { kind: 'match', matchId: id, take: s.kind, label: other.name } : null
  }
  // Only matches whose both sides can be read (and whose earlier matches exist).
  const items = plan.map((m, i) => ({ m, id: koId(categoryId, `C${i + 1}`), a: source(m.a), b: source(m.b) }))
  const ok = new Set(items.filter((x) => x.a && x.b).map((x) => x.id))
  let changed = true
  while (changed) {
    changed = false
    for (const x of items) {
      if (!ok.has(x.id)) continue
      if ([x.a!, x.b!].some((s) => s.kind === 'match' && !ok.has(s.matchId))) { ok.delete(x.id); changed = true }
    }
  }
  const valid = items.filter((x) => ok.has(x.id))
  // Level: 1 + the latest match it waits for.
  const level = new Map<string, number>()
  const levelOf = (id: string): number => {
    if (level.has(id)) return level.get(id)!
    const x = valid.find((v) => v.id === id)!
    let d = 1
    for (const s of [x.a!, x.b!]) if (s.kind === 'match') d = Math.max(d, levelOf(s.matchId) + 1)
    level.set(id, d)
    return d
  }
  valid.forEach((x) => levelOf(x.id))

  // Times: after the category's last group match (or from the start), round by round.
  const sched = scheduleOf(state.tournament)
  const groupStarts = state.matches.filter((m) => m.categoryId === categoryId && !m.ko).map((m) => m.start).sort()
  const step = (iso: string) => nextSlot(iso, sched)

  let slot = groupStarts.length ? step(groupStarts[groupStarts.length - 1]) : sched.start
  const n = teams.length
  const result: Match[] = []
  const levels = [...new Set(level.values())].sort((a, b) => a - b)
  for (const lv of levels) {
    let court = 1
    for (const x of valid.filter((v) => level.get(v.id) === lv)) {
      if (court > state.tournament.courts) { court = 1; slot = step(slot) }
      result.push({
        id: x.id, categoryId, groupId: '', court: court++, start: slot,
        teamA: '', teamB: '', sets: [], status: 'scheduled', updatedAt: 0,
        ko: {
          round: x.m.place ? 'P' : 'R', tierFrom: 1, tierTo: Math.max(n, 2), label: x.m.name,
          srcA: x.a!, srcB: x.b!, bracket: 'C', col: lv,
          ...(x.m.place ? { place: x.m.place } : {}), ...(x.m.loserPlace ? { loserPlace: x.m.loserPlace } : {}),
        },
      })
    }
    slot = step(slot)
  }
  const withNew: State = { ...state, matches: [...state.matches.filter((m) => !(m.categoryId === categoryId && m.ko?.bracket === 'C')), ...result] }
  const filled = propagate(withNew)
  return result.map((m) => filled.find((f) => f.id === m.id) ?? m)
}

/** The tournament with every category's plan (re)made: after the groups are drawn or changed. */
export function withCustom(state: State): State {
  const plans = state.tournament.custom ?? {}
  let matches = state.matches.filter((m) => m.ko?.bracket !== 'C' || !plans[m.categoryId])
  for (const c of state.categories) {
    if (!plans[c.id]?.length) continue
    const made = customMatches({ ...state, matches }, c.id)
    matches = [...matches, ...made]
  }
  return { ...state, matches }
}

export function hasCustom(state: State, categoryId: string): boolean {
  return state.matches.some((m) => m.categoryId === categoryId && m.ko?.bracket === 'C')
}

/** Places decided by the plan's matches for places (two bronzes in judo both show as 3.). */
export function customPlaces(state: State, categoryId: string, winnerOf: (m: Match) => string): { place: number; teamId: string }[] {
  const out: { place: number; teamId: string }[] = []
  const add = (place: number, teamId: string) => { if (teamId && !out.some((x) => x.teamId === teamId)) out.push({ place, teamId }) }
  const done = state.matches.filter((m) => m.categoryId === categoryId && m.ko?.bracket === 'C' && m.status === 'finished')
  // Better places first, so a player keeps the best place they reached.
  for (const m of [...done].sort((a, b) => (a.ko!.place ?? 99) - (b.ko!.place ?? 99))) {
    const w = winnerOf(m)
    if (!w) continue
    const loser = w === m.teamA ? m.teamB : m.teamA
    if (m.ko!.place) { add(m.ko!.place, w); add(m.ko!.loserPlace ?? m.ko!.place + 1, loser) }
    else if (m.ko!.loserPlace) add(m.ko!.loserPlace, loser)
  }
  return out.sort((a, b) => a.place - b.place)
}

/**
 * Stepladder: players in order of strength (the best first). The two weakest play; the
 * winner meets the next one up, and so on, until the final against number 1. Each loser
 * takes the place of their step (the first loser is last).
 */
export function stepladderPlan(names: string[]): CustomMatch[] {
  const n = names.length
  if (n < 2) return []
  const plan: CustomMatch[] = []
  let prev = `team:${names[n - 1]}`
  for (let i = n - 2, k = 1; i >= 0; i--, k++) {
    const last = i === 0
    const name = last ? t('Finał') : t('Szczebel {n}', { n: k })
    plan.push({ name, a: `team:${names[i]}`, b: prev, ...(last ? { place: 1 } : { loserPlace: i + 2 }) })
    prev = `winner:${name}`
  }
  return plan
}

/**
 * A knockout bracket written as a plan (players in draw order; byes to the first places so
 * no round is odd), plus a consolation bracket for the first-round losers. Round names come
 * with a prefix, so both brackets live in one plan.
 */
function knockoutAsPlan(sides: string[], prefix: string, placeFrom: number, thirdPlace: boolean): CustomMatch[] {
  const n = sides.length
  if (n < 2) return []
  let size = 2
  while (size < n) size *= 2
  const rounds = Math.log2(size)
  let order = [1]
  while (order.length < size) order = order.flatMap((s) => [s, order.length * 2 + 1 - s])
  let slots: (string | null)[] = order.map((seed) => (seed <= n ? sides[seed - 1] : null))
  const plan: CustomMatch[] = []
  let semiLosers: string[] = []
  for (let r = 1; r <= rounds; r++) {
    const inRound = size / 2 ** r
    const next: (string | null)[] = []
    const losers: string[] = []
    let k = 0
    for (let i = 0; i < slots.length; i += 2) {
      const [a, b] = [slots[i], slots[i + 1]]
      if (!a || !b) { next.push(a ?? b); continue }
      k++
      const label = inRound === 1 ? t('Finał') : inRound === 2 ? t('Półfinał {n}', { n: k }) : inRound === 4 ? t('Ćwierćfinał {n}', { n: k }) : t('Runda {r} · {n}', { r, n: k })
      const name = prefix ? `${prefix}: ${label}` : label
      plan.push({ name, a, b, ...(inRound === 1 ? { place: placeFrom } : {}) })
      next.push(`winner:${name}`)
      losers.push(`loser:${name}`)
    }
    if (inRound === 2) semiLosers = losers
    slots = next
  }
  if (thirdPlace && semiLosers.length === 2) {
    const label = t('O {n}. miejsce', { n: placeFrom + 2 })
    plan.push({ name: prefix ? `${prefix}: ${label}` : label, a: semiLosers[0], b: semiLosers[1], place: placeFrom + 2 })
  }
  return plan
}

/** The main knockout bracket and, for the first-round losers, a consolation bracket. */
export function consolationPlan(names: string[], thirdPlace = true): CustomMatch[] {
  const main = knockoutAsPlan(names.map((x) => `team:${x}`), '', 1, thirdPlace)
  // First-round losers: matches that take two named players.
  const firstLosers = main.filter((m) => m.a.startsWith('team:') && m.b.startsWith('team:')).map((m) => `loser:${m.name}`)
  const plate = knockoutAsPlan(firstLosers, t('Pocieszenie'), 0, false).map((m) => {
    // The consolation final decides no medal place; its matches keep no places.
    const { place: _p, ...rest } = m
    void _p
    return rest
  })
  return [...main, ...plate]
}
