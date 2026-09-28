import { t, tk } from '../i18n'
import type { JudoScore, JudoSide, SetScore } from '../types'

/**
 * Judo scoring (IJF rules from 2025):
 * - ippon ends the contest; two waza-ari make ippon (waza-ari awasete ippon);
 * - yuko (back since 2025) never adds up to waza-ari, it only counts when waza-ari are level;
 * - shido: the third one is hansoku-make, a loss; shido do not decide the result otherwise;
 * - level after regular time: golden score, the first score wins (penalties carry over);
 * - osaekomi (hold down): yuko from 5 s, waza-ari from 10 s, ippon at 20 s.
 * A contest is stored as one "set" whose `judo` holds the details.
 */

export type JudoAction = 'ippon' | 'wazaari' | 'yuko' | 'shido'
export type JudoWin = 'ippon' | 'waza-ari' | 'yuko' | 'hansoku-make' | 'decyzja'

export const OSAEKOMI = { yuko: 5, wazaari: 10, ippon: 20 }

const EMPTY: JudoSide = { ippon: 0, wazaari: 0, yuko: 0, shido: 0 }

export function judoOf(s: SetScore | undefined): JudoScore {
  const j = s?.judo
  return {
    a: { ...EMPTY, ...j?.a },
    b: { ...EMPTY, ...j?.b },
    ...(j?.golden ? { golden: true } : {}),
    ...(j?.decision ? { decision: j.decision } : {}),
  }
}

/** Whether a judoka has ippon (thrown for ippon, or two waza-ari). */
export function hasIppon(s: JudoSide): boolean {
  return s.ippon > 0 || s.wazaari >= 2
}

/** Technical points: 100 for ippon, 10 per waza-ari, 1 per yuko. */
export function technicalPoints(s: JudoSide): number {
  return hasIppon(s) ? 100 : s.wazaari * 10 + s.yuko
}

/** The contest as a set: technical points in a and b, the details in judo. */
export function judoSet(j: JudoScore): SetScore {
  return { a: technicalPoints(j.a), b: technicalPoints(j.b), judo: j }
}

/** Who won and how, or null while the contest is level (or still going). */
export function judoResult(j: JudoScore): { winner: 'a' | 'b'; by: JudoWin } | null {
  if (hasIppon(j.a)) return { winner: 'a', by: 'ippon' }
  if (hasIppon(j.b)) return { winner: 'b', by: 'ippon' }
  if (j.a.shido >= 3) return { winner: 'b', by: 'hansoku-make' }
  if (j.b.shido >= 3) return { winner: 'a', by: 'hansoku-make' }
  if (j.decision) return { winner: j.decision, by: 'decyzja' }
  if (j.a.wazaari !== j.b.wazaari) return { winner: j.a.wazaari > j.b.wazaari ? 'a' : 'b', by: 'waza-ari' }
  if (j.a.yuko !== j.b.yuko) return { winner: j.a.yuko > j.b.yuko ? 'a' : 'b', by: 'yuko' }
  return null
}

/** The contest stops at once: ippon, hansoku-make or a decision; in golden score, any score. */
export function judoStopped(j: JudoScore): boolean {
  const r = judoResult(j)
  if (!r) return false
  return r.by === 'ippon' || r.by === 'hansoku-make' || r.by === 'decyzja' || !!j.golden
}

const MAX: Record<JudoAction, number> = { ippon: 1, wazaari: 2, yuko: 99, shido: 3 }

/** Adds (or with -1 takes back) a score or a shido. Nothing is added once the contest stopped. */
export function judoAdd(j: JudoScore, side: 'a' | 'b', action: JudoAction, delta: 1 | -1): JudoScore {
  if (delta > 0 && judoStopped(j)) return j
  const cur = j[side][action]
  const next = Math.max(0, Math.min(MAX[action], cur + delta))
  if (next === cur) return j
  return { ...j, [side]: { ...j[side], [action]: next } }
}

/** What an osaekomi of `seconds` gives: null under 5 s. In golden score it ends with yuko at 5 s. */
export function osaekomiScore(seconds: number): Exclude<JudoAction, 'shido'> | null {
  if (seconds >= OSAEKOMI.ippon) return 'ippon'
  if (seconds >= OSAEKOMI.wazaari) return 'wazaari'
  if (seconds >= OSAEKOMI.yuko) return 'yuko'
  return null
}

const WIN_NAMES: Record<JudoWin, string> = {
  ippon: tk('Ippon'),
  'waza-ari': tk('Waza-ari'),
  yuko: tk('Yuko'),
  'hansoku-make': tk('Hansoku-make'),
  decyzja: tk('Decyzja sędziów'),
}

export function judoWinName(by: JudoWin): string {
  return t(WIN_NAMES[by])
}

/** One side like a judo scoreboard: "I", "W1 Y2", "0". */
export function judoSideText(s: JudoSide): string {
  if (hasIppon(s)) return 'I'
  const parts = [s.wazaari ? `W${s.wazaari}` : '', s.yuko ? `Y${s.yuko}` : ''].filter(Boolean)
  return parts.length ? parts.join(' ') : '0'
}

/** A contest in one line: "W1 Y2 : Y1", with golden score marked. */
export function judoLine(s: SetScore): string {
  const j = judoOf(s)
  return `${judoSideText(j.a)} : ${judoSideText(j.b)}${j.golden ? ' (GS)' : ''}`
}

/** "2:40" */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
