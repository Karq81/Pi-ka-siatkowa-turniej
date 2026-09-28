/** Organiser account logins: letters, digits, dot, hyphen, underscore; 3–30 characters. */
export const LOGIN_PATTERN = /^[a-z0-9][a-z0-9._-]{2,29}$/

/**
 * The login as stored: lowercase, Polish (and other) letters without their marks, spaces as
 * hyphens. "Krzysiek Łódź" → "krzysiek-lodz". The same when signing in, so a login typed the
 * way it was first written always works. E-mail addresses are only trimmed and lowercased.
 */
export function normalizeLogin(raw: string): string {
  const l = raw.trim().toLowerCase()
  if (l.includes('@')) return l.replace(/\s+/g, '')
  return l.replace(/ł/g, 'l').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-')
}

/** Whether a login (as typed) can be used: a valid login after normalizing, or an e-mail. */
export function loginProblem(raw: string): 'empty' | 'short' | 'long' | 'chars' | 'email' | null {
  const l = normalizeLogin(raw)
  if (!l) return 'empty'
  if (l.includes('@')) return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(l) ? null : 'email'
  if (l.length < 3) return 'short'
  if (l.length > 30) return 'long'
  return LOGIN_PATTERN.test(l) ? null : 'chars'
}

