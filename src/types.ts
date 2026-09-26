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
  /** Minutes from one match to the next on a court (match + changeover). */
  slotMinutes?: number
  /** Names shown for courts 1, 2, 3… (e.g. "A" for court 1); the number when missing. */
  courtNames?: string[]
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
  /** Club, so the draw can keep a club's teams in different groups. */
  club?: string
}

export interface SetScore {
  a: number
  b: number
}

export type MatchStatus = 'scheduled' | 'live' | 'finished'

/** QF: first round of a tier, SF: second round, P: match for a place (the final is P for place 1). */
export type KoRound = 'QF' | 'SF' | 'P'

/** Where a knockout team comes from: a group place, or the winner/loser of an earlier match. */
export type KoSource =
  | { kind: 'group'; groupId: Id; pos: number }
  | { kind: 'match'; matchId: Id; take: 'winner' | 'loser'; label: string }

export interface KoInfo {
  round: KoRound
  /** Places this part of the bracket decides, e.g. 1–8 or 9–16. */
  tierFrom: number
  tierTo: number
  /** For round P: the better place at stake (1 = final, 3 = match for 3rd place, …). */
  place?: number
  /** e.g. "Ćwierćfinał 1", "Finał", "O 5. miejsce" */
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
  /** When the court moved on to this match (result of the one before, or a time set by hand). */
  calledAt?: number
}

export type Role = 'admin' | 'court'

/** Who this device is logged in as: the chief referee, or the referee of one court. */
export type Session = { role: 'admin' } | { role: 'court'; court: number }

/** Access keys. Each court has its own key, so a referee can only score their court. */
export interface Pins {
  adminPin: string
  /** Court number (as text) → key */
  courts: Record<string, string>
}

export interface State {
  tournament: Tournament
  categories: Category[]
  groups: Group[]
  teams: Team[]
  matches: Match[]
}
