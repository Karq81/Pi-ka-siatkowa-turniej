import { t } from '../i18n'
import type { Group, Measure, Perf, State, Team, Tournament } from '../types'
import { shuffle } from './draw'

/*
 * Measured events (docs/specyfikacja-turnieje.md 2.7 and 2.8): runs, swimming, time trials
 * (time, the lower the better), jumps and throws (distance, the higher the better), archery,
 * shooting, bowling (points), golf (strokes). No matches: every heat or round is a group of
 * participants, and each of them has a result (Tournament.perf).
 *   heats:  heats, then a final for the first Q of each heat and the q best of the others.
 *   rounds: everybody in every round (races, games, rounds of golf); a place in a round
 *           gives points (25-18-15…, or 1 point for 1st, the fewest win, worst rounds dropped).
 */

export function isMeasured(t: Pick<Tournament, 'system' | 'rules'>): boolean {
  return t.system === 'measured' || t.rules.scoring === 'measured'
}

export function measureOf(t: Pick<Tournament, 'rules'>): Measure {
  return t.rules.measure ?? { unit: 'time', lowerIsBetter: true, attempts: 1, aggregate: 'best' }
}

/** A typed result as a number: time "1:02,35" or "62.35" → ms; distance "5,23" (m) → cm; points and strokes as they are. */
export function parseValue(text: string, unit: Measure['unit']): number | null {
  const s = text.trim().replace(',', '.')
  if (!s) return null
  if (unit === 'time') {
    const parts = s.split(':').map(Number)
    if (parts.some((x) => Number.isNaN(x) || x < 0)) return null
    const secs = parts.reduce((acc, x) => acc * 60 + x, 0)
    return Math.round(secs * 1000)
  }
  const n = Number(s)
  if (Number.isNaN(n) || n < 0) return null
  return unit === 'distance' ? Math.round(n * 100) : n
}

/** A result for display: 1:02,35 · 5,23 m · 287 pkt · 72. */
export function formatValue(v: number | null | undefined, unit: Measure['unit']): string {
  if (v === null || v === undefined) return ''
  if (unit === 'time') {
    const cs = Math.round(v / 10)
    const h = Math.floor(cs / 360000)
    const m = Math.floor(cs / 6000) % 60
    const sec = Math.floor(cs / 100) % 60
    const frac = String(cs % 100).padStart(2, '0')
    const ss = h || m ? String(sec).padStart(2, '0') : String(sec)
    return `${h ? `${h}:${String(m).padStart(2, '0')}:` : m ? `${m}:` : ''}${ss},${frac}`
  }
  if (unit === 'distance') return `${(v / 100).toFixed(2).replace('.', ',')} m`
  return String(v).replace('.', ',')
}

/** The text a result is typed as again (for editing). */
export function editValue(v: number | null | undefined, unit: Measure['unit']): string {
  if (v === null || v === undefined) return ''
  return unit === 'distance' ? (v / 100).toFixed(2).replace('.', ',') : formatValue(v, unit)
}

export interface PerfRow {
  teamId: string
  perf?: Perf
  /** The result that counts: the best attempt, or the sum. */
  value: number | null
  place: number
  /** Heats: through to the final by place in the heat (Q) or by result (q). */
  qual?: 'Q' | 'q'
}

const MARK_ORDER = { DNF: 1, DQ: 2, DNS: 3 }

/** The results of one heat or round, the best first; DNF, DQ and DNS at the end; exact ties share the place. */
export function rankGroup(t: Pick<Tournament, 'rules' | 'perf'>, group: Group): PerfRow[] {
  const m = measureOf(t)
  const better = (x: number, y: number) => (m.lowerIsBetter ? x - y : y - x)
  const rows = group.teamIds.map((teamId) => {
    const perf = t.perf?.[group.id]?.[teamId]
    const vals = (perf?.v ?? []).filter((x): x is number => typeof x === 'number')
    const value = perf?.mark || !vals.length ? null
      : m.aggregate === 'sum' ? vals.reduce((a, b) => a + b, 0)
        : vals.reduce((a, b) => (better(a, b) <= 0 ? a : b))
    // Tie-break: the next best attempts, in order.
    const rest = [...vals].sort(better)
    return { teamId, perf, value, place: 0, rest }
  })
  const cmp = (a: typeof rows[number], b: typeof rows[number]) => {
    const ma = a.perf?.mark ? MARK_ORDER[a.perf.mark] : 0
    const mb = b.perf?.mark ? MARK_ORDER[b.perf.mark] : 0
    if (ma !== mb) return ma - mb
    if (a.value === null || b.value === null) return (a.value === null ? 1 : 0) - (b.value === null ? 1 : 0)
    if (a.value !== b.value) return better(a.value, b.value)
    if (m.aggregate === 'best') {
      for (let i = 1; i < Math.max(a.rest.length, b.rest.length); i++) {
        const x = a.rest[i]
        const y = b.rest[i]
        if (x === undefined || y === undefined) return (x === undefined ? 1 : 0) - (y === undefined ? 1 : 0)
        if (x !== y) return better(x, y)
      }
    }
    return 0
  }
  const sorted = [...rows].sort(cmp)
  sorted.forEach((r, i) => { r.place = i > 0 && cmp(sorted[i - 1], r) === 0 && r.value !== null ? sorted[i - 1].place : i + 1 })
  return sorted.map(({ rest: _rest, ...r }) => r)
}

