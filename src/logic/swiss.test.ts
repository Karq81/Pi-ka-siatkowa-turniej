import { describe, expect, it } from 'vitest'
import { rng } from './draw'
import { sportById, sportRules } from './sports'
import { currentSwissRound, pairNextRound, startSwiss, swissGroup, swissOpen } from './swiss'
import { standings } from './scoring'
import type { State } from '../types'

function chess(n: number): State {
  const teams = Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `Gracz ${i + 1}`, categoryId: 'k' }))
  return {
    tournament: { name: 'Szachy', subtitle: '', courts: 10, rules: sportRules(sportById('szachy')), system: 'swiss', swissRounds: 5, start: '2027-01-16T09:00', slotMinutes: 30, dayEnd: '20:00' },
    categories: [{ id: 'k', name: 'Open' }], groups: [], teams, matches: [],
  }
}

/** Plays the open games of the round: the lower number wins, or a draw by chance. */
function playRound(s: State, rand: () => number): State {
  const r = currentSwissRound(s, 'k')
  return {
    ...s,
    matches: s.matches.map((m) => {
      if (m.swissRound !== r || m.status === 'finished') return m
      const x = rand()
      const aBetter = Number(m.teamA.slice(1)) < Number(m.teamB.slice(1))
      const a = x < 0.2 ? 0.5 : (x < 0.8) === aBetter ? 1 : 0
      return { ...m, status: 'finished' as const, sets: [{ a, b: 1 - a }], chess: undefined }
    }),
  }
}

describe('Swiss system', () => {
  it('9 players, 5 rounds: no rematch, one bye each at most, everyone plays every round', () => {
    const rand = rng(11)
    let s = startSwiss(chess(9), 'k', chess(9).teams.map((t) => t.id))
    s = { ...s, teams: chess(9).teams }
    expect(s.tournament.rules.tiebreak?.[0]).toBe('buchholz_cut1')
    expect(swissOpen(s, 'k')).toHaveLength(4)
    for (let r = 1; r <= 5; r++) {
      if (r > 1) s = { ...s, matches: [...s.matches, ...pairNextRound(s, 'k')] }
      expect(currentSwissRound(s, 'k')).toBe(r)
      const round = s.matches.filter((m) => m.swissRound === r)
      const players = round.flatMap((m) => [m.teamA, m.teamB]).filter(Boolean)
      expect(new Set(players).size).toBe(9)
      expect(round.filter((m) => m.bye)).toHaveLength(1)
      s = playRound(s, rand)
    }
    const games = s.matches.filter((m) => !m.bye).map((m) => [m.teamA, m.teamB].sort().join('|'))
    expect(new Set(games).size).toBe(games.length)
    const byes = s.matches.filter((m) => m.bye).map((m) => m.teamA)
    expect(new Set(byes).size).toBe(byes.length)
    const table = standings(s.tournament.rules, swissGroup(s, 'k')!, s.matches, s.teams)
    expect(table).toHaveLength(9)
    expect(table.reduce((n, r) => n + r.played, 0)).toBe(5 * 9)
  })

  it('pairs players with the same score', () => {
    let s = startSwiss(chess(8), 'k', chess(8).teams.map((t) => t.id))
    s = { ...s, teams: chess(8).teams, matches: s.matches.map((m) => ({ ...m, status: 'finished' as const, sets: [{ a: 1, b: 0 }] })) }
    const next = pairNextRound(s, 'k')
    const winners = new Set(s.matches.map((m) => m.teamA))
    // Round 2: winners meet winners, losers meet losers.
    for (const m of next) expect(winners.has(m.teamA)).toBe(winners.has(m.teamB))
  })
})
