import { describe, expect, it } from 'vitest'
import { tournamentUnderway } from './underway'
import type { Match } from '../types'

const m = (start: string, status: Match['status'] = 'scheduled', extra: Partial<Match> = {}): Match =>
  ({ id: start, categoryId: 'c', groupId: 'g', court: 1, start, teamA: 'a', teamB: 'b', sets: [], status, updatedAt: 0, ...extra })
const at = (s: string) => new Date(s)

describe('tournamentUnderway', () => {
  const ms = [m('2026-10-23T15:30'), m('2026-10-24T09:30')]
  it('is not on before the first match', () => expect(tournamentUnderway(ms, at('2026-10-23T15:29'))).toBe(false))
  it('is on from the first match time', () => expect(tournamentUnderway(ms, at('2026-10-23T15:30'))).toBe(true))
  it('is on overnight between days', () => expect(tournamentUnderway(ms, at('2026-10-24T02:00'))).toBe(true))
  it('is on early when a match is already live', () => expect(tournamentUnderway([m('2026-10-23T15:30', 'live')], at('2026-10-23T10:00'))).toBe(true))
  it('is off when every match is finished', () => expect(tournamentUnderway([m('2026-10-23T15:30', 'finished'), m('2026-10-24T09:30', 'finished', { })], at('2026-10-24T20:00'))).toBe(false))
  it('ignores matches left out', () => expect(tournamentUnderway([m('2026-10-23T15:30', 'finished'), m('2026-10-24T09:30', 'scheduled', { skipped: true })], at('2026-10-24T20:00'))).toBe(false))
  it('is off with no matches', () => expect(tournamentUnderway([], at('2026-10-24T20:00'))).toBe(false))
})