export function finalId(categoryId: string): string {
  return `${categoryId}fin`
}

/** Heats (or rounds) of a category, without the final. */
export function heatsOf(state: State, categoryId: string): Group[] {
  return state.groups.filter((g) => g.categoryId === categoryId && g.id !== finalId(categoryId))
}

/** Heats: who goes to the final – the first Q of each heat, then the q best results of the rest. */
export function qualifiers(state: State, categoryId: string): Map<string, 'Q' | 'q'> {
  const cfg = state.tournament.measured
  const out = new Map<string, 'Q' | 'q'>()
  const heats = heatsOf(state, categoryId)
  const Q = cfg?.Q ?? 0
  const q = cfg?.q ?? 0
  const others: PerfRow[] = []
  for (const h of heats) {
    for (const r of rankGroup(state.tournament, h)) {
      if (r.value === null) continue
      if (r.place <= Q) out.set(r.teamId, 'Q')
      else others.push(r)
    }
  }
  const m = measureOf(state.tournament)
  others.sort((a, b) => (m.lowerIsBetter ? a.value! - b.value! : b.value! - a.value!))
  others.slice(0, q).forEach((r) => out.set(r.teamId, 'q'))
  return out
}

/** Whether every participant of every heat has a result or a mark. */
export function heatsDone(state: State, categoryId: string): boolean {
  const heats = heatsOf(state, categoryId)
  return heats.length > 0 && heats.every((h) => h.teamIds.every((id) => {
    const p = state.tournament.perf?.[h.id]?.[id]
    return !!p && (!!p.mark || p.v.some((x) => typeof x === 'number'))
  }))
}

/** The tournament with the category's final: those through from the heats, the fastest (best) last in the list. */
export function makeFinal(state: State, categoryId: string): State {
  const through = qualifiers(state, categoryId)
  const group: Group = { id: finalId(categoryId), categoryId, name: t('Finał'), teamIds: [...through.keys()] }
  return { ...state, groups: [...state.groups.filter((g) => g.id !== group.id), group] }
}

/** Points for a place in a round: F1 style, n…1, or low (the place itself). */
export function placePoints(kind: 'f1' | 'linear' | 'low', place: number, field: number): number {
  if (kind === 'low') return place
  if (kind === 'linear') return Math.max(0, field - place + 1)
  return [25, 18, 15, 12, 10, 8, 6, 4, 2, 1][place - 1] ?? 0
}

export interface SeriesRow {
  teamId: string
  /** Points per round (null: no result there). */
  rounds: (number | null)[]
  /** Rounds dropped (their indexes). */
  dropped: number[]
  total: number
  place: number
}

/**
 * Rounds: the points for places added up, the worst `drop` rounds left out. Low points:
 * the fewest win, and a round without a result counts as last place + 1.
 */
export function seriesStandings(state: State, categoryId: string): SeriesRow[] {
  const cfg = state.tournament.measured
  const kind = cfg?.points ?? 'f1'
  const rounds = heatsOf(state, categoryId)
  const teams = state.teams.filter((x) => x.categoryId === categoryId).map((x) => x.id)
  const low = kind === 'low'
  const rows = teams.map((teamId) => {
    const pts = rounds.map((g) => {
      const r = rankGroup(state.tournament, g).find((x) => x.teamId === teamId)
      if (!r || r.value === null) return low && r?.perf ? g.teamIds.length + 1 : null
      return placePoints(kind, r.place, g.teamIds.length)
    })
    const played = rounds.map((g, i) => ({ i, v: pts[i] ?? (low ? g.teamIds.length + 1 : 0) }))
    // The worst rounds: the most points in low scoring, the fewest otherwise.
    const worst = [...played].sort((a, b) => (low ? b.v - a.v : a.v - b.v)).slice(0, Math.min(cfg?.drop ?? 0, Math.max(0, played.length - 1)))
    const dropped = worst.map((x) => x.i)
    const total = played.filter((x) => !dropped.includes(x.i)).reduce((s, x) => s + x.v, 0)
    return { teamId, rounds: pts, dropped, total, place: 0 }
  })
  rows.sort((a, b) => (low ? a.total - b.total : b.total - a.total))
  rows.forEach((r, i) => { r.place = i > 0 && rows[i - 1].total === r.total ? rows[i - 1].place : i + 1 })
  return rows
}

