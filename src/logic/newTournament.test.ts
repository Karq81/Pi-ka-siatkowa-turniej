import { describe, expect, it } from 'vitest'
import { drawCategory } from './draw'
import { blankState, parseTeamList, replanTimetable, scheduleOf, slugify } from './newTournament'

const draft = {
  name: 'Halówka Mielno 2027', start: '2027-01-16T09:00', courts: 3, slotMinutes: 20, dayEnd: '17:00',
  categories: ['Dziewczęta', 'Chłopcy'], format: 'bo3' as const, setPoints: 25,
}

describe('new tournament', () => {
  it('makes an address from the name', () => {
    expect(slugify('Halówka Mielno 2027')).toBe('halowka-mielno-2027')
    expect(slugify('  Żaki & Orliki — Łódź! ')).toBe('zaki-orliki-lodz')
  })

  it('reads a pasted team list with clubs', () => {
    const teams = parseTeamList('1. UKS Orzeł: Orzeł A\nUKS Sokół 2\n\nuks sokół 2\nMKS Fala', 'k1')
    expect(teams.map((t) => [t.name, t.club])).toEqual([
      ['Orzeł A', 'UKS Orzeł'], ['UKS Sokół 2', 'UKS Sokół'], ['MKS Fala', 'MKS Fala'],
    ])
    expect(new Set(teams.map((t) => t.id)).size).toBe(3)
  })

  it('starts empty with its own settings and a timetable from them', () => {
    const s = blankState(draft)
    expect(s.categories.map((c) => c.id)).toEqual(['k1', 'k2'])
    expect(s.tournament.rules).toMatchObject({ setsMode: 'bestOf', sets: 3, setPoints: 25, lastSetPoints: 15 })
    const teams = parseTeamList('A\nB\nC\nD\nE\nF\nG\nH', 'k1')
    const drawn = drawCategory({ ...s, teams }, 'k1', 2, scheduleOf(s.tournament), () => 0.3)
    expect(drawn.groups).toHaveLength(2)
    expect(drawn.matches).toHaveLength(12)
    expect(drawn.matches.map((m) => m.start).sort()[0]).toBe('2027-01-16T09:00')
    expect(Math.max(...drawn.matches.map((m) => m.court))).toBeLessThanOrEqual(3)
    const moved = { ...drawn, matches: drawn.matches.map((m) => ({ ...m, start: '2027-01-16T12:00', calledAt: 1 })) }
    expect(replanTimetable(moved).matches.map((m) => m.start)).toEqual(drawn.matches.map((m) => m.start))
  })
})

describe('score sports', () => {
  it('counts goals, draws and goal difference', async () => {
    const { sportRules, sportById } = await import('./sports')
    const { resultProblem, standings, isMatchDecided } = await import('./scoring')
    const football = sportRules(sportById('pilka-nozna'))
    const basket = sportRules(sportById('koszykowka'))
    expect(resultProblem(football, [{ a: 2, b: 2 }])).toBeNull()
    expect(resultProblem(basket, [{ a: 80, b: 80 }])).toMatch(/Remis/)
    expect(isMatchDecided(basket, [{ a: 81, b: 80 }])).toBe(true)
    const group = { id: 'g', categoryId: 'k1', name: 'A', teamIds: ['x', 'y', 'z'] }
    const m = (id: string, a: string, b: string, ga: number, gb: number) => ({
      id, categoryId: 'k1', groupId: 'g', court: 1, start: '', teamA: a, teamB: b,
      sets: [{ a: ga, b: gb }], status: 'finished' as const, updatedAt: 0,
    })
    const rows = standings(football, group, [m('1', 'x', 'y', 1, 1), m('2', 'x', 'z', 3, 0), m('3', 'y', 'z', 1, 0)], [])
    expect(rows.map((r) => [r.teamId, r.tablePoints, r.drawn])).toEqual([['x', 4, 1], ['y', 4, 1], ['z', 0, 0]])
  })
})
