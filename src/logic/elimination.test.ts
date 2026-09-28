import { describe, expect, it } from 'vitest'
import { rng } from './draw'
import { createElimination, eliminationPlaces, eliminationPlan, seedOrder } from './elimination'
import { applyMatchUpdate } from './knockout'
import { tally } from './scoring'
import type { Match, State } from '../types'

const rules = { setsMode: 'fixed' as const, sets: 1, setPoints: 0, lastSetPoints: 0, winBy: 1, pointsWin: 1, pointsDraw: 0, pointsLoss: 0, scoring: 'score' as const, draws: false }

function tournament(n: number, system: 'knockout' | 'double', thirdPlace = false): State {
  const teams = Array.from({ length: n }, (_, i) => ({ id: `t${i + 1}`, name: `Zawodnik ${i + 1}`, categoryId: 'k1' }))
  const base: State = {
    tournament: { name: 'T', subtitle: '', courts: 3, rules, system, thirdPlace, start: '2026-10-10T09:00', slotMinutes: 10 },
    categories: [{ id: 'k1', name: 'Open' }], groups: [], teams, matches: [],
  }
  const matches = createElimination(base, 'k1', teams.map((t) => t.id), { start: '2026-10-10T09:00', slotMinutes: 10, courts: [1, 2, 3] })
  return { ...base, matches }
}

/** Plays every match that has both players, with a random winner, until nothing is left. */
function playAll(state: State, rand: () => number, lbWinsFinal = false): State {
  for (let guard = 0; guard < 500; guard++) {
    const m = state.matches
      .filter((x) => x.status === 'scheduled' && x.teamA && x.teamB)
      .sort((a, b) => a.start.localeCompare(b.start))[0]
    if (!m) return state
    const aWins = m.ko?.bracket === 'F' && m.ko.place === 1 && !m.ko.resetOf ? !lbWinsFinal : rand() < 0.5
    const changed = applyMatchUpdate(state, m.id, (x) => ({ ...x, status: 'finished', sets: [aWins ? { a: 1, b: 0 } : { a: 0, b: 1 }] }))
    const byId = new Map(changed.map((c) => [c.id, c]))
    state = { ...state, matches: state.matches.map((x) => byId.get(x.id) ?? x) }
  }
  throw new Error('never ends')
}

const winner = (s: State) => (m: Match) => { const t = tally(s.tournament.rules, m.sets); return t.setsA > t.setsB ? m.teamA : t.setsB > t.setsA ? m.teamB : '' }

function losses(s: State): Map<string, number> {
  const out = new Map<string, number>()
  for (const m of s.matches) {
    if (m.status !== 'finished' || m.skipped) continue
    const w = winner(s)(m)
    const l = w === m.teamA ? m.teamB : m.teamA
    out.set(l, (out.get(l) ?? 0) + 1)
  }
  return out
}

describe('elimination brackets', () => {
  it('orders the draw so the top seeds meet last', () => {
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6])
  })

  it('single elimination: n − 1 matches, byes instead of an odd round, 3rd place', () => {
    for (const n of [2, 3, 5, 8, 13, 17]) {
      const plan = eliminationPlan('k1', Array.from({ length: n }, (_, i) => `t${i}`), false, true)
      expect(plan.length).toBe(n - 1 + (n >= 4 ? 1 : 0))
    }
    // 17: one preliminary match, then the round of 16.
    const s = tournament(17, 'knockout')
    expect(s.matches.filter((m) => m.ko!.col === 1)).toHaveLength(1)
    expect(s.matches.filter((m) => m.ko!.col === 2)).toHaveLength(8)
    expect(s.matches.filter((m) => m.ko!.col === 2 && m.teamA && m.teamB)).toHaveLength(7)
    const done = playAll(s, rng(3))
    expect(done.matches.every((m) => m.status === 'finished')).toBe(true)
    const l = losses(done)
    expect([...l.values()].every((x) => x === 1)).toBe(true)
    expect(l.size).toBe(16)
  })

  it('double elimination for 17: out after the second loss, 2n − 2 matches (+ the rematch)', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = tournament(17, 'double')
      expect(s.matches).toHaveLength(33)
      const done = playAll(s, rng(seed))
      const played = done.matches.filter((m) => !m.skipped)
      expect(done.matches.every((m) => m.status === 'finished')).toBe(true)
      const l = losses(done)
      // Everybody but the champion lost twice; the champion lost at most once.
      const places = eliminationPlaces(done, 'k1', winner(done))
      const champ = places.find((p) => p.place === 1)!.teamId
      for (const t of done.teams) expect(l.get(t.id) ?? 0).toBe(t.id === champ ? (l.get(champ) ?? 0) : 2)
      expect(l.get(champ) ?? 0).toBeLessThanOrEqual(1)
      expect([32, 33]).toContain(played.length)
      expect(places.map((p) => p.place)).toEqual([1, 2, 3])
      // In the timetable no match is ever before one it waits for.
      for (const m of s.matches) {
        for (const src of [m.ko!.srcA, m.ko!.srcB]) {
          if (src.kind !== 'match') continue
          const before = s.matches.find((x) => x.id === src.matchId)!
          expect(before.start < m.start).toBe(true)
        }
      }
    }
  })

  it('grand final: the rematch only when the losers\' bracket winner wins the first', () => {
    const clear = playAll(tournament(8, 'double'), rng(7), false)
    expect(clear.matches.find((m) => m.ko!.resetOf)!.skipped).toBe(true)
    const reset = playAll(tournament(8, 'double'), rng(7), true)
    const second = reset.matches.find((m) => m.ko!.resetOf)!
    expect(second.skipped).toBeFalsy()
    expect(second.status).toBe('finished')
    expect(second.teamA && second.teamB).toBeTruthy()
  })
})
