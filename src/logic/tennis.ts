import type { Rules, SetScore } from '../types'
import { setCap, setTarget, setWinner } from './scoring'

/**
 * Tennis and padel, point by point: a game is won with 4 points and a lead of 2 (0, 15, 30,
 * 40, deuce, advantage); at 6:6 (or 3:3 in short sets) a tie-break to 7 with a lead of 2
 * decides the set 7:6. The set keeps games in a and b; the game in progress in `game`.
 * A super tie-break played as the deciding set counts points directly (no games).
 */

/** Whether set `index` is played in games (not a match tie-break counted in points). */
export function isGameSet(rules: Rules, index: number): boolean {
  return rules.unit === 'gemy' && setTarget(rules, index) === rules.setPoints
}

/** The set is at 6:6 (or 3:3): its last game is a tie-break. */
export function inTieBreak(rules: Rules, index: number, s: SetScore): boolean {
  const cap = setCap(rules, index)
  return !!cap && s.a === cap - 1 && s.b === cap - 1
}

/** One point for `side`; a won game (or tie-break) adds a game to the set. */
export function addTennisPoint(rules: Rules, index: number, s: SetScore, side: 'a' | 'b'): SetScore {
  if (setWinner(rules, index, s)) return s
  const other = side === 'a' ? 'b' : 'a'
  const g = { a: s.game?.a ?? 0, b: s.game?.b ?? 0 }
  g[side]++
  const target = inTieBreak(rules, index, s) ? 7 : 4
  if (g[side] >= target && g[side] - g[other] >= 2) {
    const { game: _done, ...rest } = s
    return { ...rest, [side]: s[side] + 1 }
  }
  return { ...s, game: g }
}

/** Takes the last point back within the game (a finished game is corrected with "−1 gem"). */
export function removeTennisPoint(s: SetScore, side: 'a' | 'b'): SetScore {
  const g = { a: s.game?.a ?? 0, b: s.game?.b ?? 0 }
  if (!g[side]) return s
  g[side]--
  return { ...s, game: g }
}

const CALLS = ['0', '15', '30', '40']

/** The game's score as called: "30:15", "40:40", "A:40"; tie-break points as numbers. */
export function gameText(rules: Rules, index: number, s: SetScore): string {
  const a = s.game?.a ?? 0
  const b = s.game?.b ?? 0
  if (inTieBreak(rules, index, s)) return `${a}:${b}`
  if (a >= 3 && b >= 3) return a === b ? '40:40' : a > b ? 'A:40' : '40:A'
  return `${CALLS[Math.min(a, 3)]}:${CALLS[Math.min(b, 3)]}`
}
