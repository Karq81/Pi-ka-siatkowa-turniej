import type { Match, Pins, Session, State } from '../types'

export interface SyncInfo {
  /** 'local' = data only in this browser; 'online' = shared database. */
  mode: 'local' | 'online'
  /** Online mode: false while there is no connection (writes are queued). */
  connected: boolean
  /** Online mode: some changes are still waiting to be sent. */
  pending: boolean
  /** Online mode: the tournament has not been set up in the database yet. */
  empty: boolean
  error: string | null
}

/**
 * Data layer used by all views. Two implementations: local (browser only,
 * for trying things out) and Firebase (shared, live, works offline).
 */
export interface Store {
  get(): State
  sync(): SyncInfo
  subscribe(fn: () => void): () => void
  session(): Session | null
  /**
   * Checks a key and remembers the session on this device. The admin PIN always works;
   * with `court`, that court's key works too.
   */
  login(pin: string, court?: number): Promise<boolean>
  logout(): void
  updateMatch(id: string, update: (m: Match) => Match): void
  /** Admin: replace the whole tournament (teams, groups, schedule). */
  replace(state: State): Promise<void>
  /** Admin: change tournament settings only. */
  updateTournament(patch: Partial<State['tournament']>): void
  /** Admin: read the current keys (null if not set or not allowed). */
  getPins(): Promise<Pins | null>
  /** Admin: save keys. The first call on an empty online database sets them up. */
  setPins(pins: Pins): Promise<void>
  clearError(): void
}
