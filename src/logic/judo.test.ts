import { describe, expect, it } from 'vitest'
import { judoAdd, judoLine, judoOf, judoResult, judoSet, judoStopped, osaekomiScore, technicalPoints } from './judo'
import type { JudoScore } from '../types'

const start = (): JudoScore => judoOf(undefined)
const add = (j: JudoScore, ...moves: [('a' | 'b'), ('ippon' | 'wazaari' | 'yuko' | 'shido')][]) =>
  moves.reduce((x, [s, a]) => judoAdd(x, s, a, 1), j)

describe('judo scoring (IJF 2025)', () => {
  it('ippon ends the contest at once', () => {
    const j = add(start(), ['b', 'ippon'])
    expect(judoResult(j)).toEqual({ winner: 'b', by: 'ippon' })
    expect(judoStopped(j)).toBe(true)
    expect(add(j, ['a', 'wazaari'])).toBe(j)
  })

  it('two waza-ari make ippon, yuko never add up', () => {
    const j = add(start(), ['a', 'wazaari'], ['a', 'wazaari'])
    expect(judoResult(j)?.by).toBe('ippon')
    expect(technicalPoints(j.a)).toBe(100)
    const y = add(start(), ...Array.from({ length: 15 }, () => ['a', 'yuko'] as ['a', 'yuko']), ['b', 'wazaari'])
    expect(judoResult(y)).toEqual({ winner: 'b', by: 'waza-ari' })
  })

  it('yuko decides only when waza-ari are level', () => {
    const j = add(start(), ['a', 'wazaari'], ['b', 'wazaari'], ['b', 'yuko'])
    expect(judoResult(j)).toEqual({ winner: 'b', by: 'yuko' })
    expect(judoStopped(j)).toBe(false)
  })

  it('shido do not decide, the third is hansoku-make', () => {
    const j = add(start(), ['a', 'shido'], ['a', 'shido'])
    expect(judoResult(j)).toBeNull()
    expect(judoResult(add(j, ['a', 'shido']))).toEqual({ winner: 'b', by: 'hansoku-make' })
  })

  it('golden score: the first score wins and stops the contest', () => {
    const j = { ...start(), golden: true }
    expect(judoStopped(j)).toBe(false)
    expect(judoStopped(add(j, ['a', 'yuko']))).toBe(true)
  })

  it('a decision (hantei, kiken) wins', () => {
    expect(judoResult({ ...start(), decision: 'a' })).toEqual({ winner: 'a', by: 'decyzja' })
  })

  it('osaekomi times', () => {
    expect(osaekomiScore(4.9)).toBeNull()
    expect(osaekomiScore(5)).toBe('yuko')
    expect(osaekomiScore(10)).toBe('wazaari')
    expect(osaekomiScore(20)).toBe('ippon')
  })

  it('stores technical points for tables and shows a scoreboard line', () => {
    const s = judoSet(add(start(), ['a', 'wazaari'], ['a', 'yuko'], ['b', 'yuko']))
    expect([s.a, s.b]).toEqual([11, 1])
    expect(judoLine(s)).toBe('W1 Y1 : Y1')
    expect(judoLine(judoSet({ ...add(start(), ['b', 'ippon']), golden: true }))).toBe('0 : I (GS)')
  })

  it('can take back a mistake, never below zero', () => {
    const j = add(start(), ['a', 'yuko'])
    expect(judoAdd(judoAdd(j, 'a', 'yuko', -1), 'a', 'yuko', -1).a.yuko).toBe(0)
  })
})
