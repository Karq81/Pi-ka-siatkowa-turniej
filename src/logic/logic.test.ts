import { describe, expect, it } from 'vitest'
import type { Group, Match, Rules, Team } from '../types'
import { defaultRules, DEFAULT_SCHEDULE, drawnState, initialState, restoreTimetable } from './demo'
import { clubOf, drawCategory, drawGroups, isDrawn, resetResults, rng } from './draw'
import { parseTeams } from './importTeams'
import { buildGroupSchedule, retimeSchedule, roundRobin, setNextOnCourt } from './schedule'
import { applyMatchUpdate } from './knockout'
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
    // Dwójki 4×7 teams (21 matches per group), Trójki 7, 7, 8, 8 (21, 21, 28, 28).
    expect(matches).toHaveLength(4 * 21 + 2 * 21 + 2 * 28)
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
    expect(s.teams.filter((t) => t.categoryId === 'c1')).toHaveLength(28)
    expect(s.teams.filter((t) => t.categoryId === 'c2')).toHaveLength(30)
    const names = s.teams.map((t) => t.name)
    expect(names).toContain('UKS Opty Mielno 1')
    expect(names).toContain('UKS Opty Mielno 2')
    expect(names).toContain('AMPS Kołobrzeg')
    expect(names).toContain('UKS Opty Mielno 4')
    expect(new Set(s.teams.filter((t) => t.categoryId === 'c2').map((t) => t.name)).size).toBe(30)
  })

  it('draws groups without two teams of one club together, in every draw', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const s = drawnState(rng(seed))
      for (const g of s.groups) {
        const clubs = g.teamIds.map((id) => clubOf(s.teams.find((t) => t.id === id)!))
        expect(new Set(clubs).size).toBe(clubs.length)
      }
      const sizes = (cat: string) => s.groups.filter((g) => g.categoryId === cat).map((g) => g.teamIds.length).sort()
      expect(sizes('c1')).toEqual([7, 7, 7, 7])
      expect(sizes('c2')).toEqual([7, 7, 8, 8])
    }
  })

  it('draws differently each time', () => {
    const a = drawnState(rng(1)).groups.map((g) => g.teamIds.join())
    const b = drawnState(rng(2)).groups.map((g) => g.teamIds.join())
    expect(a).not.toEqual(b)
  })

  it('starts with the organiser\'s fixed groups: Dwójki 4×7, Trójki 5×6', () => {
    const s = initialState()
    expect(s.teams).toHaveLength(58)
    const sizes = (cat: string) => s.groups.filter((g) => g.categoryId === cat).map((g) => g.teamIds.length)
    expect(sizes('c1')).toEqual([7, 7, 7, 7])
    expect(sizes('c2')).toEqual([6, 6, 6, 6, 6])
    expect(s.groups.map((g) => g.name)).toEqual(['Grupa 1', 'Grupa 2', 'Grupa 3', 'Grupa 4', 'Grupa 1', 'Grupa 2', 'Grupa 3', 'Grupa 4', 'Grupa 5'])
    // Every team in exactly one group of its category.
    const placed = s.groups.flatMap((g) => g.teamIds)
    expect(new Set(placed).size).toBe(58)
    expect(s.groups.every((g) => g.teamIds.every((id) => s.teams.find((t) => t.id === id)!.categoryId === g.categoryId))).toBe(true)
    const name = (id: string) => s.teams.find((t) => t.id === id)!.name
    expect(s.groups[0].teamIds.map(name)).toContain('UKS Opty Mielno 1')
    expect(s.groups[8].teamIds.map(name)).toEqual(['UKS Piątka Turek 1', 'MKS Sasvolley Stargard 1', 'UKS Volley 71 Szczecin 2', 'PTPS Człuchów 1', 'UKS Tytan Ostrowy 2', 'UKS Opty Mielno 4'])
    expect(s.matches).toHaveLength(4 * 21 + 5 * 15)
    expect(s.matches.every((m) => m.status === 'scheduled')).toBe(true)
  })

  it('draws one category at a time', () => {
    const empty = { ...initialState(), groups: [], matches: [] }
    const one = drawCategory(empty, 'c1', 4, DEFAULT_SCHEDULE, rng(1))
    expect(isDrawn(one, 'c1')).toBe(true)
    expect(isDrawn(one, 'c2')).toBe(false)
    expect(one.matches).toHaveLength(4 * 21)
  })

  it('starts with no results at all', () => {
    const s = drawnState(rng(3))
    expect(s.matches.every((m) => m.status === 'scheduled' && m.sets.length === 0)).toBe(true)
  })

  it('keeps clubs apart with another number of groups', () => {
    const s = drawnState(rng(4))
    const groups = drawGroups(s.teams, 'c2', 5, rng(9))
    expect(groups.map((g) => g.teamIds.length).sort((x, y) => x - y)).toEqual([6, 6, 6, 6, 6])
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
    expect(starts.find((x) => x.startsWith('2026-10-24'))).toBe('2026-10-24T09:30')
  })
})