/** Final places of a category: the final, then the others by their heat results; or the series table. */
export function measuredPlaces(state: State, categoryId: string): { place: number; teamId: string }[] {
  if (state.tournament.measured?.mode === 'rounds') return seriesStandings(state, categoryId).map((r) => ({ place: r.place, teamId: r.teamId }))
  const final = state.groups.find((g) => g.id === finalId(categoryId))
  const out: { place: number; teamId: string }[] = []
  if (final) rankGroup(state.tournament, final).forEach((r) => out.push({ place: r.place, teamId: r.teamId }))
  const m = measureOf(state.tournament)
  const rest = heatsOf(state, categoryId).flatMap((h) => rankGroup(state.tournament, h)).filter((r) => !out.some((x) => x.teamId === r.teamId))
  rest.sort((a, b) => {
    const ma = a.perf?.mark ? MARK_ORDER[a.perf.mark] : 0
    const mb = b.perf?.mark ? MARK_ORDER[b.perf.mark] : 0
    if (ma !== mb) return ma - mb
    if (a.value === null || b.value === null) return (a.value === null ? 1 : 0) - (b.value === null ? 1 : 0)
    return m.lowerIsBetter ? a.value - b.value : b.value - a.value
  })
  const before = out.length
  let place = before
  rest.forEach((r, i) => {
    const prev = rest[i - 1]
    place = prev && prev.value !== null && prev.value === r.value && !r.perf?.mark && !prev.perf?.mark ? place : before + i + 1
    out.push({ place, teamId: r.teamId })
  })
  return out
}

/**
 * The draw of a measured category: `count` heats of (nearly) equal size, or `count` rounds
 * with everybody (mode 'rounds'). Earlier results of the category are cleared.
 */
export function drawMeasured(state: State, categoryId: string, teams: Team[], count: number, rand: () => number = Math.random): State {
  const mode = state.tournament.measured?.mode ?? 'heats'
  const ids = teams.map((x) => x.id)
  let groups: Group[]
  if (mode === 'rounds') {
    groups = Array.from({ length: Math.max(1, count) }, (_, i) => ({ id: `${categoryId}r${i + 1}`, categoryId, name: t('Runda {n}', { n: i + 1 }), teamIds: [...ids] }))
  } else {
    const n = Math.max(1, Math.min(count, ids.length))
    const mixed = shuffle(ids, rand)
    groups = Array.from({ length: n }, (_, i) => ({ id: `${categoryId}h${i + 1}`, categoryId, name: t('Seria {n}', { n: i + 1 }), teamIds: mixed.filter((_, k) => k % n === i) }))
  }
  const perf = { ...(state.tournament.perf ?? {}) }
  for (const g of state.groups.filter((x) => x.categoryId === categoryId)) delete perf[g.id]
  return {
    ...state,
    groups: [...state.groups.filter((g) => g.categoryId !== categoryId), ...groups],
    matches: state.matches.filter((m) => m.categoryId !== categoryId),
    tournament: { ...state.tournament, perf },
  }
}

/** Rounds: one more round with everybody. */
export function addRound(state: State, categoryId: string): State {
  const rounds = heatsOf(state, categoryId)
  const ids = state.teams.filter((x) => x.categoryId === categoryId).map((x) => x.id)
  const n = rounds.length + 1
  const group: Group = { id: `${categoryId}r${n}`, categoryId, name: t('Runda {n}', { n }), teamIds: ids }
  return { ...state, groups: [...state.groups, group] }
}

/** The perf map with one participant's result changed. */
export function withPerf(t: Pick<Tournament, 'perf'>, groupId: string, teamId: string, perf: Perf | null): Record<string, Record<string, Perf>> {
  const all = { ...(t.perf ?? {}) }
  const g = { ...(all[groupId] ?? {}) }
  if (perf) g[teamId] = perf
  else delete g[teamId]
  all[groupId] = g
  return all
}
