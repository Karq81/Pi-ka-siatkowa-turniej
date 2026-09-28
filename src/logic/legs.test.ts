import { describe, expect, it } from 'vitest'
import { customPlaces, knockoutPlan } from './custom'
import { applyMatchUpdate } from './knockout'
import { koWinner, needsPenalties, tieScore, withLegs } from './legs'
import { blankState, scheduleOf } from './newTournament'
import type { Match, SetScore, State, Tournament } from '../types'

/* Spec 2.6: two-legged ties and best-of-N series. */

const draft = { name: 'T', start: '2027-01-16T09:00', courts: 2, slotMinutes: 60, dayEnd: '23:00', categories: ['Open'], sport: 'pilka-nozna', format: 'remis' }
const four = ['A', 'B', 'C', 'D']

function make(ties: Tournament['ties']): State {
  const plan = knockoutPlan(four.map((x) => `team:${x}`), {})
  const s = blankState({ ...draft, system: 'custom', preset: [{ category: 'Open', teams: four, groups: [], matches: plan }] })
  const withTies = { ...s, tournament: { ...s.tournament, ties } }
  return withLegs(withTies, 'k1', scheduleOf(withTies.tournament))
}
const idOf = (s: State, name: string) => s.teams.find((x) => x.name === name)!.id
const nameOf = (s: State, id: string) => s.teams.find((x) => x.id === id)?.name ?? ''
function play(s: State, id: string, a: number, b: number, extra: Partial<Match> = {}): State {
  const changed = applyMatchUpdate(s, id, (x) => ({ ...x, status: 'finished', sets: [{ a, b } as SetScore], ...extra }))
  const byId = new Map(changed.map((c) => [c.id, c]))
  return { ...s, matches: s.matches.map((x) => byId.get(x.id) ?? x) }
}
const byLabel = (s: State, label: string) => s.matches.find((m) => m.ko?.label === label)!

describe('two legs', () => {
  it('each pairing gets a return match with sides swapped, after the first legs; the final stays single', () => {
    const s = make({ kind: 'two', finalSingle: true })
    const semi = byLabel(s, 'Półfinał 1')
    const ret = byLabel(s, 'Półfinał 1 · rewanż')
    expect([ret.teamA, ret.teamB]).toEqual([semi.teamB, semi.teamA])
    expect(ret.start > semi.start).toBe(true)
    expect(byLabel(s, 'Półfinał 2 · rewanż').start >= byLabel(s, 'Półfinał 2').start).toBe(true)
    expect(s.matches.filter((m) => m.ko?.legOf)).toHaveLength(2)
    expect(byLabel(s, 'Finał').start > ret.start).toBe(true)
  })

  it('the aggregate decides; a first-leg win is not enough', () => {
    let s = make({ kind: 'two', finalSingle: true })
    const semi = byLabel(s, 'Półfinał 1')
    s = play(s, semi.id, 2, 0)
    expect(koWinner(s, byLabel(s, 'Półfinał 1'))).toBe('')
    expect(byLabel(s, 'Finał').teamA).toBe('')
    // Return match 3:1 for the other side: aggregate 3:3 → penalties needed.
    const ret = byLabel(s, 'Półfinał 1 · rewanż')
    expect(needsPenalties(s, ret, [{ a: 3, b: 1 }])).toBe(true)
    expect(needsPenalties(s, ret, [{ a: 1, b: 1 }])).toBe(false)
    s = play(s, ret.id, 3, 1, { penalties: { a: 4, b: 5 } })
    const tie = tieScore(s, byLabel(s, 'Półfinał 1'))!
    expect([tie.a, tie.b]).toEqual([3, 3])
    // Penalties 4:5 from the return match's side: its teamB (the first leg's teamA) goes through.
    expect(tie.winner).toBe(semi.teamA)
    expect(byLabel(s, 'Finał').teamA).toBe(semi.teamA)
  })

  it('away goals when the tournament counts them', () => {
    let s = make({ kind: 'two', awayGoals: true })
    const semi = byLabel(s, 'Półfinał 2')
    s = play(s, semi.id, 1, 2)
    s = play(s, byLabel(s, 'Półfinał 2 · rewanż').id, 0, 1)
    // 2:2 on aggregate; the first leg's teamB scored 2 away, teamA 1 away.
    expect(koWinner(s, byLabel(s, 'Półfinał 2'))).toBe(semi.teamB)
  })
})

describe('series (best of N)', () => {
  it('best of 5: over after 3 wins, the other games are left out; places follow', () => {
    let s = make({ kind: 'series', n: 5 })
    expect(s.matches.filter((m) => m.ko?.legOf)).toHaveLength(3 * 4)
    // Game 2 of the pairing: same home side (2-2-1).
    const semi = byLabel(s, 'Półfinał 1')
    expect(byLabel(s, 'Półfinał 1 · mecz 2').teamA).toBe(semi.teamA)
    expect(byLabel(s, 'Półfinał 1 · mecz 3').teamA).toBe(semi.teamB)
    // The seeds 1 and 2 win every game 1:0.
    for (let guard = 0; guard < 100; guard++) {
      const m = s.matches.filter((x) => x.status === 'scheduled' && x.teamA && x.teamB && !x.skipped).sort((a, b) => a.start.localeCompare(b.start))[0]
      if (!m) break
      const aWins = four.indexOf(nameOf(s, m.teamA)) < four.indexOf(nameOf(s, m.teamB))
      s = play(s, m.id, aWins ? 1 : 0, aWins ? 0 : 1)
    }
    expect(s.matches.filter((m) => m.skipped)).toHaveLength(3 * 2)
    const places = customPlaces(s, 'k1', (m) => koWinner(s, m)).map((p) => `${p.place}:${nameOf(s, p.teamId)}`)
    expect(places).toEqual(['1:A', '2:B'])
    expect(tieScore(s, byLabel(s, 'Finał'))).toMatchObject({ a: 3, b: 0, kind: 'series', winner: idOf(s, 'A') })
  })
})
