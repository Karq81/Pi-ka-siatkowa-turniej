import { describe, expect, it } from 'vitest'
import { matchTablePoints, standings } from './scoring'
import { roundRobin } from './schedule'
import { sportById, sportRules, SPORTS } from './sports'
import { criteriaToTiebreaks, PROFILES, profileOf } from './profiles'
import type { Group, Match, Rules, Team } from '../types'

/* Acceptance tests of docs/specyfikacja-turnieje.md (part 9) and the rules profiles. */

const teamsOf = (ids: string[]): Team[] => ids.map((n) => ({ id: n, name: n, categoryId: 'k' }))
const groupOf = (ids: string[]): Group => ({ id: 'g', categoryId: 'k', name: 'G', teamIds: ids })
let n = 0
const m = (a: string, b: string, x: number, y: number, extra: Partial<Match> = {}): Match => ({
  id: `m${++n}`, categoryId: 'k', groupId: 'g', court: 1, start: '', teamA: a, teamB: b, sets: [{ a: x, b: y }], status: 'finished', updatedAt: 0, ...extra,
})
const table = (rules: Rules, ids: string[], ms: Match[]) => standings(rules, groupOf(ids), ms, teamsOf(ids))
const order = (rules: Rules, ids: string[], ms: Match[]) => table(rules, ids, ms).map((r) => r.teamId).join('')
const football = sportRules(sportById('pilka-nozna'))

describe('rules profiles (JSON)', () => {
  it('every discipline has its profile, and its table points come from it', () => {
    for (const s of SPORTS) {
      const p = profileOf(s.id)
      expect(p, s.id).toBeDefined()
      expect(s.table).toEqual([p!.points.win, p!.points.draw, p!.points.loss])
    }
    expect(Object.keys(PROFILES).length).toBe(SPORTS.length)
  })

  it('criteria named as in the specification become table tie-breakers', () => {
    expect(criteriaToTiebreaks(['points', 'ratio_sets', 'ratio_points', 'h2h_points', 'fair_play', 'lots']))
      .toEqual(['setRatio', 'pointRatio', 'h2h_points', 'lots'])
  })

  it('a tournament gets its discipline profile in its rules', () => {
    const hockey = sportRules(sportById('hokej'))
    expect(hockey.pointsOvertimeWin).toBe(2)
    expect(hockey.pointsOvertimeLoss).toBe(1)
    expect(sportRules(sportById('koszykowka')).pointsWalkoverLoss).toBe(0)
    expect(sportRules(sportById('szachy')).tiebreak).toContain('sonneborn_berger')
  })
})

