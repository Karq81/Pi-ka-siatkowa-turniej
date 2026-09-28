import { describe, expect, it } from 'vitest'
import { drawCategory } from './draw'
import { blankState, scheduleOf } from './newTournament'
import { buildGroupSchedule } from './schedule'
import { standings } from './scoring'
import { sportById, sportRules } from './sports'
import { walkoverSets, withdrawTeam } from './special'
import type { Group, State } from '../types'

/* Spec part 6: walkovers, withdrawals; 7: a player never plays twice at once. */

const eight = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
function league(): State {
  const s = blankState({ name: 'T', start: '2027-05-08T09:00', courts: 4, slotMinutes: 30, dayEnd: '23:00', categories: ['Liga'], sport: 'pilka-nozna', format: 'remis', preset: [{ category: 'Liga', teams: eight, groups: [eight] }] })
  return s
}
const id = (s: State, n: string) => s.teams.find((x) => x.name === n)!.id
/** Plays the first `n` matches of team X (X wins 1:0) and every match without X (A-side wins). */
function playSome(s: State, x: string, n: number): State {
  const X = id(s, x)
  let played = 0
  return {
    ...s,
    matches: s.matches.map((m) => {
      const withX = m.teamA === X || m.teamB === X
      if (withX && played >= n) return m
      if (withX) played++
      return { ...m, status: 'finished' as const, sets: [withX ? (m.teamA === X ? { a: 1, b: 0 } : { a: 0, b: 1 }) : { a: 2, b: 1 }] }
    }),
  }
}

describe('walkover scores', () => {
  it('football 3:0, basketball 20:0, volleyball 25:0 in each set needed', () => {
    expect(walkoverSets(sportRules(sportById('pilka-nozna'), 'remis'), true)).toEqual([{ a: 3, b: 0 }])
    expect(walkoverSets(sportRules(sportById('koszykowka'), 'bez-remisu'), false)).toEqual([{ a: 0, b: 20 }])
    expect(walkoverSets(sportRules(sportById('siatkowka'), '3z5'), true)).toEqual([{ a: 25, b: 0 }, { a: 25, b: 0 }, { a: 25, b: 0 }])
  })
})

describe('9.8 withdrawal', () => {
  it('option A, after 2 of 7 matches: its results disappear from the others\' tables', () => {
    let s = playSome(league(), 'H', 2)
    const g = s.groups[0]
    const before = standings(s.tournament.rules, g, s.matches, s.teams)
    expect(before.find((r) => r.teamId === id(s, 'H'))!.played).toBe(2)
    s = withdrawTeam(s, id(s, 'H'), 'withdrawn')
    const after = standings(s.tournament.rules, g, s.matches, s.teams)
    expect(after.some((r) => r.teamId === id(s, 'H'))).toBe(false)
    expect(after.every((r) => r.played === 6)).toBe(true)
    // Its matches still to play are left out, not walkovers.
    expect(s.matches.filter((m) => m.decidedBy === 'walkover')).toHaveLength(0)
    expect(s.tournament.log?.at(-1)?.text).toContain('H')
  })

  it('option A after 4 of 7, or option B: the rest are walkovers for the opponents', () => {
    let s = withdrawTeam(playSome(league(), 'H', 4), id(league(), 'H'), 'withdrawn')
    expect(s.matches.filter((m) => m.decidedBy === 'walkover')).toHaveLength(3)
    let b = playSome(league(), 'H', 1)
    b = { ...b, tournament: { ...b.tournament, withdrawal: 'B' } }
    b = withdrawTeam(b, id(b, 'H'), 'disqualified')
    expect(b.matches.filter((m) => m.decidedBy === 'walkover')).toHaveLength(6)
    const table = standings(b.tournament.rules, b.groups[0], b.matches, b.teams)
    expect(table.find((r) => r.teamId === id(b, 'H'))!.lost).toBe(6)
    expect(b.teams.find((x) => x.name === 'H')!.status).toBe('disqualified')
    void s
  })
})

describe('a player in two categories', () => {
  it('never has two matches at the same time (singles and doubles)', () => {
    const singles: Group = { id: 'g1', categoryId: 'k1', name: 'S', teamIds: ['s1', 's2', 's3', 's4'] }
    const doubles: Group = { id: 'g2', categoryId: 'k2', name: 'D', teamIds: ['d1', 'd2'] }
    const names: Record<string, string[]> = { s1: ['jan'], s2: ['adam'], s3: ['ola'], s4: ['ewa'], d1: ['jan', 'ola'], d2: ['adam', 'ewa'] }
    const ms = buildGroupSchedule([singles, doubles], { courts: 4, start: '2027-05-08T09:00', slotMinutes: 20, dayEnd: '20:00', keysOf: (x) => names[x] ?? [] })
    const byTime = new Map<string, string[]>()
    for (const m of ms) byTime.set(m.start, [...(byTime.get(m.start) ?? []), ...names[m.teamA], ...names[m.teamB]])
    for (const people of byTime.values()) expect(new Set(people).size).toBe(people.length)
  })

  it('tennis draw: the same player in singles and doubles is kept apart', () => {
    const s0 = blankState({ name: 'T', start: '2027-05-08T09:00', courts: 6, slotMinutes: 60, dayEnd: '23:00', categories: ['Singiel', 'Debel'], sport: 'tenis', format: '1set',
      preset: [{ category: 'Singiel', teams: ['Jan', 'Adam', 'Ola', 'Ewa'], groups: [] }, { category: 'Debel', teams: ['Jan / Ola', 'Adam / Ewa'], groups: [] }] })
    const s1 = drawCategory(s0, 'k1', 1, scheduleOf(s0.tournament), () => 0.3)
    const s2 = drawCategory(s1, 'k2', 1, scheduleOf(s1.tournament), () => 0.3)
    const who = (tid: string) => s2.teams.find((x) => x.id === tid)!.name.toLowerCase().split(' / ')
    const byTime = new Map<string, string[]>()
    for (const m of s2.matches) byTime.set(m.start, [...(byTime.get(m.start) ?? []), ...who(m.teamA), ...who(m.teamB)])
    for (const people of byTime.values()) expect(new Set(people).size).toBe(people.length)
  })
})
