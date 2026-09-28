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
  /**
   * Order of the tie-breakers after table points. Missing: the usual order (goals: difference,
   * scored, head-to-head; sets: set ratio, small-points ratio, head-to-head).
   */
  tiebreak?: Tiebreak[]
  /**
   * Head-to-head criteria counted again among the teams still level after an h2h criterion
   * split a bigger block (UEFA). Off: they are counted among the whole block first level.
   */
  h2hReapply?: boolean
  /** Table points after overtime or a shootout (hockey IIHF: 2 and 1); missing: as in regular time. */
  pointsOvertimeWin?: number
  pointsOvertimeLoss?: number
  /** Table points for a team that lost by walkover (basketball: 0 instead of 1); missing: pointsLoss. */
  pointsWalkoverLoss?: number
  /** Table points for a free round (Swiss, odd round robin); missing: pointsWin. */
  byePoints?: number
}

/**
 * h2h: head-to-head – a small table of the matches between the teams still level (points,
 * then difference in those matches); wins: matches won; diff / scored: goal (point)
 * difference and goals scored; setRatio / setDiff: sets won to lost; pointRatio: small points
 * won to lost; buchholz: the sum of the opponents' points (Swiss system).
 * The rest as named in the tournament specification (docs/specyfikacja-turnieje.md, part 4):
 * win_pct: wins per match played; h2h_points / h2h_diff / h2h_scored / h2h_result: points,
 * difference, goals and wins in the matches among the teams level; buchholz_cut1 /
 * buchholz_median: Buchholz without the weakest (and the best) opponent; sonneborn_berger:
 * points of the opponents beaten plus half of those drawn with; progressive: the running
 * score added up round by round; seed / rating: the team's seed (lower is better) or rating;
 * lots: a draw of lots (fixed for a team, so the table never changes); shared: the teams
 * still level share the place (ex aequo).
 */
export type Tiebreak =
  | 'h2h' | 'wins' | 'diff' | 'scored' | 'setRatio' | 'setDiff' | 'pointRatio' | 'buchholz'
  | 'win_pct' | 'h2h_points' | 'h2h_diff' | 'h2h_scored' | 'h2h_result'
  | 'buchholz_cut1' | 'buchholz_median' | 'sonneborn_berger' | 'progressive'
  | 'seed' | 'rating' | 'lots' | 'shared'

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
  /**
   * How the tournament is played: 'groups' (default: groups, each with each, then a bracket),
   * 'knockout' (a bracket from the start, the loser is out) or 'double' (double elimination:
   * a losers' bracket, out after the second loss, a grand final) or 'custom' (only the
   * organiser's own plan, see `custom`).
   */
  system?: 'groups' | 'knockout' | 'double' | 'custom' | 'swiss' | 'stepladder' | 'consolation'
  /** Swiss system: number of rounds. */
  swissRounds?: number
  /** Knockout: a match for 3rd place between the semi-final losers. */
  thirdPlace?: boolean
  /** Knockout: both semi-final losers get bronze (3rd place), no match for it (combat sports). */
  bronzes?: boolean
  /** Knockout: everybody plays on for a place (losers play for 5–8, 9–16…). */
  allPlaces?: boolean
  /** Bracket draw: 'draw' (random, default) or 'list' (the list's order is the seeding, 1 = the best). */
  seeding?: 'draw' | 'list'
  /** Bracket draw: players of one club go into different halves (quarters…) as far as possible. */
  separateClubs?: boolean
  /**
   * Groups, then a bracket for the best: `perGroup` best of each group, plus `best` teams
   * from the next place (compared by points per match). Missing: everybody plays for places.
   */
  advance?: { perGroup: number; best?: number }
  /** Groups: each pair plays twice (return matches). */
  twice?: boolean
  /** Rounds a team rests between its matches (0: none). */
  rest?: number
  /** Times of day without new matches (lunch), HH:MM. */
  breaks?: { from: string; to: string }[]
  /** Albatros CUP: phases the chief referee has ended, per category. */
  phases?: Record<string, { groupsEnded?: boolean; stage2Ended?: boolean }>
  /**
   * The organiser's own plan (usually made by the AI assistant from a description): per
   * category, matches whose players come from group places, other matches' winners or
   * losers, or are named directly. Played after the groups (if any), in any shape.
   */
  custom?: Record<string, CustomMatch[]>
}

/**
 * One match of a custom plan. Sides: "team:Name", "group:A:1" (1st place in group A),
 * "winner:Other match", "loser:Other match". `place`: the winner's place (the loser gets
 * the next one unless `loserPlace` says otherwise).
 */
export interface CustomMatch {
  name: string
  a: string
  b: string
  place?: number
  loserPlace?: number
  /** Made by the system from the tournament's settings (groups → bracket), not by the organiser. */
  auto?: boolean
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
  /** Seed (1 = the strongest) and rating (e.g. chess Elo), for tie-breakers and seeding. */
  seed?: number
  rating?: number
  /** Withdrawn or disqualified teams stay in the results, marked. Missing: active. */
  status?: 'active' | 'withdrawn' | 'disqualified'
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

/**
 * The game clock of a match in progress, sent by the referee's phone so fans see the time
 * too. `ms` is the time left (or, counting up, the time played) at the moment `at`
 * (server time, ms); while `run` is true it keeps counting from there.
 */
export interface LiveClock {
  match: string
  ms: number
  run: boolean
  at: number
  /** Counts up (judo golden score). */
  up?: boolean
  /** The part being played (2 = second half, quarter…). */
  part?: number
  /** Judo: golden score. */
  golden?: boolean
}

export type MatchStatus = 'scheduled' | 'live' | 'finished'

/** QF: first round of a tier, SF: second round, P: match for a place (the final is P for place 1). */
export type KoRound = 'QF' | 'SF' | 'P' | 'R'

/** Where a knockout team comes from: a group place, or the winner/loser of an earlier match. */
export type KoSource =
  | { kind: 'group'; groupId: Id; pos: number }
  | { kind: 'match'; matchId: Id; take: 'winner' | 'loser'; label: string }
  /** A team placed in the bracket by the draw (knockout from the start). */
  | { kind: 'team'; teamId: Id }
  /** The `rank`-th best of the teams in place `pos` of the category's groups (best thirds). */
  | { kind: 'best'; categoryId: Id; pos: number; rank: number }

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
  /** Knockout from the start: 'W' winners' bracket, 'L' losers' bracket, 'F' the final(s). */
  bracket?: 'W' | 'L' | 'F' | 'C'
  /** Round within its bracket (1, 2, …), for drawing the columns. */
  col?: number
  /** The grand final's second match: played only when the losers' bracket winner wins match `resetOf`. */
  resetOf?: Id
  /** Place of the loser when it is not place + 1 (the losers' bracket final: 3). */
  loserPlace?: number
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
  /** How the match was decided, for table points (hockey: overtime and shootout give 2 and 1). Missing: regular time. */
  decidedBy?: 'regulation' | 'overtime' | 'shootout' | 'walkover' | 'retirement'
  /** Swiss system: the round of this match (1, 2, …). */
  swissRound?: number
  /** Swiss system: a free round (teamB empty); counts as a win for teamA. */
  bye?: boolean
  /**
   * Not played: the grand final's second match after a clear win, or a match left when the
   * chief referee ended its phase. Hidden from courts, boards and lists.
   */
  skipped?: boolean
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
