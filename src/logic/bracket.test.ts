import { describe, expect, it } from 'vitest'
import { customPlaces, groupPlayoffPlan, knockoutPlan, parseSide } from './custom'
import { arrangeSeeds, eliminationPlan } from './elimination'
import { applyMatchUpdate, bestOfPlace } from './knockout'
import { blankState } from './newTournament'
import { tally } from './scoring'
import type { Match, State } from '../types'

/* Spec docs/specyfikacja-turnieje.md 2.2 and 2.5: seeding, byes, bronzes, places, groups + play-off. */

const draft = { name: 'T', start: '2027-01-16T09:00', courts: 4, slotMinutes: 10, dayEnd: '23:00', categories: ['Open'], sport: 'inna-wynik' }
const winnerOf = (s: State) => (m: Match) => { const t = tally(s.tournament.rules, m.sets); return t.setsA > t.setsB ? m.teamA : t.setsB > t.setsA ? m.teamB : '' }
const nameOf = (s: State, id: string) => s.teams.find((x) => x.id === id)?.name

/** Plays every match: the team earlier in the list wins. */
function playAll(state: State, score = (a: number, b: number) => (a < b ? { a: 2, b: 0 } : { a: 0, b: 2 })): State {
  for (let guard = 0; guard < 500; guard++) {
    const m = state.matches.filter((x) => x.status === 'scheduled' && x.teamA && x.teamB && !x.skipped).sort((a, b) => a.start.localeCompare(b.start))[0]
    if (!m) return state
    const ia = state.teams.findIndex((x) => x.id === m.teamA)
    const ib = state.teams.findIndex((x) => x.id === m.teamB)
    const changed = applyMatchUpdate(state, m.id, (x) => ({ ...x, status: 'finished', sets: [score(ia, ib)] }))
    const byId = new Map(changed.map((c) => [c.id, c]))
    state = { ...state, matches: state.matches.map((x) => byId.get(x.id) ?? x) }
  }
  throw new Error('never ends')
}

describe('9.2 single elimination with seeding and byes', () => {
  it('6 players: bracket of 8, byes for seeds 1 and 2, round 1: 3–6 and 4–5', () => {
    const plan = eliminationPlan('k', ['1', '2', '3', '4', '5', '6'], false)
    const first = plan.filter((p) => p.info.col === 1).map((p) => [p.info.srcA, p.info.srcB].map((s) => (s.kind === 'team' ? s.teamId : '?')).sort().join('–'))
    expect(first.sort()).toEqual(['3–6', '4–5'])
    // Seeds 1 and 2 meet only in the final.
    const final = plan.find((p) => p.info.place === 1)!
    expect(final.info.srcA.kind).toBe('match')
  })

  it('8 seeds: 1–8, 4–5, 2–7, 3–6', () => {
    const plan = eliminationPlan('k', ['1', '2', '3', '4', '5', '6', '7', '8'], false)
    const first = plan.filter((p) => p.info.col === 1).map((p) => [p.info.srcA, p.info.srcB].map((s) => (s.kind === 'team' ? s.teamId : '?')).join('–'))
    expect(first).toEqual(['1–8', '4–5', '2–7', '3–6'])
  })

  it('two bronzes: both semi-final losers are 3rd, no match for 3rd place', () => {
    const plan = eliminationPlan('k', ['1', '2', '3', '4', '5', '6', '7', '8'], false, true, true)
    expect(plan.some((p) => p.info.place === 3)).toBe(false)
    expect(plan.filter((p) => p.info.loserPlace === 3)).toHaveLength(2)
  })

  it('players of one club go into different halves', () => {
    const players = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2']
    const order = arrangeSeeds(players, (x) => x[0], false)
    // Bracket positions of seeds 1–8: halves are seeds {1,8,4,5} and {2,7,3,6}.
    const top = new Set([order[0], order[7], order[3], order[4]])
    for (const club of 'ABCD') expect([...top].filter((x) => x[0] === club)).toHaveLength(1)
  })

  it('with seeding from the list only players of the same tier swap', () => {
    const players = ['X1', 'X2', 'Y1', 'Y2', 'Z1', 'Z2', 'W1', 'W2']
    const order = arrangeSeeds(players, (x) => x[0], true)
    expect(order.slice(0, 2)).toEqual(['X1', 'X2'])
    expect(new Set(order.slice(2, 4))).toEqual(new Set(['Y1', 'Y2']))
  })
})

