import { describe, expect, it } from 'vitest'
import { blankState } from './newTournament'
import { challengeProblem, kingNext, kingTable, ladderChallenge, ladderOrder, membersOf, nextPadelRound, padelTable, startRecreational } from './recreational'
import type { Match, State } from '../types'

/* Spec 2.9: Americano, Mexicano, ladder, king of the court. */

const eight = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']
function make(system: 'americano' | 'mexicano' | 'king' | 'ladder', names = eight): State {
  const s = blankState({ name: 'T', start: '2027-05-08T09:00', courts: 2, slotMinutes: 20, dayEnd: '23:00', categories: ['Open'], sport: 'padel', format: '1set', system, preset: [{ category: 'Open', teams: names, groups: [] }] })
  return startRecreational(s, 'k1', s.teams.map((x) => x.id))
}
const nm = (s: State, id: string) => s.teams.find((x) => x.id === id)!.name
const idx = (s: State, id: string) => Number(nm(s, id).slice(1))
/** Plays every open match: the side with the better (lower) best player wins 6:x. */
function playOpen(s: State): State {
  return {
    ...s,
    matches: s.matches.map((m): Match => {
      if (m.status === 'finished') return m
      const best = (side: string) => Math.min(...membersOf(side).map((x) => idx(s, x)))
      const aWins = best(m.teamA) < best(m.teamB)
      return { ...m, status: 'finished', sets: [aWins ? { a: 6, b: 3 } : { a: 3, b: 6 }] }
    }),
  }
}

describe('Americano', () => {
  it('8 players on 2 courts: everyone plays each round, no partner twice in 7 rounds', () => {
    let s = make('americano')
    for (let r = 2; r <= 7; r++) { s = playOpen(s); s = { ...s, matches: [...s.matches, ...nextPadelRound(s, 'k1')] } }
    const pairs = s.matches.flatMap((m) => [m.teamA, m.teamB])
    expect(s.matches).toHaveLength(14)
    expect(new Set(pairs).size).toBe(28)
    for (let r = 1; r <= 7; r++) {
      const players = s.matches.filter((m) => m.swissRound === r).flatMap((m) => [...membersOf(m.teamA), ...membersOf(m.teamB)])
      expect(new Set(players).size).toBe(8)
    }
  })

  it('points: each player gets their pair\'s points; with 5 players one sits out, in turn', () => {
    let s = make('americano', ['P1', 'P2', 'P3', 'P4', 'P5'])
    for (let r = 2; r <= 5; r++) { s = playOpen(s); s = { ...s, matches: [...s.matches, ...nextPadelRound(s, 'k1')] } }
    s = playOpen(s)
    const table = padelTable(s, 'k1')
    expect(table.every((r) => r.played === 4)).toBe(true)
    expect(table.reduce((sum, r) => sum + r.points, 0)).toBe(5 * 2 * (6 + 3))
  })
})

describe('Mexicano', () => {
  it('round 2: 1st + 4th against 2nd + 3rd of the table', () => {
    let s = make('mexicano')
    s = playOpen(s)
    const table = padelTable(s, 'k1').map((r) => r.teamId)
    const next = nextPadelRound(s, 'k1')
    const [a, b] = [next[0].teamA, next[0].teamB].map((x) => membersOf(x).sort())
    expect(a).toEqual([table[0], table[3]].sort())
    expect(b).toEqual([table[1], table[2]].sort())
  })
})

describe('King of the court', () => {
  it('the winner stays on, the loser goes to the back of the queue', () => {
    let s = make('king', ['K1', 'K2', 'K3', 'K4'])
    const first = s.matches[0]
    for (let i = 0; i < 5; i++) {
      s = { ...s, matches: s.matches.map((m) => (m.status === 'finished' ? m : { ...m, status: 'finished' as const, sets: [nm(s, m.teamA) < nm(s, m.teamB) ? { a: 6, b: 2 } : { a: 2, b: 6 }] })) }
      const m = kingNext(s, 'k1')
      if (m) s = { ...s, matches: [...s.matches, m] }
    }
    const k1 = s.teams.find((x) => x.name === 'K1')!.id
    // K1 plays in the first match or after the first loss, then never leaves.
    expect([first.teamA, first.teamB]).toContain(s.matches[0].teamA)
    const table = kingTable(s, 'k1')
    expect(table[0].teamId).toBe(k1)
    expect(table[0].king).toBe(true)
    expect(kingNext(s, 'k1')).toBeNull()
  })
})

describe('Ladder', () => {
  it('a challenger up to 3 places higher takes the place by winning', () => {
    let s = make('ladder', ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'])
    const id = (n: string) => s.teams.find((x) => x.name === n)!.id
    expect(challengeProblem(s, 'k1', id('L6'), id('L2'))).not.toBe('')
    expect(challengeProblem(s, 'k1', id('L5'), id('L2'))).toBe('')
    const m = { ...ladderChallenge(s, 'k1', id('L5'), id('L2')), status: 'finished' as const, sets: [{ a: 6, b: 4 }] }
    s = { ...s, matches: [...s.matches, m] }
    expect(ladderOrder(s, 'k1').map((x) => nm(s, x))).toEqual(['L1', 'L5', 'L2', 'L3', 'L4', 'L6'])
  })
})