describe('9.1 round robin (Berger tables)', () => {
  it('5 teams: 5 rounds, each team rests exactly once, 10 matches', () => {
    const rounds = roundRobin(['1', '2', '3', '4', '5'])
    expect(rounds.length).toBe(5)
    expect(rounds.flat().length).toBe(10)
    for (const id of ['1', '2', '3', '4', '5']) {
      expect(rounds.filter((r) => !r.some((p) => p.includes(id))).length).toBe(1)
    }
  })

  it('every pair meets once, and nobody is at home three times in a row', () => {
    for (const size of [4, 6, 8, 10, 12]) {
      const ids = Array.from({ length: size }, (_, i) => `t${i + 1}`)
      const rounds = roundRobin(ids)
      expect(rounds.length).toBe(size - 1)
      const pairs = new Set(rounds.flat().map((p) => [...p].sort().join('|')))
      expect(pairs.size).toBe((size * (size - 1)) / 2)
      for (const id of ids) {
        const venues = rounds.map((r) => (r.find((p) => p[0] === id) ? 'H' : 'A')).join('')
        expect(venues, `${size}: ${id}`).not.toMatch(/HHH|AAA/)
        // Home and away shared out evenly.
        const home = venues.split('H').length - 1
        expect(Math.abs(home - (size - 1 - home)), `${size}: ${id} ${venues}`).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('9.3 head-to-head that does not decide', () => {
  it('A>B, B>C, C>A with equal points: the goal difference decides', () => {
    const ms = [m('A', 'B', 1, 0), m('B', 'C', 1, 0), m('C', 'A', 1, 0), m('A', 'D', 5, 0), m('B', 'D', 3, 0), m('C', 'D', 1, 0)]
    expect(order(football, ['A', 'B', 'C', 'D'], ms)).toBe('ABCD')
  })

  it('h2hReapply: after the small table splits off a team, the rest count only their own matches again', () => {
    // A, B and C have 7 points each. Among the three A and B have 4 and B the better difference
    // (+3 against +1), but between A and B it was 1:1, so with reapplying the overall
    // difference decides (A +8, B +2).
    const ms = [
      m('A', 'B', 1, 1), m('A', 'C', 1, 0), m('B', 'C', 3, 0),
      m('A', 'D', 9, 0), m('B', 'D', 1, 0), m('C', 'D', 1, 0),
      m('E', 'A', 1, 0), m('E', 'B', 1, 0), m('C', 'E', 1, 0),
      m('F', 'A', 1, 0), m('F', 'B', 1, 0), m('C', 'F', 0, 0),
      m('D', 'E', 0, 0), m('D', 'F', 0, 0), m('E', 'F', 0, 0),
    ]
    const ids = ['A', 'B', 'C', 'D', 'E', 'F']
    expect(table(football, ids, ms).map((r) => r.tablePoints)).toEqual([9, 8, 7, 7, 7, 2])
    expect(order({ ...football, h2hReapply: true }, ids, ms)).toBe('FEABCD')
    expect(order({ ...football, h2hReapply: false }, ids, ms)).toBe('FEBACD')
  })
})

describe('9.4 volleyball points', () => {
  it('3:2 gives the winner 2 points and the loser 1; 3:1 gives 3 and 0', () => {
    const rules = sportRules(sportById('siatkowka'), '3z5')
    const five = (a: number[], b: number[]): Match => ({ ...m('A', 'B', 0, 0), sets: a.map((x, i) => ({ a: x, b: b[i] })) })
    expect(matchTablePoints(rules, five([25, 23, 25, 20, 15], [20, 25, 22, 25, 10]))).toEqual([2, 1])
    expect(matchTablePoints(rules, five([25, 25, 23, 25], [20, 21, 25, 18]))).toEqual([3, 0])
  })
})

describe('points by how the match was decided', () => {
  it('hockey: a win after overtime or a shootout is 2 points, the loser gets 1', () => {
    const hockey = sportRules(sportById('hokej'), 'bez-remisu')
    expect(matchTablePoints(hockey, m('A', 'B', 3, 2))).toEqual([3, 0])
    expect(matchTablePoints(hockey, m('A', 'B', 3, 2, { decidedBy: 'overtime' }))).toEqual([2, 1])
    expect(matchTablePoints(hockey, m('A', 'B', 2, 3, { decidedBy: 'shootout' }))).toEqual([1, 2])
  })

  it('basketball: a walkover gives the loser 0 instead of 1', () => {
    const basket = sportRules(sportById('koszykowka'), 'bez-remisu')
    expect(matchTablePoints(basket, m('A', 'B', 70, 60))).toEqual([2, 1])
    expect(matchTablePoints(basket, m('A', 'B', 20, 0, { decidedBy: 'walkover' }))).toEqual([2, 0])
  })
})

describe('chess and Swiss criteria', () => {
  const chess = sportRules(sportById('szachy'))
  // A beat C and D, lost to B; B lost to C, beat D; C lost to D. A and B have 2 points.
  const ms = [m('A', 'C', 1, 0), m('A', 'D', 1, 0), m('B', 'A', 1, 0), m('B', 'C', 0, 1), m('B', 'D', 1, 0), m('C', 'D', 0, 1)]
  const ids = ['A', 'B', 'C', 'D']

  it('Sonneborn-Berger: points of the opponents beaten (B beat A with 2 points: 3; A: 2)', () => {
    const rows = table({ ...chess, tiebreak: ['sonneborn_berger'] }, ids, ms)
    expect(rows.map((r) => r.teamId).slice(0, 2)).toEqual(['B', 'A'])
  })

  it('Buchholz and Buchholz Cut 1 level, then the draw of lots settles it for good', () => {
    const rules = { ...chess, tiebreak: ['buchholz', 'buchholz_cut1', 'lots'] } as Rules
    const first = order(rules, ids, ms)
    expect(order(rules, ids, [...ms].reverse())).toBe(first)
  })

  it('"shared": teams still level share the place (ex aequo)', () => {
    const rows = table({ ...chess, tiebreak: ['buchholz', 'shared'] }, ids, ms)
    expect(rows.map((r) => r.place)).toEqual([1, 1, 3, 3])
  })

  it('a free round is worth the profile\'s bye points', () => {
    const bye = { ...m('A', '', 0, 0), sets: [], bye: true }
    expect(table({ ...chess, byePoints: 0.5 }, ['A', 'B'], [bye])[0].tablePoints).toBe(0.5)
    expect(table(chess, ['A', 'B'], [bye])[0].tablePoints).toBe(1)
  })
})
