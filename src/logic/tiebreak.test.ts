import { describe, expect, it } from 'vitest'
import { standings, tiebreakOrder } from './scoring'
import { sportById, sportRules } from './sports'
import type { Group, Match, Rules } from '../types'

const teams = ['A', 'B', 'C', 'D'].map((n) => ({ id: n, name: n, categoryId: 'k' }))
const group: Group = { id: 'g', categoryId: 'k', name: 'G', teamIds: ['A', 'B', 'C', 'D'] }
let n = 0
const m = (a: string, b: string, x: number, y: number): Match => ({
  id: `m${++n}`, categoryId: 'k', groupId: 'g', court: 1, start: '', teamA: a, teamB: b, sets: [{ a: x, b: y }], status: 'finished', updatedAt: 0,
})
const football = sportRules(sportById('pilka-nozna'))
const order = (rules: Rules, matches: Match[]) => standings(rules, group, matches, teams).map((r) => r.teamId).join('')

describe('tie-breakers', () => {
  it('football: head-to-head before goal difference', () => {
    expect(tiebreakOrder(football)).toEqual(['h2h', 'diff', 'scored'])
    // A and B both 6 points; B beat A, A has the better goal difference.
    const ms = [m('A', 'B', 0, 1), m('A', 'C', 9, 0), m('A', 'D', 5, 0), m('B', 'C', 1, 0), m('B', 'D', 0, 1), m('C', 'D', 0, 0)]
    expect(order(football, ms).slice(0, 2)).toBe('BA')
    // The same with goal difference first: A wins.
    expect(order({ ...football, tiebreak: ['diff', 'scored', 'h2h'] }, ms).slice(0, 2)).toBe('AB')
  })

  it('three level teams: the small table of their own matches decides', () => {
    // A, B, C each beat one of the others and all beat D; among them goals decide: C +2, B 0, A −2.
    const ms = [m('A', 'B', 2, 1), m('B', 'C', 1, 0), m('C', 'A', 4, 1), m('A', 'D', 1, 0), m('B', 'D', 1, 0), m('C', 'D', 1, 0)]
    expect(order(football, ms)).toBe('CBAD')
  })

  it('old tournaments without a set order keep the usual one', () => {
    const { tiebreak: _, ...plain } = football
    void _
    expect(tiebreakOrder(plain)).toEqual(['diff', 'scored', 'h2h'])
  })
})
