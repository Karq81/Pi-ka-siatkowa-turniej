import { t } from '../i18n'
import type { Match, Rules, SetScore, State, Team, Tournament } from '../types'

/*
 * Special cases (docs/specyfikacja-turnieje.md part 6): walkovers, a team withdrawing or
 * disqualified during the tournament, and the log of the organiser's changes.
 */

/** Whether a walkover can be given as a plain score in this discipline (not judo or karate). */
export function canWalkover(rules: Rules): boolean {
  return rules.scoring === undefined || rules.scoring === 'sets' || rules.scoring === 'score' || rules.scoring === 'chess'
}

/**
 * The score of a walkover for side A (`aWins`) or B: the discipline's walkover (football
 * 3:0, basketball 20:0, volleyball 25:0 in each set needed), else the least that wins.
 */
export function walkoverSets(rules: Rules, aWins: boolean): SetScore[] {
  const w = rules.walkover
  const side = (win: number, lose: number): SetScore => (aWins ? { a: win, b: lose } : { a: lose, b: win })
  if (rules.scoring === 'chess') return [side(1, 0)]
  if (rules.scoring === 'score') return [side(w?.winner ?? 3, w?.loser ?? 0)]
  const need = rules.setsMode === 'bestOf' ? Math.floor(rules.sets / 2) + 1 : rules.sets
  return Array.from({ length: need }, (_, i) => {
    const target = rules.setsMode === 'bestOf' && i === rules.sets - 1 ? rules.lastSetPoints : rules.setPoints
    return side(w?.setScore && rules.setPoints === target ? w.setScore : target, 0)
  })
}

/** The match given as a walkover to side A or B. */
export function asWalkover(rules: Rules, m: Match, aWins: boolean): Match {
  const { penalties: _p, ...rest } = m
  void _p
  return { ...rest, status: 'finished', sets: walkoverSets(rules, aWins), decidedBy: 'walkover' }
}

/** One line in the organiser's log (the newest last, at most 300). */
export function logged(tournament: Tournament, text: string, at = Date.now()): Tournament['log'] {
  return [...(tournament.log ?? []), { at, text }].slice(-300)
}

/** Group matches of a team (its league), and how many of them are played. */
function leagueOf(state: State, teamId: string): { all: Match[]; played: number } {
  const all = state.matches.filter((m) => !m.ko && m.groupId && (m.teamA === teamId || m.teamB === teamId) && !m.bye)
  return { all, played: all.filter((m) => m.status === 'finished' && !m.skipped).length }
}

/**
 * A team withdraws or is disqualified. Option A (the default): if it played less than half
 * of its group matches, all its results are removed from the tables (its other matches are
 * not played); otherwise its remaining matches are walkovers for the opponents. Option B:
 * always walkovers. Bracket matches it still had are walkovers for the opponent.
 */
export function withdrawTeam(state: State, teamId: string, status: 'withdrawn' | 'disqualified'): State {
  const team = state.teams.find((x) => x.id === teamId)
  if (!team) return state
  const rules = state.tournament.rules
  const option = state.tournament.withdrawal ?? 'A'
  const { all, played } = leagueOf(state, teamId)
  const voided = option === 'A' && played * 2 < all.length
  const walk = canWalkover(rules)
  const matches = state.matches.map((m) => {
    if (m.status === 'finished' || (m.teamA !== teamId && m.teamB !== teamId)) return m
    if (voided && !m.ko) return { ...m, status: 'finished' as const, skipped: true, sets: [] }
    if (!walk) return { ...m, status: 'finished' as const, skipped: true, sets: [] }
    // The opponent wins; a bracket match waits until the opponent is known.
    if (m.ko && (!m.teamA || !m.teamB)) return m
    return asWalkover(rules, m, m.teamB === teamId)
  })
  const teams: Team[] = state.teams.map((x) => (x.id === teamId ? { ...x, status, ...(voided ? { voided: true } : {}) } : x))
  const what = status === 'withdrawn' ? t('wycofana') : t('zdyskwalifikowana')
  const how = voided ? t('wyniki usunięte z tabel') : t('pozostałe mecze jako walkowery')
  return {
    ...state, teams, matches,
    tournament: { ...state.tournament, log: logged(state.tournament, `${team.name}: ${what} (${how})`) },
  }
}

/** Label shown by a withdrawn or disqualified team. */
export function statusLabel(team?: Team): string {
  if (team?.status === 'withdrawn') return t('wycofana')
  if (team?.status === 'disqualified') return t('dyskwalifikacja')
  return ''
}

/** Matches already played (or being played) that were filled in from this match's result. */
export function playedAfter(state: State, matchId: string): Match[] {
  return state.matches.filter((m) => m.status !== 'scheduled' && !m.skipped && m.ko
    && [m.ko.srcA, m.ko.srcB].some((s) => s.kind === 'match' && (s.matchId === matchId || state.matches.find((x) => x.id === matchId)?.ko?.legOf === s.matchId)))
}
