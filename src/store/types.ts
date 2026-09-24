import type { Match, Role, State } from '../types'

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
  role(): Role | null
  /** Checks the PIN and remembers the role on this device. */
  login(role: Role, pin: string): Promise<boolean>
  updateMatch(id: string, update: (m: Match) => Match): void
  /** Admin: replace the whole tournament (teams, groups, schedule). */
  replace(state: State): Promise<void>
  /** Admin: change tournament settings only. */
  updateTournament(patch: Partial<State['tournament']>): void
  /** Admin: set new PINs. First call on an empty online database creates the tournament. */
  setPins(adminPin: string, courtPin: string): Promise<void>
  clearError(): void
}
