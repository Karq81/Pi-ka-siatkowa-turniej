import { describe, expect, it } from 'vitest'
import type { Match, State } from '../types'
import { courtBoard, isUnderway } from './courtBoard'
import { defaultRules } from './demo'

const m = (id: string, start: string, extra: Partial<Match> = {}): Match => ({
  id, categoryId: 'c', groupId: 'g', court: 1, start, teamA: 'a', teamB: 'b', sets: [], status: 'scheduled', updatedAt: 0, ...extra,
})
const state = (matches: Match[]): State => ({
  tournament: { name: '', subtitle: '', courts: 1, rules: defaultRules }, categories: [], groups: [], teams: [], matches,
})
const t = (hhmm: string) => new Date(`2026-10-23T${hhmm}`).getTime()

describe('court board', () => {
  const first = m('m1', '2026-10-23T15:30')
  const second = m('m2', '2026-10-23T16:10')

  it('shows the next match before its start time', () => {
    const b = courtBoard(state([first, second]), 1, t('15:00'))
    expect([b.mode, b.match?.id]).toEqual(['next', 'm1'])
  })

  it('says "Trwa" from the start time, even if nobody pressed start', () => {
    expect(isUnderway(first, t('15:30'))).toBe(true)
    const b = courtBoard(state([first, second]), 1, t('15:31'))
    expect([b.mode, b.match?.id, b.next?.id]).toEqual(['live', 'm1', 'm2'])
  })

  it('keeps the result until 5 minutes before the next match', () => {
    const done = { ...first, status: 'finished' as const, sets: [{ a: 15, b: 9 }] }
    expect(courtBoard(state([done, second]), 1, t('15:50')).mode).toBe('finished')
    expect(courtBoard(state([done, second]), 1, t('16:04')).mode).toBe('finished')
    const b = courtBoard(state([done, second]), 1, t('16:05'))
    expect([b.mode, b.match?.id]).toEqual(['next', 'm2'])
    expect(courtBoard(state([done, second]), 1, t('16:10')).mode).toBe('live')
  })

  it('keeps the last result on show when the court has no more matches', () => {
    const done = { ...second, status: 'finished' as const, sets: [{ a: 9, b: 15 }] }
    const b = courtBoard(state([{ ...first, status: 'finished', sets: [{ a: 15, b: 3 }] }, done]), 1, t('20:00'))
    expect([b.mode, b.match?.id]).toEqual(['finished', 'm2'])
  })

  it('does not treat knockout matches without teams as being played', () => {
    expect(isUnderway({ ...first, teamB: '' }, t('16:00'))).toBe(false)
  })
})
