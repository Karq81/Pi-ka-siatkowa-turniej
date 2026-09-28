import { t, tk } from '../i18n'
import type { ChessEnd, SetScore } from '../types'

/**
 * Chess: a game ends 1–0, ½–½ or 0–1 (a and b hold 1, 0.5 or 0); the table gives the same
 * points. How it ended is kept for the record: mat, czas (flag fell), poddanie (resignation),
 * pat (stalemate), remis (agreement, repetition, 50 moves), walkower (no-show).
 */
export const CHESS_ENDS: { id: ChessEnd; label: string; draw: boolean }[] = [
  { id: 'mat', label: tk('Mat'), draw: false },
  { id: 'poddanie', label: tk('Poddanie'), draw: false },
  { id: 'czas', label: tk('Przekroczenie czasu'), draw: false },
  { id: 'walkower', label: tk('Walkower'), draw: false },
  { id: 'pat', label: tk('Pat'), draw: true },
  { id: 'remis', label: tk('Remis (zgoda, powtórzenie, 50 ruchów)'), draw: true },
]

export function chessSet(result: 'a' | 'b' | 'remis', end?: ChessEnd): SetScore {
  const s: SetScore = result === 'a' ? { a: 1, b: 0 } : result === 'b' ? { a: 0, b: 1 } : { a: 0.5, b: 0.5 }
  return end ? { ...s, chess: end } : s
}

/** "1–0", "½–½", "0–1". */
export function chessText(s: SetScore): string {
  const f = (x: number) => (x === 0.5 ? '½' : String(x))
  return `${f(s.a)}–${f(s.b)}`
}

export function chessEndName(end: ChessEnd | undefined): string {
  const e = CHESS_ENDS.find((x) => x.id === end)
  return e ? t(e.label) : ''
}