describe('everybody plays for a place', () => {
  it('8 players: 12 matches, places 1–8 each given once', () => {
    const names = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']
    const plan = knockoutPlan(names.map((x) => `team:${x}`), { allPlaces: true })
    expect(plan).toHaveLength(12)
    const s = playAll(blankState({ ...draft, system: 'custom', preset: [{ category: 'Open', teams: names, groups: [], matches: plan }] }))
    const places = customPlaces(s, 'k1', winnerOf(s)).map((p) => `${p.place}:${nameOf(s, p.teamId)}`)
    expect(places).toEqual(names.map((n, i) => `${i + 1}:${n}`))
  })

  it('6 players (byes): places 1–6', () => {
    const names = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']
    const plan = knockoutPlan(names.map((x) => `team:${x}`), { allPlaces: true })
    const s = playAll(blankState({ ...draft, system: 'custom', preset: [{ category: 'Open', teams: names, groups: [], matches: plan }] }))
    expect(customPlaces(s, 'k1', winnerOf(s)).map((p) => p.place)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('two bronzes in a plan', () => {
    const names = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']
    const plan = knockoutPlan(names.map((x) => `team:${x}`), { bronzes: true })
    const s = playAll(blankState({ ...draft, system: 'custom', preset: [{ category: 'Open', teams: names, groups: [], matches: plan }] }))
    expect(customPlaces(s, 'k1', winnerOf(s)).map((p) => `${p.place}:${nameOf(s, p.teamId)}`).sort()).toEqual(['1:P1', '2:P2', '3:P3', '3:P4'])
  })
})

describe('2.5 groups + play-off', () => {
  it('4 groups, 2 advance: winners do not meet in round 1, teams of one group in opposite halves', () => {
    const plan = groupPlayoffPlan(4, 2, 0)
    const qf = plan.filter((m) => m.a.startsWith('group:'))
    expect(qf).toHaveLength(4)
    for (const m of qf) {
      const [a, b] = [m.a, m.b].map((x) => parseSide(x) as { group: string; pos: number })
      expect(a.pos + b.pos).toBe(3) // a winner against a runner-up
      expect(a.group).not.toBe(b.group)
    }
    // Semi-final 1 takes quarter-finals 1–2: the other half has the other runner-up of each group.
    const half = (i: number) => [qf[i], qf[i + 1]].flatMap((m) => [m.a, m.b]).map((x) => (parseSide(x) as { group: string }).group)
    for (const g of 'ABCD') expect(half(0).filter((x) => x === g)).toHaveLength(1)
  })

  it('6 groups: 2 advance + 4 best thirds = 16', () => {
    const plan = groupPlayoffPlan(6, 2, 4)
    const sides = plan.flatMap((m) => [m.a, m.b]).filter((x) => x.startsWith('group:') || x.startsWith('best:'))
    expect(sides).toHaveLength(16)
    expect(sides.filter((x) => x.startsWith('best:3:'))).toHaveLength(4)
    expect(plan.every((m) => m.auto)).toBe(true)
  })

  it('best third places compare points per match (groups of different sizes)', () => {
    const letters = ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3']
    const plan = groupPlayoffPlan(2, 2, 1)
    let s = blankState({ ...draft, preset: [{ category: 'Open', teams: letters, groups: [letters.slice(0, 4), letters.slice(4)], matches: plan }] })
    // Earlier in the list wins every match.
    s = playAll(s)
    // A3: 1 win in 3 matches (0.33 per match * 3 pts) against B3: 0 wins in 2.
    expect(bestOfPlace(s, 'k1', 3).map((id) => nameOf(s, id))).toEqual(['A3', 'B3'])
    const places = customPlaces(s, 'k1', winnerOf(s)).map((p) => `${p.place}:${nameOf(s, p.teamId)}`)
    expect(places[0]).toBe('1:A1')
    expect(s.matches.filter((m) => m.ko).flatMap((m) => [m.teamA, m.teamB]).map((id) => nameOf(s, id))).toContain('A3')
  })
})
