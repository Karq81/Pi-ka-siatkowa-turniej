import { describe, expect, it } from 'vitest'
import { initialState } from './demo'
import { laterPhaseStarted, refreshedNextPhase } from './phases'
import { endGroupPhase, stage2Groups } from './stage2'
import type { State } from '../types'

/* Moving on to the next phase: a first-stage result can be undone only until the next phase starts. */

function played(): State {
  const s = initialState()
  const order = new Map(s.teams.map((t, i) => [t.id, i]))
  return {
    ...s,
    matches: s.matches.map((m) => m.categoryId !== 'c1' ? m : {
      ...m, status: 'finished' as const,
      sets: [order.get(m.teamA)! < order.get(m.teamB)! ? { a: 15, b: 10 } : { a: 10, b: 15 }],
    }),
  }
}

describe('phases', () => {
  it('second stage declared, not started: a first-stage correction remakes it; started: the result is locked', () => {
    let s = endGroupPhase(played(), 'c1')
    const g = s.groups.find((x) => x.categoryId === 'c1' && !stage2Groups(s, 'c1').includes(x))!
    const first = s.matches.find((m) => m.groupId === g.id)!
    expect(laterPhaseStarted(s, first)).toHaveLength(0)
    // The winner of a first-stage match changes: the second stage is made again from the new tables.
    const flipped: State = { ...s, matches: s.matches.map((m) => (m.id === first.id ? { ...m, sets: [{ a: m.sets[0].b, b: m.sets[0].a }] } : m)) }
    const remade = refreshedNextPhase(flipped, first)
    expect(remade).not.toBeNull()
    expect(stage2Groups(remade!, 'c1').length).toBe(stage2Groups(s, 'c1').length)
    // One second-stage match played: the first stage is locked, and nothing is remade any more.
    const s2 = s.matches.find((m) => stage2Groups(s, 'c1').some((x) => x.id === m.groupId))!
    s = { ...s, matches: s.matches.map((m) => (m.id === s2.id ? { ...m, status: 'finished' as const, sets: [{ a: 15, b: 5 }] } : m)) }
    expect(laterPhaseStarted(s, first).map((m) => m.id)).toEqual([s2.id])
    expect(refreshedNextPhase(s, first)).toBeNull()
  })
})
