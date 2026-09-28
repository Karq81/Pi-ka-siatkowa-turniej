import type { FirebaseApp } from 'firebase/app'
import type { PublicBoard } from '../logic/publicBoard'
import type { Pins, SetScore } from '../types'

/**
 * Live scores through the Realtime Database. A point changes a few bytes there, and
 * Firebase bills the Realtime Database by data sent, not per document read, so fans
 * following every point cost next to nothing. Firestore keeps everything else (the
 * schedule, set and match results); see firebase.ts for which change goes where.
 *
 * Layout (see database.rules.json):
 *   pins/{t}               { admin, courts: { "1": key, … } }, a copy of the Firestore keys
 *   sessions/{t}/{uid}     { role, court?, pin }: a device's role, accepted when the key matches
 *   live/{t}/{court}/{id}  { sets, at }: the score of a match in progress, readable by all
 *   pins/{t}/stream        the camera apps' key, set by the chief referee, readable by referees
 *   board/{t}/{key}/{court} the court's scoreboard for camera apps (see logic/publicBoard.ts):
 *                          readable by whoever knows the key (the organiser's QR code), and
 *                          only while the organiser has turned the camera app on
 */
export interface LiveEntry {
  sets: SetScore[]
  /** When the score was sent (ms). */
  at: number
}

export interface LiveChannel {
  /** True once this device may write scores (its session is accepted). */
  canWrite(): boolean
  /** Follows the tournament's live scores; returns the unsubscribe function. */
  follow(onChange: (live: Map<string, LiveEntry>) => void): () => void
  /** Sends a score; `onRefused` runs when the database does not accept it (then use Firestore). */
  write(court: number, matchId: string, entry: LiveEntry, onRefused: () => void): void
  clear(court: number, matchId: string): void
  /** Publishes a court's scoreboard for camera apps under the organiser's key. */
  writeBoard(key: string, court: number, board: PublicBoard): void
  /** Follows the camera apps' key (null: turned off or not allowed); returns the unsubscribe function. */
  followStreamKey(onChange: (key: string | null) => void): () => void
  /** The chief referee: sets a new camera apps' key. */
  setStreamKey(key: string): Promise<boolean>
  /** The chief referee: removes all live scores of the tournament. */
  clearAll(): void
  /** Opens a session for this device; resolves to whether the key was accepted. */
  signIn(uid: string, role: 'admin' | 'court', pin: string, court?: number): Promise<boolean>
  /** Copies the keys (allowed when there are none yet, or for the admin). */
  copyPins(pins: Pins): Promise<boolean>
  /** Whether the server can be reached (false: the database does not exist or is full). */
  connected(): boolean
}

const TIMEOUT_MS = 8000

function withTimeout<T>(p: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  return Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))])
}

/** The Realtime Database of the app, or null when it is not configured. Loaded on demand. */
export async function openLive(app: FirebaseApp, tournamentId: string, emulator: boolean): Promise<LiveChannel | null> {
  if (!app.options.databaseURL) return null
  const { getDatabase, connectDatabaseEmulator, ref, onValue, set, remove, update } = await import('firebase/database')
  const db = getDatabase(app)
  if (emulator) connectDatabaseEmulator(db, '127.0.0.1', 9000)
  let writable = false
  let online = false
  onValue(ref(db, '.info/connected'), (snap) => { online = snap.val() === true })

  return {
    canWrite: () => writable,
    connected: () => online,
    follow(onChange) {
      return onValue(ref(db, `live/${tournamentId}`), (snap) => {
        const map = new Map<string, LiveEntry>()
        const courts = (snap.val() ?? {}) as Record<string, Record<string, LiveEntry>>
        for (const matches of Object.values(courts)) {
          for (const [id, e] of Object.entries(matches ?? {})) {
            if (e && Array.isArray(e.sets)) map.set(id, { sets: e.sets.map((s) => ({ ...s, a: Number(s.a) || 0, b: Number(s.b) || 0 })), at: Number(e.at) || 0 })
          }
        }
        onChange(map)
      }, () => onChange(new Map()))
    },
    write(court, matchId, entry, onRefused) {
      set(ref(db, `live/${tournamentId}/${court}/${matchId}`), { sets: entry.sets.map((s) => JSON.parse(JSON.stringify(s)) as SetScore), at: entry.at })
        .catch((e) => { console.warn('live write', e); writable = false; onRefused() })
    },
    writeBoard(key, court, board) {
      if (writable) set(ref(db, `board/${tournamentId}/${key}/${court}`), JSON.parse(JSON.stringify(board))).catch((e) => console.warn('board write', e))
    },
    followStreamKey(onChange) {
      return onValue(ref(db, `pins/${tournamentId}/stream`), (snap) => onChange(typeof snap.val() === 'string' ? snap.val() : null), () => onChange(null))
    },
    async setStreamKey(key) {
      try {
        await withTimeout(set(ref(db, `pins/${tournamentId}/stream`), key))
        return true
      } catch {
        return false
      }
    },
    clearAll() {
      if (writable) remove(ref(db, `live/${tournamentId}`)).catch(() => {})
    },
    clear(court, matchId) {
      if (writable) remove(ref(db, `live/${tournamentId}/${court}/${matchId}`)).catch(() => {})
    },
    async signIn(uid, role, pin, court) {
      try {
        await withTimeout(set(ref(db, `sessions/${tournamentId}/${uid}`), role === 'court' ? { role, court, pin } : { role, pin }))
        writable = true
      } catch {
        writable = false
      }
      return writable
    },
    async copyPins(pins) {
      try {
        // update, not set: the camera apps' key next to them stays
        await withTimeout(update(ref(db, `pins/${tournamentId}`), { admin: pins.adminPin, courts: pins.courts }))
        return true
      } catch {
        return false
      }
    },
  }
}

/**
 * The referee's own copy of the scores sent from this device, so points typed without
 * signal survive a reload of the page (the Realtime Database keeps unsent writes only in
 * memory). Cleared once the match is finished.
 */
const backupKey = (t: string, id: string) => `sla:live:${t}:${id}`

export function backupScore(t: string, id: string, entry: LiveEntry) {
  try { localStorage.setItem(backupKey(t, id), JSON.stringify(entry)) } catch { /* no storage */ }
}

export function dropBackup(t: string, id: string) {
  try { localStorage.removeItem(backupKey(t, id)) } catch { /* no storage */ }
}

export function backups(t: string): Map<string, LiveEntry> {
  const out = new Map<string, LiveEntry>()
  try {
    const prefix = `sla:live:${t}:`
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k?.startsWith(prefix)) continue
      const e = JSON.parse(localStorage.getItem(k) ?? 'null') as LiveEntry | null
      if (e && Array.isArray(e.sets)) out.set(k.slice(prefix.length), e)
    }
  } catch { /* no storage */ }
  return out
}
