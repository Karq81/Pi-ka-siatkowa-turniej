import { describe, expect, it } from 'vitest'
import type { Group, Match, Rules, Team } from '../types'
import { defaultRules, demoState } from './demo'
import { parseTeams } from './importTeams'
import { buildGroupSchedule, roundRobin } from './schedule'
import { isMatchDecided, setWinner, standings, tally } from './scoring'

const rules: Rules = defaultRules

describe('sets', () => {
  it('needs the target and a 2-point lead', () => {
    expect(setWinner(rules, 0, { a: 25, b: 23 })).toBe('a')
    expect(setWinner(rules, 0, { a: 25, b: 24 })).toBeNull()
    expect(setWinner(rules, 0, { a: 26, b: 28 })).toBe('b')
    expect(setWinner(rules, 2, { a: 15, b: 10 })).toBe('a') // tie-break
  })

  it('decides best-of-3 at two sets', () => {
    expect(isMatchDecided(rules, [{ a: 25, b: 20 }])).toBe(false)
    expect(isMatchDecided(rules, [{ a: 25, b: 20 }, { a: 25, b: 20 }])).toBe(true)
    expect(isMatchDecided(rules, [{ a: 25, b: 20 }, { a: 20, b: 25 }, { a: 10, b: 8 }])).toBe(false)
  })

  it('plays all sets in fixed mode', () => {
    const fixed: Rules = { ...rules, setsMode: 'fixed', sets: 2 }
    const sets = [{ a: 25, b: 20 }, { a: 20, b: 25 }]
    expect(isMatchDecided(fixed, sets)).toBe(true)
    expect(tally(fixed, sets)).toMatchObject({ setsA: 1, setsB: 1 })
  })
})

describe('standings', () => {
  const teams: Team[] = ['A', 'B', 'C'].map((n) => ({ id: n, name: n, categoryId: 'c' }))
  const group: Group = { id: 'g', categoryId: 'c', name: 'Grupa A', teamIds: ['A', 'B', 'C'] }
  const m = (id: string, a: string, b: string, sets: [number, number][]): Match => ({
    id, categoryId: 'c', groupId: 'g', court: 1, start: '2026-10-23T09:00', teamA: a, teamB: b,
    sets: sets.map(([x, y]) => ({ a: x, b: y })), status: 'finished', updatedAt: 1,
  })

  it('orders by points, then set ratio', () => {
    const rows = standings(rules, group, [
      m('1', 'A', 'B', [[25, 10], [25, 10]]),
      m('2', 'B', 'C', [[25, 20], [20, 25], [15, 10]]),
      m('3', 'C', 'A', [[25, 20], [20, 25], [15, 12]]),
    ], teams)
    // All teams have 2 points; set ratios decide: A 3:2, C 3:3, B 2:3.
    expect(rows.map((r) => r.teamId)).toEqual(['A', 'C', 'B'])
    expect(rows[0]).toMatchObject({ played: 2, won: 1, lost: 1, setsWon: 3, setsLost: 2, tablePoints: 2 })
  })

  it('ignores unfinished matches', () => {
    const live = { ...m('1', 'A', 'B', [[25, 10]]), status: 'live' as const }
    expect(standings(rules, group, [live], teams).every((r) => r.played === 0)).toBe(true)
  })
})

describe('schedule', () => {
  it('pairs every team once in a round robin', () => {
    const rounds = roundRobin(['1', '2', '3', '4', '5'])
    const pairs = rounds.flat().map((p) => [...p].sort().join('-'))
    expect(pairs).toHaveLength(10)
    expect(new Set(pairs).size).toBe(10)
  })

  it('never puts a team on two courts at once and respects court count', () => {
    const { matches } = demoState()
    const bySlot = new Map<string, Match[]>()
    for (const x of matches) bySlot.set(x.start, [...(bySlot.get(x.start) ?? []), x])
    for (const slot of bySlot.values()) {
      expect(slot.length).toBeLessThanOrEqual(10)
      const ids = slot.flatMap((x) => [x.teamA, x.teamB])
      expect(new Set(ids).size).toBe(ids.length)
    }
    expect(matches).toHaveLength(120)
  })

  it('moves to the next day after the day end', () => {
    const groups: Group[] = [{ id: 'g', categoryId: 'c', name: 'A', teamIds: ['1', '2', '3', '4'] }]
    const ms = buildGroupSchedule(groups, { courts: 1, start: '2026-10-23T17:00', slotMinutes: 30, dayEnd: '17:30' })
    expect(ms.map((x) => x.start)).toEqual([
      '2026-10-23T17:00', '2026-10-23T17:30', '2026-10-24T17:00',
      '2026-10-24T17:30', '2026-10-25T17:00', '2026-10-25T17:30',
    ])
  })
})

describe('import', () => {
  it('reads pasted Excel rows', () => {
    const r = parseTeams('Drużyna;Kategoria;Grupa\nOrlik;Dwójki;A\nIskra\tDwójki\tA\nSokół,Trójki,Grupa B\n')
    expect(r.teams.map((t) => t.name)).toEqual(['Orlik', 'Iskra', 'Sokół'])
    expect(r.categories.map((c) => c.name)).toEqual(['Dwójki', 'Trójki'])
    expect(r.groups.map((g) => [g.name, g.teamIds.length])).toEqual([['Grupa A', 2], ['Grupa B', 1]])
  })
})
