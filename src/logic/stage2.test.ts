import { describe, expect, it } from 'vitest'
import { initialState } from './demo'
import { buildStage2, endGroupPhase, endStage2, finalRanking, openFirstStage, openFirstStageMatches, openStage2Matches, removeStage2, reopenGroupPhase, stage2Groups, stage2Ranking } from './stage2'
import { standings } from './scoring'
import type { State } from '../types'

/** Albatros CUP with every Dwójki group match played: the team listed earlier wins 15:10. */
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

describe('Albatros CUP second stage', () => {
  it('ranks by group place, then points, sets and small points', () => {
    const s = played()
    expect(openFirstStage(s, 'c1')).toBe(0)
    const rank = stage2Ranking(s, 'c1')
    expect(rank).toHaveLength(28)
    const groups = s.groups.filter((g) => g.categoryId === 'c1')
    const placeOf = (id: string) => {
      for (const g of groups) {
        const i = standings(s.tournament.rules, g, s.matches, s.teams).findIndex((r) => r.teamId === id)
        if (i >= 0) return i + 1
      }
      return 0
    }
    // Places never go down the list: all winners first, then all 2nd places…
    const places = rank.map(placeOf)
    expect(places).toEqual([...places].sort((a, b) => a - b))
    expect(places.slice(0, 4)).toEqual([1, 1, 1, 1])
  })

  it('makes groups 5–8 of 7 teams, each on its own court after the group phase', () => {
    const s = played()
    const next = buildStage2(s, 'c1')
    const g2 = stage2Groups(next, 'c1')
    expect(g2.map((g) => g.name)).toEqual(['Grupa 5 (finałowa)', 'Grupa 6', 'Grupa 7', 'Grupa 8'])
    expect(g2.map((g) => g.teamIds.length)).toEqual([7, 7, 7, 7])
    expect(new Set(g2.flatMap((g) => g.teamIds)).size).toBe(28)
    const ms = next.matches.filter((m) => g2.some((g) => g.id === m.groupId))
    expect(ms).toHaveLength(4 * 21)
    expect(new Set(ms.map((m) => m.id)).size).toBe(84)
    expect(new Set(ms.map((m) => m.court))).toEqual(new Set([1, 2, 3, 4]))
    const lastFirst = s.matches.filter((m) => m.categoryId === 'c1').map((m) => m.start).sort().at(-1)!
    expect(ms.every((m) => m.start > lastFirst)).toBe(true)
    // Trójki untouched; made again replaces, undo removes.
    expect(next.matches.filter((m) => m.categoryId === 'c2')).toEqual(s.matches.filter((m) => m.categoryId === 'c2'))
    expect(stage2Groups(buildStage2(next, 'c1'), 'c1')).toHaveLength(4)
    expect(removeStage2(next, 'c1').matches).toHaveLength(s.matches.length)
  })

  it('trójki: groups 6–10 of 6 teams', () => {
    const s = initialState()
    const g2 = stage2Groups(buildStage2(s, 'c2'), 'c2')
    expect(g2.map((g) => g.teamIds.length)).toEqual([6, 6, 6, 6, 6])
  })

  it('ends the group phase with a match left, then the second stage: final places 1–28', () => {
    const s = played()
    const one = s.matches.find((m) => m.categoryId === 'c1')!.id
    const left = { ...s, matches: s.matches.map((m) => (m.id === one ? { ...m, status: 'scheduled' as const, sets: [] } : m)) }
    expect(openFirstStageMatches(left, 'c1')).toHaveLength(1)
    const ended = endGroupPhase(left, 'c1')
    expect(openFirstStageMatches(ended, 'c1')).toHaveLength(0)
    expect(ended.matches.filter((m) => m.skipped)).toHaveLength(1)
    expect(stage2Groups(ended, 'c1')).toHaveLength(4)
    expect(ended.tournament.phases?.c1?.groupsEnded).toBe(true)
    // Undo: the match is back, no second stage.
    const back = reopenGroupPhase(ended, 'c1')
    expect(openFirstStageMatches(back, 'c1')).toHaveLength(1)
    expect(stage2Groups(back, 'c1')).toHaveLength(0)
    // Second stage: all but one played, then ended.
    const order = new Map(ended.teams.map((t, i) => [t.id, i]))
    const ids = new Set(stage2Groups(ended, 'c1').map((g) => g.id))
    let n = 0
    const s2 = { ...ended, matches: ended.matches.map((m) => (!ids.has(m.groupId) || n++ === 0 ? m : { ...m, status: 'finished' as const, sets: [order.get(m.teamA)! < order.get(m.teamB)! ? { a: 15, b: 9 } : { a: 9, b: 15 }] })) }
    expect(openStage2Matches(s2, 'c1')).toHaveLength(1)
    const done = endStage2(s2, 'c1')
    expect(openStage2Matches(done, 'c1')).toHaveLength(0)
    const final = finalRanking(done, 'c1')
    expect(final.map((r) => r.place)).toEqual(Array.from({ length: 28 }, (_, i) => i + 1))
    expect(new Set(final.map((r) => r.teamId)).size).toBe(28)
  })
})
