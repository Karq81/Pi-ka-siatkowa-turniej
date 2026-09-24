export type Id = string

/** Match rules, configurable per tournament until the organiser confirms the real ones. */
export interface Rules {
  /** 'bestOf': play until someone wins a majority of `sets`; 'fixed': always play all `sets` (draws possible). */
  setsMode: 'bestOf' | 'fixed'
  sets: number
  setPoints: number
  /** Points in the deciding set ('bestOf' only). */
  lastSetPoints: number
  winBy: number
  /** Table points for a match result. */
  pointsWin: number
  pointsDraw: number
  pointsLoss: number
}

export interface Tournament {
  name: string
  subtitle: string
  courts: number
  rules: Rules
}

export interface Category {
  id: Id
  name: string
}

export interface Group {
  id: Id
  categoryId: Id
  name: string
  teamIds: Id[]
}

export interface Team {
  id: Id
  name: string
  categoryId: Id
}

export interface SetScore {
  a: number
  b: number
}

export type MatchStatus = 'scheduled' | 'live' | 'finished'

export type KoRound = 'QF' | 'SF' | 'F' | '3P'

/** Where a knockout team comes from: a group place, or the winner/loser of an earlier match. */
export type KoSource =
  | { kind: 'group'; groupId: Id; pos: number }
  | { kind: 'match'; matchId: Id; take: 'winner' | 'loser'; label: string }

export interface KoInfo {
  round: KoRound
  /** e.g. "Ćwierćfinał 1", "Finał" */
  label: string
  srcA: KoSource
  srcB: KoSource
}

export interface Match {
  id: Id
  categoryId: Id
  /** Empty for knockout matches. */
  groupId: Id
  /** Set for knockout (bracket) matches. */
  ko?: KoInfo
  court: number
  /** ISO local date-time, e.g. 2026-10-23T09:00 */
  start: string
  /** Empty while a knockout team is not known yet. */
  teamA: Id
  teamB: Id
  /** Finished sets followed by the set in progress (if live). */
  sets: SetScore[]
  status: MatchStatus
  updatedAt: number
}

export type Role = 'admin' | 'court'

export interface State {
  tournament: Tournament
  categories: Category[]
  groups: Group[]
  teams: Team[]
  matches: Match[]
}
