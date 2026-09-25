import { describe, expect, it } from 'vitest'
import type { Group, Match, Rules, Team } from '../types'
import { defaultRules, DEFAULT_SCHEDULE, drawnState, initialState } from './demo'
import { clubOf, drawCategory, drawGroups, isDrawn, resetResults, rng } from './draw'
import { parseTeams } from './importTeams'
import { buildGroupSchedule, roundRobin } from './schedule'
import { canAddPoint, isMatchDecided, resultProblem, setProblem, setWinner, standings, tally } from './scoring'

// Senior-style rules for the generic tests; the youth defaults are tested separately below.
const rules: Rules = { ...defaultRules, setsMode: 'bestOf', sets: 3, setPoints: 25, lastSetPoints: 15, pointsLoss: 0 }

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
    const { matches } = drawnState(rng(7))
    const bySlot = new Map<string, Match[]>()
    for (const x of matches) bySlot.set(x.start, [...(bySlot.get(x.start) ?? []), x])
    for (const slot of bySlot.values()) {
      expect(slot.length).toBeLessThanOrEqual(10)
      const ids = slot.flatMap((x) => [x.teamA, x.teamB])
      expect(new Set(ids).size).toBe(ids.length)
    }
    // Dwójki 4×6 teams (15 matches per group), Trójki 4×7 (21 per group).
    expect(matches).toHaveLength(4 * 15 + 4 * 21)
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

describe('youth rules: one set to 15', () => {
  const youth = defaultRules

  it('uses the Albatros CUP defaults', () => {
    expect(youth).toMatchObject({ setsMode: 'fixed', sets: 1, setPoints: 15, winBy: 2, pointsWin: 2, pointsLoss: 1 })
  })

  it('ends the match with the single set', () => {
    expect(isMatchDecided(youth, [{ a: 15, b: 9 }])).toBe(true)
    expect(isMatchDecided(youth, [{ a: 15, b: 14 }])).toBe(false)
    expect(isMatchDecided(youth, [{ a: 17, b: 15 }])).toBe(true)
  })

  it('stops adding points once the set is won', () => {
    expect(canAddPoint(youth, 0, { a: 14, b: 10 })).toBe(true)
    expect(canAddPoint(youth, 0, { a: 15, b: 10 })).toBe(false)
    expect(canAddPoint(youth, 0, { a: 15, b: 14 })).toBe(true)
    expect(canAddPoint(youth, 0, { a: 17, b: 15 })).toBe(false)
  })

  it('rejects impossible and unfinished set scores', () => {
    expect(setProblem(youth, 0, { a: 15, b: 13 })).toBeNull()
    expect(setProblem(youth, 0, { a: 18, b: 16 })).toBeNull()
    expect(setProblem(youth, 0, { a: 18, b: 12 })).toBe('impossible')
    expect(setProblem(youth, 0, { a: 21, b: 10 })).toBe('impossible')
    expect(setProblem(youth, 0, { a: 15, b: 14 })).toBe('unfinished')
    expect(setProblem(youth, 0, { a: 12, b: 10 })).toBe('unfinished')
  })

  it('checks a whole result', () => {
    expect(resultProblem(youth, [{ a: 15, b: 10 }])).toBeNull()
    expect(resultProblem(youth, [{ a: 15, b: 10 }, { a: 15, b: 12 }])).toMatch(/zbędne/)
    expect(resultProblem(youth, [{ a: 25, b: 10 }])).toMatch(/niemożliwy/)
    expect(resultProblem(youth, [])).not.toBeNull()
  })

  it('also supports sets to 21', () => {
    const r21 = { ...youth, setPoints: 21, lastSetPoints: 21 }
    expect(setProblem(r21, 0, { a: 21, b: 19 })).toBeNull()
    expect(setProblem(r21, 0, { a: 15, b: 10 })).toBe('unfinished')
  })
})