describe('changing the match interval', () => {
  const opts = { slotMinutes: 20, dayEnd: '18:40', dayStart: '09:30' }

  it('plays the fixed groups every 15 minutes: Friday from 15:30, the rest on Saturday from 9:30', () => {
    const starts = [...new Set(initialState().matches.map((m) => m.start))].sort()
    expect(starts.slice(0, 3)).toEqual(['2026-10-23T15:30', '2026-10-23T15:45', '2026-10-23T16:00'])
    expect(starts.filter((x) => x.startsWith('2026-10-23')).at(-1)).toBe('2026-10-23T18:30')
    expect(starts.find((x) => x.startsWith('2026-10-24'))).toBe('2026-10-24T09:30')
  })

  it('re-times every slot from the first one, keeping courts and pairings', () => {
    const s = initialState()
    const out = retimeSchedule(s.matches, opts)
    const starts = [...new Set(out.map((m) => m.start))].sort()
    expect(starts.slice(0, 3)).toEqual(['2026-10-23T15:30', '2026-10-23T15:50', '2026-10-23T16:10'])
    expect(starts.filter((x) => x.startsWith('2026-10-23')).at(-1)).toBe('2026-10-23T18:30')
    expect(starts.find((x) => x.startsWith('2026-10-24'))).toBe('2026-10-24T09:30')
    expect(out.map((m) => [m.id, m.court, m.teamA, m.teamB])).toEqual(s.matches.map((m) => [m.id, m.court, m.teamA, m.teamB]))
  })

  it('does not move slots that have started, and continues from the next one', () => {
    const s = initialState()
    const [t1, t2, t3] = [...new Set(s.matches.map((m) => m.start))].sort()
    const played = s.matches.map((m) => (m.start === t1 ? { ...m, status: 'finished' as const, sets: [{ a: 15, b: 3 }] } : m))
    const out = retimeSchedule(played, { ...opts, slotMinutes: 25 })
    expect(out.filter((m) => m.start === t1)).toHaveLength(played.filter((m) => m.start === t1).length)
    const at = (old: string) => out.find((m) => m.id === s.matches.find((x) => x.start === old)!.id)!.start
    expect(at(t2)).toBe(t2)
    expect(at(t3)).toBe('2026-10-23T16:10')
  })
})

describe('one court per group', () => {
  it('plays dwójki groups 1–4 on courts 1–4 and trójki groups 1–5 on courts 5–9, one match at a time', () => {
    const s = initialState()
    expect(s.tournament.courts).toBe(9)
    s.groups.forEach((g, i) => {
      const ms = s.matches.filter((m) => m.groupId === g.id)
      expect(new Set(ms.map((m) => m.court))).toEqual(new Set([i + 1]))
      // One match per time on the court, and every pairing once.
      expect(new Set(ms.map((m) => m.start)).size).toBe(ms.length)
      expect(ms).toHaveLength((g.teamIds.length * (g.teamIds.length - 1)) / 2)
    })
    // Dwójki (7 teams, 21 matches) finish on Saturday at 11:15, trójki (15) at 9:45.
    const last = (cat: string) => s.matches.filter((m) => m.categoryId === cat).map((m) => m.start).sort().at(-1)
    expect(last('c1')).toBe('2026-10-24T11:15')
    expect(last('c2')).toBe('2026-10-24T09:45')
  })
})

