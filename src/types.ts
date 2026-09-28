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
  /**
   * 'sets' (default: volleyball, badminton, table tennis…) or 'score': one score per match,
   * goals or points (football, handball, basketball…), kept as the match's only "set".
   */
  scoring?: 'sets' | 'score' | 'judo' | 'karate' | 'chess'
  /** Score mode: whether a match may end level. */
  draws?: boolean
  /** Score mode: what the score counts, e.g. "bramki" or "punkty". */
  unit?: string
  /** The sport, for labels ("Piłka nożna"). */
  sport?: string
  /**
   * A set also ends when someone reaches this many points, whatever the lead: tennis and
   * padel 7 (tie-break at 6:6, so 7:6), badminton 30 (30:29).
   */
  cap?: number
  /** The same for a deciding set of its own length (e.g. none for a super tie-break to 10). */
  lastSetCap?: number
  /** Judo, karate: regular contest time in seconds (judo seniors 240); judo: golden score follows a level result. */
  fightSeconds?: number
  /** Timed games: parts (2 halves, 4 quarters, 3 periods) and minutes of each, for the referee's clock. */
  periods?: number
  periodMinutes?: number
  /** Scoring buttons (basketball 1, 2, 3; rugby 5, 2, 3). Missing: +1 only. */
  scoreButtons?: number[]
  /** Volleyball: a match won in the deciding set gives the winner one point less and the loser one more (3:2 → 2 and 1 points). */
  tieBreakSplit?: boolean
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
  /** First match (ISO local date-time); Albatros CUP uses its fixed timetable when missing. */
  start?: string
  /** Last match of a day starts no later than this (HH:MM); later matches move to the next morning. */
  dayEnd?: string
  /** First match on the following days (HH:MM). */
  dayStart?: string
  /** Live video of the whole tournament: a YouTube, Facebook or Twitch link. */
  stream?: string
  /** Live video of single courts: court number → link. */
  courtStreams?: Record<string, string>
  /** Teams can sign up on the tournament's page (#zgloszenie). */
  registration?: boolean
}

/** A team's (or player's) sign-up sent from the tournament's page; only the organiser reads it. */
export interface Entry {
  id: string
  name: string
  categoryId: string
  club?: string
  /** Captain or contact person. */
  contact: string
  phone?: string
  email?: string
  /** Squad, one player per line. */
  players?: string
  /** Small logo, a data: URL (about 20 KB). */
  logo?: string
  note?: string
  status: 'nowe' | 'przyjęte' | 'odrzucone'
  createdAt: number
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
  /**
   * Judo: the contest in detail (one "set" per contest). `a` and `b` then hold technical
   * points, 100 for ippon, 10 per waza-ari and 1 per yuko, for tables and old screens.
   */
  judo?: JudoScore
  /** Karate (WKF kumite): points, penalties, senshu. `a` and `b` hold the points. */
  karate?: KarateScore
  /** Chess: how the game ended (a and b are 1, 0.5 or 0). */
  chess?: ChessEnd
  /** Tennis, padel: points of the game in progress (0, 1, 2, 3… = 0, 15, 30, 40; tie-break points). */
  game?: { a: number; b: number }
}

export interface KarateScore {
  /** Penalties 0–5: chui 1–3, hansoku-chui, hansoku (disqualification). */
  pa: number
  pb: number
  /** Who has senshu (the first unopposed point), if anybody. */
  senshu?: 'a' | 'b'
  /** Referees' decision (hantei) or withdrawal. */
  decision?: 'a' | 'b'
}

/** mat, czas, poddanie, pat, remis (by agreement, repetition, 50 moves), walkower. */
export type ChessEnd = 'mat' | 'czas' | 'poddanie' | 'pat' | 'remis' | 'walkower'

/** One judoka's scores and penalties. */
export interface JudoSide {
  ippon: number
  wazaari: number
  yuko: number
  shido: number
}

export interface JudoScore {
  a: JudoSide
  b: JudoSide
  /** The contest went to golden score (the first score wins). */
  golden?: boolean
  /** Decided by the referees (hantei, e.g. in children's contests) or by withdrawal (kiken). */
  decision?: 'a' | 'b'
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
