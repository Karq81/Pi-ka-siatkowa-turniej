import { describe, expect, it } from 'vitest'
import type { Match, State } from '../types'
import { defaultRules } from './demo'
import { boardKey, publicBoard } from './publicBoard'

const m = (id: string, start: string, extra: Partial<Match> = {}): Match => ({
  id, categoryId: 'c', groupId: 'g', court: 1, start, teamA: 'a', teamB: 'b', sets: [], status: 'scheduled', updatedAt: 0, ...extra,
})
const state = (matches: Match[]): State => ({
  tournament: { name: 'Cup', subtitle: '', courts: 2, courtNames: ['A', 'B'], rules: { ...defaultRules, setsMode: 'bestOf', sets: 3, setPoints: 25, lastSetPoints: 15 } },
  categories: [{ id: 'c', name: 'U14' }],
  groups: [{ id: 'g', categoryId: 'c', name: 'Grupa A', teamIds: ['a', 'b'] }],
  teams: [{ id: 'a', name: 'Orły', categoryId: 'c' }, { id: 'b', name: 'Sokoły', categoryId: 'c' }],
  matches,
})
const t = (hhmm: string) => new Date(`2026-10-23T${hhmm}`).getTime()

describe('public board for camera apps', () => {
  it('shows the match in progress with sets won and the points of the current set', () => {
    const live = m('m1', '2026-10-23T10:00', { status: 'live', sets: [{ a: 25, b: 20 }, { a: 12, b: 14 }] })
    const b = publicBoard(state([live, m('m2', '2026-10-23T10:40')]), 1, t('10:30'))
    expect(b).toMatchObject({
      v: 1, tournament: 'Cup', court: 'A', status: 'live', stage: 'Grupa A · U14', a: 'Orły', b: 'Sokoły',
      setsA: 1, setsB: 0, pointsA: 12, pointsB: 14, scoring: 'sets', setsToWin: 2, setPoints: 25, lastSetPoints: 15,
    })
    expect(b.sets).toHaveLength(2)
    expect(b.next).toEqual({ a: 'Orły', b: 'Sokoły', start: '2026-10-23T10:40' })
  })

  it('says "next" for a match nobody started yet, even after its planned time', () => {
    const b = publicBoard(state([m('m1', '2026-10-23T10:00')]), 1, t('10:05'))
    expect([b.status, b.a, b.sets, b.pointsA]).toEqual(['next', 'Orły', [], 0])
  })

  it('keeps the final result on show, then an empty court says "none"', () => {
    const done = m('m1', '2026-10-23T10:00', { status: 'finished', sets: [{ a: 25, b: 20 }, { a: 25, b: 23 }], updatedAt: 5 })
    expect(publicBoard(state([done]), 1, t('11:00'))).toMatchObject({ status: 'finished', setsA: 2, setsB: 0 })
    expect(publicBoard(state([done]), 2, t('11:00'))).toMatchObject({ status: 'none', a: '', court: 'B' })
  })

  it('after a match, shows the next one with the last result', () => {
    const done = m('m1', '2026-10-23T10:00', { status: 'finished', sets: [{ a: 25, b: 20 }, { a: 20, b: 25 }, { a: 15, b: 9 }], updatedAt: 5 })
    const next = m('m2', '2026-10-23T10:40', { calledAt: 6 })
    const b = publicBoard(state([done, next]), 1, t('10:20'))
    expect([b.status, b.previous?.setsA, b.previous?.setsB, b.previous?.sets.length]).toEqual(['next', 2, 1, 3])
  })

  it('ignores the time when comparing boards', () => {
    const s = state([m('m1', '2026-10-23T10:00')])
    expect(boardKey(publicBoard(s, 1, 1))).toBe(boardKey(publicBoard(s, 1, 2)))
  })
})
