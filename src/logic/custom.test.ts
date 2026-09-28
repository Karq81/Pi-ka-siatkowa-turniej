import { describe, expect, it } from 'vitest'
import { checkCustom, customPlaces, parseSide } from './custom'
import { applyMatchUpdate } from './knockout'
import { blankState } from './newTournament'
import { tally } from './scoring'
import type { CustomMatch, Match, State } from '../types'

const players = ['Adam', 'Bartek', 'Czarek', 'Darek', 'Emil', 'Filip', 'Grzegorz', 'Hubert']

// Judo with repechage: quarter-finals, semi-finals, final; the quarter-final losers fight
// for two bronze medals against the semi-final losers.
const judo: CustomMatch[] = [
  { name: 'ĆF 1', a: 'team:Adam', b: 'team:Bartek' },
  { name: 'ĆF 2', a: 'team:Czarek', b: 'team:Darek' },
  { name: 'ĆF 3', a: 'team:Emil', b: 'team:Filip' },
  { name: 'ĆF 4', a: 'team:Grzegorz', b: 'team:Hubert' },
  { name: 'PF 1', a: 'winner:ĆF 1', b: 'winner:ĆF 2' },
  { name: 'PF 2', a: 'winner:ĆF 3', b: 'winner:ĆF 4' },
  { name: 'Finał', a: 'winner:PF 1', b: 'winner:PF 2', place: 1 },
  { name: 'Repasaż 1', a: 'loser:ĆF 1', b: 'loser:ĆF 2' },
  { name: 'Repasaż 2', a: 'loser:ĆF 3', b: 'loser:ĆF 4' },
  { name: 'Brąz 1', a: 'winner:Repasaż 1', b: 'loser:PF 2', place: 3, loserPlace: 5 },
  { name: 'Brąz 2', a: 'winner:Repasaż 2', b: 'loser:PF 1', place: 3, loserPlace: 5 },
]

const draft = { name: 'T', start: '2027-01-16T09:00', courts: 2, slotMinutes: 10, dayEnd: '18:00', categories: ['Open'], sport: 'inna-wynik' }

function playAll(state: State): State {
  for (let guard = 0; guard < 200; guard++) {
    const m = state.matches.filter((x) => x.status === 'scheduled' && x.teamA && x.teamB).sort((a, b) => a.start.localeCompare(b.start))[0]
    if (!m) return state
    // The player earlier in the list wins.
    const aWins = state.teams.findIndex((x) => x.id === m.teamA) < state.teams.findIndex((x) => x.id === m.teamB)
    const changed = applyMatchUpdate(state, m.id, (x) => ({ ...x, status: 'finished', sets: [aWins ? { a: 1, b: 0 } : { a: 0, b: 1 }] }))
    const byId = new Map(changed.map((c) => [c.id, c]))
    state = { ...state, matches: state.matches.map((x) => byId.get(x.id) ?? x) }
  }
  throw new Error('never ends')
}
const winnerOf = (s: State) => (m: Match) => { const t = tally(s.tournament.rules, m.sets); return t.setsA > t.setsB ? m.teamA : t.setsB > t.setsA ? m.teamB : '' }
const nameOf = (s: State, id: string) => s.teams.find((x) => x.id === id)?.name

