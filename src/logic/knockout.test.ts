import { describe, expect, it } from 'vitest'
import type { Match, State } from '../types'
import { drawnState } from './demo'
import { rng } from './draw'
import { applyMatchUpdate, bracketPlan, bracketView, createKnockout, koId } from './knockout'
import { standings } from './scoring'

/** Tournament with every group match finished (team A always wins 15:5). */
function finishedGroups(): State {
  const s = drawnState(rng(7))
  return { ...s, matches: s.matches.map((m) => ({ ...m, status: 'finished' as const, sets: [{ a: 15, b: 5 }] })) }
}

const win = (m: Match): Match => ({ ...m, status: 'finished', sets: [{ a: 15, b: 10 }] })
const lose = (m: Match): Match => ({ ...m, status: 'finished', sets: [{ a: 10, b: 15 }] })
const opts = { start: '2026-10-25T09:00', slotMinutes: 20, courts: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }

describe('knockout: full classification', () => {
  it('gives every team a place: 4 groups of 7 → places 1–28', () => {
    const s = drawnState(rng(1))
    for (const [cat, teams] of [['c1', 28]] as const) {
      const plan = bracketPlan(cat, s.groups.filter((g) => g.categoryId === cat))!
      const places = plan.filter((p) => p.info.round === 'P').flatMap((p) => [p.info.place!, p.info.place! + 1]).sort((a, b) => a - b)
      expect(places).toEqual(Array.from({ length: teams }, (_, i) => i + 1))
    }
  })

  it('pairs group places crosswise in each tier', () => {
    const s = finishedGroups()
    const [A, B] = s.groups.filter((g) => g.categoryId === 'c1')
    const pos = (g: typeof A, i: number) => standings(s.tournament.rules, g, s.matches, s.teams)[i].teamId
    const ko = createKnockout(s, 'c1', opts)
    expect(ko).toHaveLength(40)
    const q1 = ko.find((m) => m.id === koId('c1', 'T1-Q1'))!
    expect([q1.teamA, q1.teamB]).toEqual([pos(A, 0), pos(B, 1)])
    const q9 = ko.find((m) => m.id === koId('c1', 'T9-Q1'))!
    expect([q9.teamA, q9.teamB]).toEqual([pos(A, 2), pos(B, 3)])
    expect(q1.ko!.label).toBe('Ćwierćfinał 1')
    expect(ko.find((m) => m.id === koId('c1', 'T1-P1'))!.ko!.label).toBe('Finał')
  })

  it('adds a 4-team tier for a lone 7th place (trójki)', () => {
    const s = finishedGroups()
    const ko = createKnockout(s, 'c2', opts)
    expect(ko).toHaveLength(40)
    expect(ko.filter((m) => m.ko!.tierFrom === 25).map((m) => m.ko!.label).sort()).toEqual(
      ['Miejsca 25–28, mecz 1', 'Miejsca 25–28, mecz 2', 'O 25. miejsce', 'O 27. miejsce'])
  })

  it('schedules round by round and plays the final last', () => {
    const ko = createKnockout(finishedGroups(), 'c1', opts)
    const at = (r: string) => ko.filter((m) => m.ko!.round === r).map((m) => m.start)
    expect(at('QF').every((t) => at('SF').every((u) => t < u))).toBe(true)
    expect(at('SF').every((t) => at('P').every((u) => t < u))).toBe(true)
    const last = [...ko].sort((a, b) => a.start.localeCompare(b.start) || a.court - b.court).at(-1)!
    expect(last.ko!.place).toBe(1)
  })

  it('moves winners and losers on to the right matches', () => {
    let s = finishedGroups()
    s = { ...s, matches: [...s.matches, ...createKnockout(s, 'c1', opts)] }
    const apply = (key: string, f: (m: Match) => Match) => {
      const changed = new Map(applyMatchUpdate(s, koId('c1', key), f).map((m) => [m.id, m]))
      s = { ...s, matches: s.matches.map((m) => changed.get(m.id) ?? m) }
    }
    const get = (key: string) => s.matches.find((m) => m.id === koId('c1', key))!
    apply('T1-Q1', win); apply('T1-Q2', lose); apply('T1-Q3', win); apply('T1-Q4', win)
    expect([get('T1-W1').teamA, get('T1-W1').teamB]).toEqual([get('T1-Q1').teamA, get('T1-Q2').teamB])
    expect([get('T1-L1').teamA, get('T1-L1').teamB]).toEqual([get('T1-Q1').teamB, get('T1-Q2').teamA])
    apply('T1-W1', win); apply('T1-W2', lose); apply('T1-L1', win); apply('T1-L2', win)
    expect([get('T1-P1').teamA, get('T1-P1').teamB]).toEqual([get('T1-W1').teamA, get('T1-W2').teamB])
    expect([get('T1-P3').teamA, get('T1-P3').teamB]).toEqual([get('T1-W1').teamB, get('T1-W2').teamA])
    expect([get('T1-P5').teamA, get('T1-P5').teamB]).toEqual([get('T1-L1').teamA, get('T1-L2').teamA])
    expect([get('T1-P7').teamA, get('T1-P7').teamB]).toEqual([get('T1-L1').teamB, get('T1-L2').teamB])
  })

  it('does not change a match that has already started', () => {
    let s = finishedGroups()
    s = { ...s, matches: [...s.matches, ...createKnockout(s, 'c1', opts)] }
    const sf = koId('c1', 'T1-W1')
    s = { ...s, matches: s.matches.map((m) => (m.id === sf ? { ...m, status: 'live' as const, teamA: 'x', teamB: 'y' } : m)) }
    expect(applyMatchUpdate(s, koId('c1', 'T1-Q1'), win).find((m) => m.id === sf)).toBeUndefined()
  })

  it('shows group places, not team names, until the group has finished', () => {
    const s = drawnState(rng(5))
    const slots = bracketView(s, 'c1')!
    expect(slots.every((x) => !x.match.teamA && !x.match.teamB)).toBe(true)
    // Finish only group A: its places fill in, the others stay empty.
    const [A] = s.groups.filter((g) => g.categoryId === 'c1')
    const partly = { ...s, matches: s.matches.map((m) => (m.groupId === A.id ? { ...m, status: 'finished' as const, sets: [{ a: 15, b: 9 }] } : m)) }
    const q1 = bracketView(partly, 'c1')!.find((x) => x.match.id === koId('c1', 'T1-Q1'))!.match
    expect(q1.teamA).not.toBe('')
    expect(q1.teamB).toBe('')
  })

  it('shows a projected bracket before it is created', () => {
    const slots = bracketView(drawnState(rng(3)), 'c2')!
    expect(slots).toHaveLength(40)
    expect(slots.every((x) => x.projected)).toBe(true)
  })
})