describe('Albatros CUP team list', () => {
  it('has every qualified team, numbered per club', () => {
    const s = drawnState(rng(7))
    expect(s.teams.filter((t) => t.categoryId === 'c1')).toHaveLength(24)
    expect(s.teams.filter((t) => t.categoryId === 'c2')).toHaveLength(28)
    const names = s.teams.map((t) => t.name)
    expect(names).toContain('UKS Opty Mielno 1')
    expect(names).toContain('UKS Opty Mielno 2')
    expect(names).toContain('AMPS Kołobrzeg')
    expect(new Set(s.teams.filter((t) => t.categoryId === 'c2').map((t) => t.name)).size).toBe(28)
  })

  it('draws groups without two teams of one club together, in every draw', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const s = drawnState(rng(seed))
      for (const g of s.groups) {
        const clubs = g.teamIds.map((id) => clubOf(s.teams.find((t) => t.id === id)!))
        expect(new Set(clubs).size).toBe(clubs.length)
      }
      const sizes = (cat: string) => s.groups.filter((g) => g.categoryId === cat).map((g) => g.teamIds.length).sort()
      expect(sizes('c1')).toEqual([6, 6, 6, 6])
      expect(sizes('c2')).toEqual([7, 7, 7, 7])
    }
  })

  it('draws differently each time', () => {
    const a = drawnState(rng(1)).groups.map((g) => g.teamIds.join())
    const b = drawnState(rng(2)).groups.map((g) => g.teamIds.join())
    expect(a).not.toEqual(b)
  })

  it('starts before the draw: teams only', () => {
    const s = initialState()
    expect(s.teams).toHaveLength(52)
    expect(s.groups).toHaveLength(0)
    expect(s.matches).toHaveLength(0)
    expect(isDrawn(s, 'c1')).toBe(false)
  })

  it('draws one category at a time', () => {
    const one = drawCategory(initialState(), 'c1', 4, DEFAULT_SCHEDULE, rng(1))
    expect(isDrawn(one, 'c1')).toBe(true)
    expect(isDrawn(one, 'c2')).toBe(false)
    expect(one.matches).toHaveLength(4 * 15)
    const both = drawCategory(one, 'c2', 4, DEFAULT_SCHEDULE, rng(2))
    expect(both.groups.filter((g) => g.categoryId === 'c1')).toEqual(one.groups)
    expect(both.matches).toHaveLength(4 * 15 + 4 * 21)
  })

  it('starts with no results at all', () => {
    const s = drawnState(rng(3))
    expect(s.matches.every((m) => m.status === 'scheduled' && m.sets.length === 0)).toBe(true)
  })

  it('keeps clubs apart even with an uneven split', () => {
    const s = drawnState(rng(4))
    const groups = drawGroups(s.teams, 'c2', 3, rng(9))
    expect(groups.map((g) => g.teamIds.length).sort((x, y) => x - y)).toEqual([9, 9, 10])
    for (const g of groups) {
      const clubs = g.teamIds.map((id) => clubOf(s.teams.find((t) => t.id === id)!))
      expect(new Set(clubs).size).toBe(clubs.length)
    }
  })

  it('clears all results but keeps the draw', () => {
    const s = drawnState(rng(5))
    const played = { ...s, matches: s.matches.map((m, i) => (i < 5 ? { ...m, status: 'finished' as const, sets: [{ a: 15, b: 3 }] } : m)) }
    const reset = resetResults(played)
    expect(reset.groups).toEqual(s.groups)
    expect(reset.matches.every((m) => m.status === 'scheduled' && !m.sets.length)).toBe(true)
  })

  it('starts on Friday at 15:30 and continues on Saturday morning', () => {
    const starts = [...new Set(drawnState(rng(7)).matches.map((m) => m.start))].sort()
    expect(starts[0]).toBe('2026-10-23T15:30')
    expect(starts.find((x) => x.startsWith('2026-10-24'))).toBe('2026-10-24T09:00')
  })
})
