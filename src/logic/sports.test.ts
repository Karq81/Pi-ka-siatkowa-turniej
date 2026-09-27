import { describe, expect, it } from 'vitest'
import { isMatchDecided, resultProblem, setProblem, standings } from './scoring'
import { describeSets, SPORTS, sportById, sportRules } from './sports'

describe('sport templates', () => {
  it('tennis and padel: sets to 6 games, 7:6 after a tie-break, super tie-break to 10', () => {
    const r = sportRules(sportById('padel'), '2z3-stb')
    expect(setProblem(r, 0, { a: 7, b: 6 })).toBeNull()
    expect(setProblem(r, 0, { a: 7, b: 5 })).toBeNull()
    expect(setProblem(r, 0, { a: 6, b: 5 })).toBe('unfinished')
    expect(setProblem(r, 0, { a: 7, b: 4 })).toBe('impossible')
    expect(setProblem(r, 0, { a: 8, b: 6 })).toBe('impossible')
    // Super tie-break: to 10 with a lead of 2, no cap.
    expect(resultProblem(r, [{ a: 6, b: 4 }, { a: 3, b: 6 }, { a: 12, b: 10 }])).toBeNull()
    expect(resultProblem(r, [{ a: 6, b: 4 }, { a: 3, b: 6 }, { a: 7, b: 6 }])).toMatch(/nie jest zakończony/)
    expect(describeSets(r)).toContain('tie-break przy 6:6')
  })

  it('badminton: to 21, 30:29 ends the game', () => {
    const r = sportRules(sportById('badminton'))
    expect(setProblem(r, 0, { a: 30, b: 29 })).toBeNull()
    expect(setProblem(r, 0, { a: 29, b: 28 })).toBe('unfinished')
    expect(setProblem(r, 0, { a: 31, b: 29 })).toBe('impossible')
    expect(setProblem(r, 0, { a: 23, b: 21 })).toBeNull()
  })

  it('squash, table tennis and pickleball: to 11 with a lead of 2', () => {
    for (const id of ['squash', 'tenis-stolowy', 'pickleball']) {
      const r = sportRules(sportById(id))
      expect(setProblem(r, 0, { a: 11, b: 9 })).toBeNull()
      expect(setProblem(r, 0, { a: 14, b: 12 })).toBeNull()
      expect(setProblem(r, 0, { a: 11, b: 10 })).toBe('unfinished')
    }
    expect(isMatchDecided(sportRules(sportById('squash')), [{ a: 11, b: 5 }, { a: 11, b: 5 }])).toBe(false)
  })

  it('volleyball: 3:2 gives 2 points to the winner and 1 to the loser', () => {
    const r = sportRules(sportById('siatkowka'), '3z5')
    const g = { id: 'g', categoryId: 'k1', name: 'A', teamIds: ['x', 'y', 'z'] }
    const m = (id: string, a: string, b: string, sets: [number, number][]) => ({
      id, categoryId: 'k1', groupId: 'g', court: 1, start: '', teamA: a, teamB: b,
      sets: sets.map(([sa, sb]) => ({ a: sa, b: sb })), status: 'finished' as const, updatedAt: 0,
    })
    const rows = standings(r, g, [
      m('1', 'x', 'y', [[25, 20], [20, 25], [25, 20], [20, 25], [15, 10]]),
      m('2', 'x', 'z', [[25, 20], [25, 20], [25, 20]]),
    ], [])
    expect(Object.fromEntries(rows.map((row) => [row.teamId, row.tablePoints]))).toEqual({ x: 5, y: 1, z: 0 })
  })

  it('every sport has a valid first format', () => {
    for (const s of SPORTS) {
      const r = sportRules(s)
      expect(r.sets).toBeGreaterThan(0)
      expect(s.formats.length).toBeGreaterThan(0)
    }
  })
})
