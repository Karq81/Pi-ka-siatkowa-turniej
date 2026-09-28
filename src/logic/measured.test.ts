import { describe, expect, it } from 'vitest'
import { addRound, drawMeasured, formatValue, makeFinal, measuredPlaces, parseValue, qualifiers, rankGroup, seriesStandings, withPerf } from './measured'
import { blankState } from './newTournament'
import type { Perf, State } from '../types'

/* Spec 2.7 (measured events) and 2.8 (points for places). */

const names = ['Ala', 'Bea', 'Cela', 'Dora', 'Ewa', 'Fela']
function event(sport: string, format: string, measured: State['tournament']['measured'], count: number): State {
  const s = blankState({ name: 'T', start: '2027-05-08T09:00', courts: 1, slotMinutes: 10, dayEnd: '18:00', categories: ['Open'], sport, format, system: 'measured', preset: [{ category: 'Open', teams: names, groups: [] }] })
  const withCfg = { ...s, tournament: { ...s.tournament, measured } }
  return drawMeasured(withCfg, 'k1', withCfg.teams, count, () => 0.5)
}
const id = (s: State, n: string) => s.teams.find((x) => x.name === n)!.id
const nm = (s: State, i: string) => s.teams.find((x) => x.id === i)!.name
function put(s: State, groupId: string, who: string, perf: Perf): State {
  return { ...s, tournament: { ...s.tournament, perf: withPerf(s.tournament, groupId, id(s, who), perf) } }
}

describe('values', () => {
  it('reads and shows times and distances', () => {
    expect(parseValue('1:02,35', 'time')).toBe(62350)
    expect(parseValue('12.8', 'time')).toBe(12800)
    expect(formatValue(62350, 'time')).toBe('1:02,35')
    expect(formatValue(12800, 'time')).toBe('12,80')
    expect(parseValue('5,23', 'distance')).toBe(523)
    expect(formatValue(523, 'distance')).toBe('5,23 m')
    expect(parseValue('abc', 'points')).toBeNull()
  })
})

describe('heats and a final (runs)', () => {
  it('2 heats; Q = 2 per heat plus q = 1 fastest of the rest; DNF last', () => {
    let s = event('bieg', 'czas', { mode: 'heats', Q: 2, q: 1 }, 2)
    const [h1, h2] = s.groups
    expect(h1.teamIds).toHaveLength(3)
    const times: Record<string, number> = { Ala: 12100, Bea: 12500, Cela: 12300, Dora: 12200, Ewa: 12900, Fela: 13000 }
    for (const g of [h1, h2]) for (const tid of g.teamIds) s = put(s, g.id, nm(s, tid), { v: [times[nm(s, tid)]] })
    // One DNF in heat 1.
    const dnf = nm(s, h1.teamIds[2])
    s = put(s, h1.id, dnf, { v: [null], mark: 'DNF' })
    const rows = rankGroup(s.tournament, s.groups[0])
    expect(rows[rows.length - 1].perf?.mark).toBe('DNF')
    const through = qualifiers(s, 'k1')
    expect([...through.values()].filter((x) => x === 'Q')).toHaveLength(4)
    expect([...through.values()].filter((x) => x === 'q')).toHaveLength(1)
    s = makeFinal(s, 'k1')
    const final = s.groups.find((g) => g.id === 'k1fin')!
    expect(final.teamIds).toHaveLength(5)
    // Final: the order of the times again.
    for (const tid of final.teamIds) s = put(s, final.id, nm(s, tid), { v: [times[nm(s, tid)] - 100] })
    const places = measuredPlaces(s, 'k1').map((p) => `${p.place}:${nm(s, p.teamId)}`)
    expect(places[0]).toBe('1:Ala')
    expect(places).toHaveLength(6)
    expect(places[5]).toBe(`6:${dnf}`)
  })

  it('jumps: the best attempt counts, a tie goes to the second best', () => {
    let s = event('skoki-rzuty', '3', { mode: 'heats' }, 1)
    const g = s.groups[0]
    s = put(s, g.id, 'Ala', { v: [500, 520, null] })
    s = put(s, g.id, 'Bea', { v: [520, 510, 490] })
    s = put(s, g.id, 'Cela', { v: [520, 505, null] })
    const rows = rankGroup(s.tournament, s.groups[0]).map((r) => `${r.place}:${nm(s, r.teamId)}`)
    expect(rows.slice(0, 3)).toEqual(['1:Bea', '2:Cela', '3:Ala'])
  })
})

describe('rounds with points for places (2.8)', () => {
  it('F1 points over 3 races, the worst dropped', () => {
    let s = event('miejsca', 'miejsce', { mode: 'rounds', points: 'f1', drop: 1 }, 2)
    s = addRound(s, 'k1')
    expect(s.groups).toHaveLength(3)
    // Places typed in each race (lower is better): Ala 1, 1, 6; Bea 2, 2, 1.
    const order = [['Ala', 'Bea', 'Cela', 'Dora', 'Ewa', 'Fela'], ['Ala', 'Bea', 'Cela', 'Dora', 'Ewa', 'Fela'], ['Bea', 'Cela', 'Dora', 'Ewa', 'Fela', 'Ala']]
    s.groups.forEach((g, i) => order[i].forEach((n, k) => { s = put(s, g.id, n, { v: [k + 1] }) }))
    const rows = seriesStandings(s, 'k1')
    // Ala: 25 + 25 (+1 dropped) = 50; Bea: 18 + 18 + 25, drop 18 = 43.
    expect(rows.map((r) => `${nm(s, r.teamId)}:${r.total}`).slice(0, 2)).toEqual(['Ala:50', 'Bea:43'])
  })

  it('low points (sailing): the fewest win', () => {
    let s = event('miejsca', 'miejsce', { mode: 'rounds', points: 'low' }, 2)
    const order = [['Ala', 'Bea', 'Cela', 'Dora', 'Ewa', 'Fela'], ['Bea', 'Ala', 'Cela', 'Dora', 'Ewa', 'Fela']]
    s.groups.forEach((g, i) => order[i].forEach((n, k) => { s = put(s, g.id, n, { v: [k + 1] }) }))
    const rows = seriesStandings(s, 'k1')
    expect(rows.slice(0, 2).map((r) => r.total)).toEqual([3, 3])
    expect(rows[0].place).toBe(1)
    expect(rows[1].place).toBe(1)
    expect(rows[2].total).toBe(6)
  })
})
