import { t, tk } from '../i18n'
import type { KarateScore, SetScore } from '../types'

/**
 * Karate kumite (WKF): yuko 1 point, waza-ari 2, ippon 3, added up. A lead of 8 points ends
 * the bout. At the end of time the higher score wins; level: whoever has senshu (the first
 * unopposed point), else the referees' decision (hantei). Penalties: chui 1–3, hansoku-chui,
 * then hansoku, a disqualification. A bout is stored as one set: a and b are the points.
 */

export const KARATE_LEAD = 8
export const PENALTIES = [tk('Chui 1'), tk('Chui 2'), tk('Chui 3'), tk('Hansoku-chui'), tk('Hansoku')]
export type KarateWin = 'przewaga' | 'punkty' | 'senshu' | 'hansoku' | 'decyzja'

export function karateOf(s: SetScore | undefined): KarateScore {
  const k = s?.karate
  return { pa: k?.pa ?? 0, pb: k?.pb ?? 0, ...(k?.senshu ? { senshu: k.senshu } : {}), ...(k?.decision ? { decision: k.decision } : {}) }
}

/** Who won and how. `timeUp`: the bout's time is over (points and senshu then decide). */
export function karateResult(s: SetScore, timeUp: boolean): { winner: 'a' | 'b'; by: KarateWin } | null {
  const k = karateOf(s)
  if (k.pa >= 5) return { winner: 'b', by: 'hansoku' }
  if (k.pb >= 5) return { winner: 'a', by: 'hansoku' }
  if (k.decision) return { winner: k.decision, by: 'decyzja' }
  if (s.a - s.b >= KARATE_LEAD) return { winner: 'a', by: 'przewaga' }
  if (s.b - s.a >= KARATE_LEAD) return { winner: 'b', by: 'przewaga' }
  if (!timeUp) return null
  if (s.a !== s.b) return { winner: s.a > s.b ? 'a' : 'b', by: 'punkty' }
  if (k.senshu) return { winner: k.senshu, by: 'senshu' }
  return null
}

/** The bout stops at once: 8 points lead, hansoku or a decision. */
export function karateStopped(s: SetScore): boolean {
  const r = karateResult(s, false)
  return !!r
}

/** Adds points to one side; the first score of the bout gives senshu (the referee can change it). */
export function karateAdd(s: SetScore, side: 'a' | 'b', points: number): SetScore {
  if (points > 0 && karateStopped(s)) return s
  const k = karateOf(s)
  const next = Math.max(0, s[side] + points)
  const first = s.a === 0 && s.b === 0 && points > 0
  return { ...s, [side]: next, karate: { ...k, ...(first && !k.senshu ? { senshu: side } : {}) } }
}

export function karatePenalty(s: SetScore, side: 'a' | 'b', delta: 1 | -1): SetScore {
  const k = karateOf(s)
  const key = side === 'a' ? 'pa' : 'pb'
  const v = Math.max(0, Math.min(5, k[key] + delta))
  if (delta > 0 && karateStopped(s)) return s
  return { ...s, karate: { ...k, [key]: v } }
}

const NAMES: Record<KarateWin, string> = {
  przewaga: tk('Przewaga 8 punktów'), punkty: tk('Na punkty'), senshu: tk('Senshu'), hansoku: tk('Hansoku (dyskwalifikacja)'), decyzja: tk('Decyzja sędziów'),
}
export function karateWinName(by: KarateWin): string {
  return t(NAMES[by])
}

/** The strongest penalty so far: "Chui 2", or nothing. */
export function penaltyName(n: number): string {
  return n > 0 ? t(PENALTIES[Math.min(n, 5) - 1]) : ''
}
