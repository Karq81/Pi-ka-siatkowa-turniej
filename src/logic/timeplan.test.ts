import { describe, expect, it } from 'vitest'
import { buildGroupSchedule, nextSlot, retimeSchedule } from './schedule'
import type { Group } from '../types'

const g = (id: string, n: number): Group => ({ id, categoryId: 'k', name: id, teamIds: Array.from({ length: n }, (_, i) => `${id}${i + 1}`) })
const base = { courts: 3, start: '2026-05-09T09:00', slotMinutes: 30, dayEnd: '16:00', dayStart: '09:00' }

describe('time planning', () => {
  it('skips a lunch break and rolls to the next morning after the day ends', () => {
    const breaks = [{ from: '12:00', to: '13:00' }]
    expect(nextSlot('2026-05-09T11:30', { ...base, breaks })).toBe('2026-05-09T13:00')
    expect(nextSlot('2026-05-09T11:00', { ...base, breaks })).toBe('2026-05-09T11:30')
    expect(nextSlot('2026-05-09T16:00', base)).toBe('2026-05-10T09:00')
  })

  it('no match starts in the break', () => {
    const ms = buildGroupSchedule([g('A', 6), g('B', 6)], { ...base, breaks: [{ from: '12:00', to: '13:00' }] })
    expect(ms.some((m) => m.start.slice(11) >= '12:00' && m.start.slice(11) < '13:00')).toBe(false)
    expect(ms).toHaveLength(30)
  })

  it('every team rests at least one round between its matches', () => {
    const ms = buildGroupSchedule([g('A', 6), g('B', 6)], { ...base, courts: 4, rest: 1 })
    expect(ms).toHaveLength(30)
    const rounds = [...new Set(ms.map((m) => m.start))].sort()
    const byTeam = new Map<string, number[]>()
    for (const m of ms) for (const id of [m.teamA, m.teamB]) byTeam.set(id, [...(byTeam.get(id) ?? []), rounds.indexOf(m.start)])
    for (const list of byTeam.values()) {
      const r = list.sort((a, b) => a - b)
      for (let i = 1; i < r.length; i++) expect(r[i] - r[i - 1]).toBeGreaterThanOrEqual(2)
    }
  })

  it('re-timing keeps the break', () => {
    const ms = buildGroupSchedule([g('A', 5)], { ...base, courts: 1 })
    const again = retimeSchedule(ms, { slotMinutes: 45, dayEnd: '16:00', dayStart: '09:00', breaks: [{ from: '12:00', to: '13:00' }] })
    expect(again.some((m) => m.start.slice(11) >= '12:00' && m.start.slice(11) < '13:00')).toBe(false)
  })
})
