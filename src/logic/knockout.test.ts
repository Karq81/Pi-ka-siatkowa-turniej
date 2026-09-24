import { describe, expect, it } from 'vitest'
import type { Match, State } from '../types'
import { demoState } from './demo'
import { applyMatchUpdate, bracketView, createKnockout, koId } from './knockout'
import { standings } from './scoring'

/** Demo tournament with every group match finished (team A always wins 2:0). */
function finishedGroups(): State {
  const s = demoState()
  return {
    ...s,
    matches: s.matches.map((m) => ({ ...m, status: 'finished' as const, sets: [{ a: 25, b: 10 }, { a: 25, b: 12 }] })),
  }
}

const win = (m: Match): Match => ({ ...m, status: 'finished', sets: [{ a: 25, b: 20 }, { a: 25, b: 20 }] })
const lose = (m: Match): Match => ({ ...m, status: 'finished', sets: [{ a: 20, b: 25 }, { a: 20, b: 25 }] })

describe('knockout', () => {
  it('seeds quarter-finals crosswise from the group tables', () => {
    const s = finishedGroups()
    const [A, B] = s.groups.filter((g) => g.categoryId === 'c1')
    const top = (g: typeof A, i: number) => standings(s.tournament.rules, g, s.matches, s.teams)[i].teamId
    const ko = createKnockout(s, 'c1', { start: '2026-10-25T12:00', slotMinutes: 30, courts: [1, 2, 3, 4] })
    expect(ko).toHaveLength(8)
    const qf1 = ko.find((m) => m.id === koId('c1', 'QF1'))!
    expect([qf1.teamA, qf1.teamB]).toEqual([top(A, 0), top(B, 1)])
    const sf1 = ko.find((m) => m.id === koId('c1', 'SF1'))!
    expect([sf1.teamA, sf1.teamB]).toEqual(['', ''])
    // QFs in the first slot on 4 courts, SFs next, final + 3rd place after.
    expect(ko.map((m) => `${m.ko!.round}@${m.start.slice(11)}#${m.court}`)).toEqual([
      'QF@12:00#1', 'QF@12:00#2', 'QF@12:00#3', 'QF@12:00#4',
      'SF@12:30#1', 'SF@12:30#2', 'F@13:00#1', '3P@13:00#2',
    ])
  })

  it('fills later rounds as results come in', () => {
    let s = finishedGroups()
    s = { ...s, matches: [...s.matches, ...createKnockout(s, 'c1', { start: '2026-10-25T12:00', slotMinutes: 30, courts: [1, 2, 3, 4] })] }
    const apply = (id: string, f: (m: Match) => Match) => {
      const changed = new Map(applyMatchUpdate(s, koId('c1', id), f).map((m) => [m.id, m]))
      s = { ...s, matches: s.matches.map((m) => changed.get(m.id) ?? m) }
    }
    const get = (id: string) => s.matches.find((m) => m.id === koId('c1', id))!
    apply('QF1', win)
    expect(get('SF1').teamA).toBe(get('QF1').teamA)
    expect(get('SF1').teamB).toBe('')
    apply('QF2', lose)
    expect(get('SF1').teamB).toBe(get('QF2').teamB)
    apply('QF3', win); apply('QF4', win)
    apply('SF1', win); apply('SF2', lose)
    expect([get('F').teamA, get('F').teamB]).toEqual([get('SF1').teamA, get('SF2').teamB])
    expect([get('3P').teamA, get('3P').teamB]).toEqual([get('SF1').teamB, get('SF2').teamA])
  })

  it('does not change a match that has already started', () => {
    let s = finishedGroups()
    s = { ...s, matches: [...s.matches, ...createKnockout(s, 'c1', { start: '2026-10-25T12:00', slotMinutes: 30, courts: [1, 2, 3, 4] })] }
    const sf = koId('c1', 'SF1')
    s = { ...s, matches: s.matches.map((m) => (m.id === sf ? { ...m, status: 'live' as const, teamA: 'x', teamB: 'y' } : m)) }
    const changed = applyMatchUpdate(s, koId('c1', 'QF1'), win)
    expect(changed.find((m) => m.id === sf)).toBeUndefined()
  })

  it('shows a projected bracket before it is created', () => {
    const slots = bracketView(demoState(), 'c2')!
    expect(slots).toHaveLength(8)
    expect(slots.every((x) => x.projected)).toBe(true)
    expect(slots[0].match.teamA).not.toBe('')
  })
})
