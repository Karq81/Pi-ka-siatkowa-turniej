import { describe, expect, it } from 'vitest'
import { loginProblem, normalizeLogin } from './login'

describe('organiser logins', () => {
  it('turns what people type into a valid login', () => {
    expect(normalizeLogin(' Krzysiek Łódź ')).toBe('krzysiek-lodz')
    expect(normalizeLogin('OptyMielno')).toBe('optymielno')
    expect(normalizeLogin('Żółć')).toBe('zolc')
    expect(normalizeLogin('Jan.Kowalski@Gmail.com ')).toBe('jan.kowalski@gmail.com')
    expect(normalizeLogin('optymielno')).toBe('optymielno')
  })

  it('says what is wrong', () => {
    expect(loginProblem('')).toBe('empty')
    expect(loginProblem('ab')).toBe('short')
    expect(loginProblem('a'.repeat(31))).toBe('long')
    expect(loginProblem('uks!mielno')).toBe('chars')
    expect(loginProblem('jan@gmail')).toBe('email')
    expect(loginProblem('UKS Opty Mielno')).toBeNull()
    expect(loginProblem('jan@gmail.com')).toBeNull()
  })
})
