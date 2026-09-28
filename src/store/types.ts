import type { Entry, LiveClock, Match, Pins, Session, State, Team } from '../types'

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
  /** The referee: the court's game clock for the fans (null: stopped for good). */
  publishClock(court: number, clock: LiveClock | null): void
  /** The game clock on a court, as the referee last sent it. */
  clock(court: number): LiveClock | null
  /** Time (ms) that clocks are compared with: the server's where there is one. */
  now(): number
  /** Admin: replace the whole tournament (teams, groups, schedule). */
  replace(state: State): Promise<void>
  /** Admin: change tournament settings only. */
  updateTournament(patch: Partial<State['tournament']>): void
  /** Admin: read the current keys (null if not set or not allowed). */
  getPins(): Promise<Pins | null>
  /** Admin: save keys. The first call on an empty online database sets them up. */
  setPins(pins: Pins): Promise<void>
  /** The camera apps' key (SportCast), or null when turned off or not reachable. */
  cameraKey(): Promise<string | null>
  /** The chief referee: turns the camera apps on with a new key (the old one stops working). */
  newCameraKey(): Promise<string | null>
  /** Anyone: sends a sign-up (only while the organiser has sign-ups open). */
  submitEntry(entry: Omit<Entry, 'id' | 'status' | 'createdAt'>): Promise<void>
  /** Admin: the sign-ups, newest first. */
  listEntries(): Promise<Entry[]>
  setEntryStatus(id: string, status: Entry['status']): Promise<void>
  /** Admin: adds teams to the tournament (without drawing again). */
  addTeams(teams: Team[]): Promise<void>
  /** Whether a tournament with this address is already saved (for "Załóż turniej"). */
  tournamentExists(id: string): Promise<boolean>
  clearError(): void
}
