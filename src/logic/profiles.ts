import type { Rules, Tiebreak } from '../types'

/*
 * Rules profiles (docs/specyfikacja-turnieje.md): each discipline's table points, tie-breakers
 * and special cases live in a JSON file in src/profiles, not in the code. A tournament copies
 * its discipline's profile into its rules when it is made, and the organiser can change them
 * there (Admin: table points and the order of the tie-breakers).
 */

export interface RulesProfile {
  /** Sport id (sports.ts). */
  discipline: string
  name: string
  participantType: 'team' | 'player' | 'pair' | 'player_or_pair'
  points: {
    win: number
    draw: number
    loss: number
    /** Volleyball: a match won in the deciding set gives one point less to the winner, one more to the loser. */
    setsSplit?: boolean
    overtimeWin?: number
    overtimeLoss?: number
    walkoverLoss?: number
    bye?: number
  }
  /** Ordered criteria, as named in the specification (part 4). "points" first is implied. */
  criteria: string[]
  /** Criteria for the Swiss system, when other than `criteria`. */
  swissCriteria?: string[]
  h2hReapply: boolean
  /** How a level cup match is decided (description for now). */
  cupTie?: string
  /** Walkover result: goals, or set score per set. */
  walkover?: { winner?: number; loser?: number; sets?: boolean; setScore?: number; note?: string }
  /** Combat sports: two bronze medals. */
  bronzes?: number
  /** Where the numbers come from. */
  source?: string
}

const files = import.meta.glob<RulesProfile>('../profiles/*.json', { eager: true, import: 'default' })

export const PROFILES: Record<string, RulesProfile> = Object.fromEntries(
  Object.values(files).map((p) => [p.discipline, p]),
)

export function profileOf(sportId: string | undefined): RulesProfile | undefined {
  return sportId ? PROFILES[sportId] : undefined
}

/** Criteria names of the specification and the table's own names for the same thing. */
const ALIASES: Record<string, Tiebreak> = {
  ratio_sets: 'setRatio',
  ratio_points: 'pointRatio',
  ratio_games: 'pointRatio',
  set_diff: 'setDiff',
}

const KNOWN: Tiebreak[] = [
  'h2h', 'wins', 'diff', 'scored', 'setRatio', 'setDiff', 'pointRatio', 'buchholz',
  'win_pct', 'h2h_points', 'h2h_diff', 'h2h_scored', 'h2h_result',
  'buchholz_cut1', 'buchholz_median', 'sonneborn_berger', 'progressive',
  'seed', 'rating', 'lots', 'shared', 'fair_play',
]

/**
 * The profile's criteria as table tie-breakers: "points" is always first anyway, and the
 * criteria with no data kept yet (fair play, away goals, games with black) are left out.
 */
export function criteriaToTiebreaks(criteria: string[]): Tiebreak[] {
  const out: Tiebreak[] = []
  for (const c of criteria) {
    const k = (ALIASES[c] ?? c) as Tiebreak
    if (KNOWN.includes(k) && !out.includes(k)) out.push(k)
  }
  return out
}

/** The table part of the rules from a profile (points for results, tie-breakers). */
export function profileRules(p: RulesProfile, swiss = false): Partial<Rules> {
  const r: Partial<Rules> = {
    pointsWin: p.points.win,
    pointsDraw: p.points.draw,
    pointsLoss: p.points.loss,
    tieBreakSplit: p.points.setsSplit || undefined,
    tiebreak: criteriaToTiebreaks(swiss && p.swissCriteria ? p.swissCriteria : p.criteria),
  }
  if (p.h2hReapply) r.h2hReapply = true
  if (p.points.overtimeWin !== undefined) r.pointsOvertimeWin = p.points.overtimeWin
  if (p.points.overtimeLoss !== undefined) r.pointsOvertimeLoss = p.points.overtimeLoss
  if (p.points.walkoverLoss !== undefined) r.pointsWalkoverLoss = p.points.walkoverLoss
  if (p.points.bye !== undefined) r.byePoints = p.points.bye
  if (p.walkover && (p.walkover.winner !== undefined || p.walkover.setScore !== undefined)) {
    r.walkover = { ...(p.walkover.winner !== undefined ? { winner: p.walkover.winner, loser: p.walkover.loser ?? 0 } : {}), ...(p.walkover.setScore !== undefined ? { setScore: p.walkover.setScore } : {}) }
  }
  // Keep the stored rules free of undefined fields (Firestore does not take them).
  for (const k of Object.keys(r) as (keyof Rules)[]) if (r[k] === undefined) delete r[k]
  return r
}
