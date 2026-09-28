import type { Match, State } from '../types'
import { courtBoard } from './courtBoard'
import { sourceLabel } from './knockout'
import { isScore, setWinner } from './scoring'

/**
 * A court's scoreboard for outside apps (the SportCast camera app draws it on the video).
 * Kept in the Realtime Database at board/{tournament}/{court}, readable by anyone, written
 * by the phones that score that court. Everything an overlay needs is in this one small
 * entry, so an app follows a single address. Described for app authors in docs/SPORTCAST.md.
 */
export interface PublicBoard {
  /** Format version. */
  v: 1
  /** When the board was written (ms since 1970). */
  at: number
  tournament: string
  /** The court's name ("A", "1"…). */
  court: string
  /** live: being played · finished: result of the last match · next: coming up · none: nothing left */
  status: 'live' | 'finished' | 'next' | 'none'
  /** Group or knockout round, and category ("Grupa A · Chłopcy U14"). */
  stage: string
  /** Team names, or where a knockout team will come from. Empty with status "none". */
  a: string
  b: string
  /** Every set played, the last one being the set in progress while live. */
  sets: { a: number; b: number }[]
  /** Sets won (only sets with a winner count). */
  setsA: number
  setsB: number
  /** Points of the last set (the set in progress while live); goals in one-score sports. */
  pointsA: number
  pointsB: number
  /** 'sets' (volleyball…) or 'score' (one score: football, handball…). */
  scoring: 'sets' | 'score'
  /** Sets to win the match (best of 3 → 2); the number of sets when all are always played. */
  setsToWin: number
  /** Points to win a set, and the deciding set. */
  setPoints: number
  lastSetPoints: number
  /** Scheduled start of the match shown (ISO local time, "2026-10-23T09:40"). */
  start: string
  /** The match after it on this court, when known. */
  next?: { a: string; b: string; start: string }
  /** With status "next": the court's last result, for a moment on screen after the match. */
  previous?: { a: string; b: string; setsA: number; setsB: number; sets: { a: number; b: number }[] }
}

const setsWon = (state: State, sets: { a: number; b: number }[]) => {
  let a = 0
  let b = 0
  sets.forEach((s, i) => {
    const w = setWinner(state.tournament.rules, i, s)
    if (w === 'a') a++
    if (w === 'b') b++
  })
  return { a, b }
}

const name = (state: State, m: Match, side: 'a' | 'b') => {
  const id = side === 'a' ? m.teamA : m.teamB
  if (id) return state.teams.find((t) => t.id === id)?.name ?? ''
  return m.ko ? sourceLabel(state, side === 'a' ? m.ko.srcA : m.ko.srcB) : ''
}

export function publicBoard(state: State, court: number, now: number): PublicBoard {
  const tour = state.tournament
  const rules = tour.rules
  const view = courtBoard(state, court, now)
  const m = view.match
  // The overlay follows the referee: a match is live once started, not at its planned time.
  const status: PublicBoard['status'] = !m ? 'none' : m.status === 'live' ? 'live' : m.status === 'finished' ? 'finished' : 'next'
  const sets = m && status !== 'next' ? m.sets.map((s) => ({ a: s.a, b: s.b })) : []
  const won = setsWon(state, sets)
  const last = sets[sets.length - 1]
  const next = view.next
  const stage = m ? [m.ko?.label ?? state.groups.find((g) => g.id === m.groupId)?.name, state.categories.find((c) => c.id === m.categoryId)?.name]
    .filter(Boolean).join(' · ') : ''
  const board: PublicBoard = {
    v: 1,
    at: now,
    tournament: tour.name,
    court: tour.courtNames?.[court - 1] ?? String(court),
    status,
    stage,
    a: m ? name(state, m, 'a') : '',
    b: m ? name(state, m, 'b') : '',
    sets,
    setsA: won.a,
    setsB: won.b,
    pointsA: last?.a ?? 0,
    pointsB: last?.b ?? 0,
    scoring: isScore(rules) ? 'score' : 'sets',
    setsToWin: rules.setsMode === 'bestOf' ? Math.floor(rules.sets / 2) + 1 : rules.sets,
    setPoints: rules.setPoints,
    lastSetPoints: rules.lastSetPoints,
    start: m?.start ?? '',
  }
  if (next) board.next = { a: name(state, next, 'a'), b: name(state, next, 'b'), start: next.start }
  const prev = view.previous
  if (status === 'next' && prev) {
    const w = setsWon(state, prev.sets)
    board.previous = { a: name(state, prev, 'a'), b: name(state, prev, 'b'), setsA: w.a, setsB: w.b, sets: prev.sets.map((x) => ({ a: x.a, b: x.b })) }
  }
  return board
}

/** The board without its time, to skip writes that would change nothing. */
export function boardKey(b: PublicBoard): string {
  return JSON.stringify({ ...b, at: 0 })
}
