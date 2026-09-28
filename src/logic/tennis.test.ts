import { describe, expect, it } from 'vitest'
import { sportById, sportRules } from './sports'
import { addTennisPoint, gameText, inTieBreak, isGameSet } from './tennis'
import type { SetScore } from '../types'

const rules = sportRules(sportById('tenis'), '2z3')
const pts = (s: SetScore, seq: string) => [...seq].reduce((x, c) => addTennisPoint(rules, 0, x, c as 'a' | 'b'), s)

describe('tennis point by point', () => {
  it('counts 15, 30, 40 and wins the game', () => {
    let s: SetScore = { a: 0, b: 0 }
    s = pts(s, 'aab')
    expect(gameText(rules, 0, s)).toBe('30:15')
    s = pts(s, 'aa')
    expect([s.a, s.b, s.game]).toEqual([1, 0, undefined])
  })

  it('deuce and advantage', () => {
    let s = pts({ a: 0, b: 0 }, 'aaabbb')
    expect(gameText(rules, 0, s)).toBe('40:40')
    s = pts(s, 'a')
    expect(gameText(rules, 0, s)).toBe('A:40')
    s = pts(s, 'b')
    expect(gameText(rules, 0, s)).toBe('40:40')
    s = pts(s, 'bb')
    expect([s.a, s.b]).toEqual([0, 1])
  })

  it('tie-break at 6:6 to 7 with a lead of 2 gives 7:6', () => {
    let s: SetScore = { a: 6, b: 6 }
    expect(inTieBreak(rules, 0, s)).toBe(true)
    s = pts(s, 'aaaaaabbbbbb')
    expect(gameText(rules, 0, s)).toBe('6:6')
    s = pts(s, 'aa')
    expect([s.a, s.b]).toEqual([7, 6])
    expect(addTennisPoint(rules, 0, s, 'b')).toBe(s)
  })

  it('a super tie-break deciding set is counted in points', () => {
    const stb = sportRules(sportById('tenis'), '2z3-stb')
    expect(isGameSet(stb, 0)).toBe(true)
    expect(isGameSet(stb, 2)).toBe(false)
  })
})