describe('next match 2 minutes after the result', () => {
  const at = (iso: string) => new Date(iso).getTime()
  const court1 = (s: ReturnType<typeof initialState>) => s.matches.filter((m) => m.court === 1).sort((a, b) => a.start.localeCompare(b.start))

  it('starts the court\'s next match 2 minutes after the result and moves the rest of the day', () => {
    const s = initialState()
    const [first, second, third] = court1(s)
    const changed = applyMatchUpdate(s, first.id, (m) => ({ ...m, status: 'finished', sets: [{ a: 15, b: 9 }] }), at('2026-10-23T15:41:20'))
    const byId = new Map(changed.map((m) => [m.id, m]))
    expect(byId.get(second.id)!.start).toBe('2026-10-23T15:43')
    expect(byId.get(third.id)!.start).toBe('2026-10-23T15:58')
    // Other courts and the next morning stay as they were.
    expect(changed.every((m) => m.court === 1)).toBe(true)
    expect(changed.some((m) => m.start.startsWith('2026-10-24'))).toBe(false)
    // Moved matches keep their updatedAt (the court board relies on it).
    expect(byId.get(second.id)!.updatedAt).toBe(second.updatedAt)
  })

  it('also moves the next match earlier when a match ends early', () => {
    const s = initialState()
    const [first, second] = court1(s)
    const changed = applyMatchUpdate(s, first.id, (m) => ({ ...m, status: 'finished', sets: [{ a: 15, b: 2 }] }), at('2026-10-23T15:36:00'))
    expect(changed.find((m) => m.id === second.id)!.start).toBe('2026-10-23T15:38')
  })

  it('uses the time of day for results typed in on another day (tests), and changes nothing for corrections', () => {
    const s = initialState()
    const [first, second] = court1(s)
    const test = applyMatchUpdate(s, first.id, (m) => ({ ...m, status: 'finished', sets: [{ a: 15, b: 9 }] }), at('2026-09-26T11:20:30'))
    expect(test.find((m) => m.id === second.id)!.start).toBe('2026-10-23T11:22')
    // Restoring the timetable puts it back.
    const moved = { ...s, matches: s.matches.map((m) => test.find((x) => x.id === m.id) ?? m) }
    expect(restoreTimetable(resetResults(moved)).matches).toEqual(s.matches)
    const done = { ...s, matches: s.matches.map((m) => (m.id === first.id ? { ...m, status: 'finished' as const, sets: [{ a: 15, b: 9 }] } : m)) }
    expect(applyMatchUpdate(done, first.id, (m) => ({ ...m, sets: [{ a: 15, b: 11 }] }), at('2026-10-23T15:50:00'))).toHaveLength(1)
  })
})

describe('manual time of the next match on a court', () => {
  it('sets the court\'s next match to the given time and moves the rest of that day', () => {
    const s = initialState()
    const [first, second] = s.matches.filter((m) => m.court === 3).sort((a, b) => a.start.localeCompare(b.start))
    const moved = setNextOnCourt(s.matches, 3, '15:50')
    expect(moved.find((m) => m.id === first.id)!.start).toBe('2026-10-23T15:50')
    expect(moved.find((m) => m.id === second.id)!.start).toBe('2026-10-23T16:05')
    expect(moved.every((m) => m.court === 3 && m.start.startsWith('2026-10-23'))).toBe(true)
    expect(setNextOnCourt(s.matches, 3, '15:30')).toHaveLength(0)
  })
})
