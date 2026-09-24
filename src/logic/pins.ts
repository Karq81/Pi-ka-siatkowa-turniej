import type { Pins, Session } from '../types'

function randomKey(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 9000
  return String(1000 + n)
}

/**
 * Keys for courts 1..count. Existing keys are kept unless listed in `renew`;
 * every key is unique and differs from the admin PIN.
 */
export function courtKeys(count: number, pins: Pins, renew: number[] = []): Record<string, string> {
  const result: Record<string, string> = {}
  const used = new Set([pins.adminPin])
  for (let c = 1; c <= count; c++) {
    const old = pins.courts[String(c)]
    if (old && !renew.includes(c) && !used.has(old)) {
      result[String(c)] = old
      used.add(old)
    }
  }
  for (let c = 1; c <= count; c++) {
    if (result[String(c)]) continue
    let key = randomKey()
    while (used.has(key)) key = randomKey()
    result[String(c)] = key
    used.add(key)
  }
  return result
}

export function canScore(session: Session | null, court: number): boolean {
  return !!session && (session.role === 'admin' || session.court === court)
}
