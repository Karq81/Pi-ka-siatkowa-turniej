import { describe, expect, it } from 'vitest'
import { matchTablePoints, rulesTablePoints, standings } from './scoring'
import { sportById, sportRules } from './sports'
import type { Group, Match, Team } from '../types'

/* Table points typed by hand: for a match, and a team's penalty or bonus. */

const rules = sportRules(sportById('pilka-nozna'), 'remis')
const group: Group = { id: 'g', categoryId: 'k', name: 'G', teamIds: ['A', 'B', 'C'] }
const teams: Team[] = ['A', 'B', 'C'].map((n) => ({ id: n, name: n, categoryId: 'k' }))
const m = (a: string, b: string, x: number, y: number, extra: Partial<Match> = {}): Match => ({
  id: `${a}${b}`, categoryId: 'k', groupId: 'g', court: 1, start: '', teamA: a, teamB: b, sets: [{ a: x, b: y }], status: 'finished', updatedAt: 0, ...extra,
})

describe('points by hand', () => {
  it('a match\'s own points win over the rules (and the rules\' stay known)', () => {
    const match = m('A', 'B', 2, 1, { manualPoints: [1, 1] })
    expect(matchTablePoints(rules, match)).toEqual([1, 1])
    expect(rulesTablePoints(rules, match)).toEqual([3, 0])
    const table = standings(rules, group, [match], teams)
    expect(table.find((r) => r.teamId === 'A')!.tablePoints).toBe(1)
    expect(table.find((r) => r.teamId === 'B')!.tablePoints).toBe(1)
  })

  it('a penalty or bonus changes the team\'s total and its place', () => {
    const ms = [m('A', 'B', 1, 0), m('B', 'C', 1, 0), m('C', 'A', 0, 0)]
    expect(standings(rules, group, ms, teams)[0].teamId).toBe('A')
    const punished = teams.map((x) => (x.id === 'A' ? { ...x, adjust: { points: -3, reason: 'walkower' } } : x))
    const table = standings(rules, group, ms, punished)
    expect(table.find((r) => r.teamId === 'A')!.tablePoints).toBe(1)
    expect(table[0].teamId).toBe('B')
  })
})

describe('fair play', () => {
  it('cards count yellow 1, second yellow 3, red 4; the fewer, the higher', () => {
    const ms = [
      m('A', 'B', 1, 1, { cards: [{ side: 'a', kind: 'R' }, { side: 'b', kind: 'Y' }] }),
      m('A', 'C', 1, 0), m('B', 'C', 1, 0),
      m('C', 'A', 1, 0, { cards: [{ side: 'b', kind: 'YR', player: 'Kowalski', minute: 70 }] }),
    ]
    const two = { id: 'g', categoryId: 'k', name: 'G', teamIds: ['A', 'B'] }
    // A and B level on everything else (1:1, one win each against C); B had fewer cards.
    const rules2 = { ...rules, tiebreak: ['fair_play' as const] }
    const table = standings(rules2, group, ms, teams)
    expect(table.map((r) => r.teamId).slice(0, 2)).toEqual(['B', 'A'])
    void two
  })
})
