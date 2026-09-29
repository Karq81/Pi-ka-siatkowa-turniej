import type { Match, State } from '../types'
import { playedAfter } from './special'
import { buildStage2, groupsEnded, isStage2Group, stage2Played } from './stage2'

/*
 * Moving from one phase to the next (groups → bracket, first stage → second stage, Swiss
 * round → next round). Once the next phase has started (a match in it is being played or
 * has a result), an earlier result can still be corrected but not undone (set back to "not
 * played"), because the next phase was made from it. Before the next phase starts, a
 * correction simply goes through and the next phase is made again from the new tables.
 */

const started = (m: Match) => m.status !== 'scheduled' && !m.skipped && !m.bye

/** Matches of a later phase that have started and depend on this match's result. */
export function laterPhaseStarted(state: State, m: Match): Match[] {
  if (m.ko) return playedAfter(state, m.id)
  const group = state.groups.find((g) => g.id === m.groupId)
  if (!group || isStage2Group(group)) return []
  // Swiss system: the next rounds were paired from the table with this result.
  if (m.swissRound) return state.matches.filter((x) => x.groupId === m.groupId && (x.swissRound ?? 0) > m.swissRound! && started(x))
  // Group phase: the bracket after the groups, or the second stage (Albatros CUP).
  return state.matches.filter((x) => x.categoryId === m.categoryId && x.id !== m.id && started(x)
    && (!!x.ko || state.groups.some((g) => g.id === x.groupId && isStage2Group(g))))
}

/**
 * The tournament after a first-stage result changed while the next phase was declared but not
 * started: the second stage made again from the new tables. Null when nothing needs doing
 * (the bracket after the groups follows the tables by itself).
 */
export function refreshedNextPhase(state: State, m: Match): State | null {
  const group = state.groups.find((g) => g.id === m.groupId)
  if (!group || isStage2Group(group) || m.ko) return null
  if (!groupsEnded(state, m.categoryId) || stage2Played(state, m.categoryId)) return null
  return buildStage2(state, m.categoryId)
}