describe('own plan (from the AI assistant)', () => {
  it('reads the sides', () => {
    expect(parseSide('team: Jan Kowalski')).toEqual({ kind: 'team', name: 'Jan Kowalski' })
    expect(parseSide('group:B:2')).toEqual({ kind: 'group', group: 'B', pos: 2 })
    expect(parseSide('loser:Półfinał 1')).toEqual({ kind: 'loser', match: 'Półfinał 1' })
    expect(parseSide('ktoś')).toBeNull()
  })

  it('names what does not fit', () => {
    const p = checkCustom([...judo, { name: 'X', a: 'team:Zenek', b: 'winner:Nic' }, { name: 'Y', a: 'group:C:1', b: 'winner:Y' }], players, null, 2)
    expect(p.join(' | ')).toContain('Zenek')
    expect(p.join(' | ')).toContain('Nic')
    expect(p.join(' | ')).toContain('grupy „C”')
    expect(p.join(' | ')).toContain('same na siebie')
    expect(checkCustom(judo, players, null)).toEqual([])
  })

  it('judo with repechage: plays through, two bronzes', () => {
    const s = blankState({ ...draft, system: 'custom', preset: [{ category: 'Open', teams: players, groups: [], matches: judo }] })
    expect(s.tournament.system).toBe('custom')
    expect(s.matches).toHaveLength(11)
    expect(s.matches.filter((m) => m.teamA && m.teamB)).toHaveLength(4)
    // No match before one it waits for.
    for (const m of s.matches) for (const src of [m.ko!.srcA, m.ko!.srcB]) if (src.kind === 'match') expect(s.matches.find((x) => x.id === src.matchId)!.start < m.start).toBe(true)
    const done = playAll(s)
    expect(done.matches.every((m) => m.status === 'finished')).toBe(true)
    const places = customPlaces(done, 'k1', winnerOf(done)).map((p) => `${p.place}:${nameOf(done, p.teamId)}`)
    expect(places).toEqual(['1:Adam', '2:Emil', '3:Bartek', '3:Czarek', '5:Grzegorz', '5:Filip'])
  })

  it('groups, then crossed semi-finals: the plan follows the tables, also after a new draw', () => {
    const plan: CustomMatch[] = [
      { name: 'Półfinał 1', a: 'group:A:1', b: 'group:B:2' },
      { name: 'Półfinał 2', a: 'group:B:1', b: 'group:A:2' },
      { name: 'Finał', a: 'winner:Półfinał 1', b: 'winner:Półfinał 2', place: 1 },
      { name: 'O 3. miejsce', a: 'loser:Półfinał 1', b: 'loser:Półfinał 2', place: 3 },
    ]
    const s = blankState({ ...draft, twice: true, preset: [{ category: 'Open', teams: players, groups: [players.slice(0, 4), players.slice(4)], matches: plan }] })
    // Each with each twice: 2 groups × 12 matches, then the plan after them.
    expect(s.matches.filter((m) => !m.ko)).toHaveLength(24)
    expect(s.matches.filter((m) => m.ko)).toHaveLength(4)
    const lastGroup = s.matches.filter((m) => !m.ko).map((m) => m.start).sort().at(-1)!
    expect(s.matches.filter((m) => m.ko).every((m) => m.start > lastGroup)).toBe(true)
    const done = playAll(s)
    const places = customPlaces(done, 'k1', winnerOf(done)).map((p) => `${p.place}:${nameOf(done, p.teamId)}`)
    expect(places).toEqual(['1:Adam', '2:Bartek', '3:Emil', '4:Filip'])
  })
})

describe('stepladder and consolation', () => {
  it('stepladder: 5 players, 4 matches, places 1–5', async () => {
    const { stepladderPlan } = await import('./custom')
    const names = ['Adam', 'Bartek', 'Czarek', 'Darek', 'Emil']
    const plan = stepladderPlan(names)
    expect(plan).toHaveLength(4)
    expect(plan[0]).toMatchObject({ a: 'team:Darek', b: 'team:Emil', loserPlace: 5 })
    expect(plan[3]).toMatchObject({ a: 'team:Adam', place: 1 })
    const s = blankState({ ...draft, system: 'custom', preset: [{ category: 'Open', teams: names, groups: [], matches: plan }] })
    const done = playAll(s)
    const places = customPlaces(done, 'k1', winnerOf(done)).map((p) => `${p.place}:${nameOf(done, p.teamId)}`)
    // The earlier on the list wins: Adam beats everyone in the end.
    expect(places).toEqual(['1:Adam', '2:Bartek', '3:Czarek', '4:Darek', '5:Emil'])
  })

  it('consolation: 8 players, main bracket + 3rd place + plate for the 4 first-round losers', async () => {
    const { consolationPlan } = await import('./custom')
    const plan = consolationPlan(players)
    expect(plan.filter((m) => !m.name.startsWith('Pocieszenie'))).toHaveLength(8)
    expect(plan.filter((m) => m.name.startsWith('Pocieszenie'))).toHaveLength(3)
    expect(checkCustom(plan, players, null)).toEqual([])
    const s = blankState({ ...draft, system: 'custom', preset: [{ category: 'Open', teams: players, groups: [], matches: plan }] })
    const done = playAll(s)
    expect(done.matches.every((m) => m.status === 'finished')).toBe(true)
    // Every player plays at least twice.
    const count = new Map<string, number>()
    for (const m of done.matches) for (const id of [m.teamA, m.teamB]) count.set(id, (count.get(id) ?? 0) + 1)
    expect([...count.values()].every((n) => n >= 2)).toBe(true)
  })
})
