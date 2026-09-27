import type { Rules, State, Team, Tournament } from '../types'
import { DEFAULT_SCHEDULE } from './demo'
import { buildGroupSchedule, type ScheduleOptions } from './schedule'

/** What the organiser fills in on "Załóż turniej"; kept on the device until the tournament is saved. */
export interface TournamentDraft {
  name: string
  /** First match, ISO local date-time. */
  start: string
  courts: number
  slotMinutes: number
  dayEnd: string
  categories: string[]
  /** 1: one set; 2/3: best of 3 / best of 5 */
  format: 'one' | 'bo3' | 'bo5'
  setPoints: number
}

export const MAX_COURTS = 20

const DRAFT_KEY = (id: string) => `siatkalive:draft:${id}`

export function saveDraft(id: string, draft: TournamentDraft) {
  try { localStorage.setItem(DRAFT_KEY(id), JSON.stringify(draft)) } catch { /* no storage */ }
}

export function readDraft(id: string): TournamentDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY(id))
    return raw ? (JSON.parse(raw) as TournamentDraft) : null
  } catch {
    return null
  }
}

const PL: Record<string, string> = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' }

/** Tournament address from its name: "Halówka Mielno 2027" → "halowka-mielno-2027". */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (c) => PL[c])
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
}

export function rulesFor(format: TournamentDraft['format'], setPoints: number): Rules {
  const sets = format === 'one' ? 1 : format === 'bo3' ? 3 : 5
  return {
    setsMode: format === 'one' ? 'fixed' : 'bestOf',
    sets,
    setPoints,
    // The deciding set is shorter in volleyball (15 when sets go to 25).
    lastSetPoints: format === 'one' ? setPoints : Math.min(setPoints, 15),
    winBy: 2,
    pointsWin: format === 'one' ? 2 : 3,
    pointsDraw: 1,
    pointsLoss: format === 'one' ? 1 : 0,
  }
}

/**
 * A new tournament as set up on "Załóż turniej": settings and categories, no teams yet.
 * Category ids start with "k" so they never pick up content written for Albatros CUP.
 */
export function blankState(draft: TournamentDraft): State {
  const day = new Date(draft.start)
  const subtitle = Number.isNaN(day.getTime())
    ? ''
    : day.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })
  return {
    tournament: {
      name: draft.name,
      subtitle,
      courts: draft.courts,
      rules: rulesFor(draft.format, draft.setPoints),
      slotMinutes: draft.slotMinutes,
      start: draft.start,
      dayEnd: draft.dayEnd,
      dayStart: draft.start.slice(11),
    },
    categories: draft.categories.map((name, i) => ({ id: `k${i + 1}`, name })),
    groups: [],
    teams: [],
    matches: [],
  }
}

/** Shown until the organiser's settings arrive (e.g. the tournament opened on another device). */
export const EMPTY_DRAFT: TournamentDraft = {
  name: 'Nowy turniej', start: '', courts: 4, slotMinutes: 20, dayEnd: '18:00',
  categories: ['Kategoria 1'], format: 'bo3', setPoints: 25,
}

/** How a tournament's matches are laid out in time. */
export function scheduleOf(t: Tournament): ScheduleOptions & { dayStart: string } {
  return {
    courts: t.courts,
    start: t.start ?? DEFAULT_SCHEDULE.start,
    slotMinutes: t.slotMinutes ?? DEFAULT_SCHEDULE.slotMinutes,
    dayEnd: t.dayEnd ?? DEFAULT_SCHEDULE.dayEnd,
    dayStart: t.dayStart ?? DEFAULT_SCHEDULE.dayStart,
  }
}

/**
 * The teams of one category from a pasted list, one per line. "Klub: Drużyna" or a
 * trailing number ("UKS Orzeł 2") tells the draw which teams belong to the same club.
 */
export function parseTeamList(text: string, categoryId: string): Team[] {
  const seen = new Set<string>()
  const teams: Team[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\s*\d+[.)]\s+/, '').trim()
    if (!line || seen.has(line.toLowerCase())) continue
    seen.add(line.toLowerCase())
    const m = /^(.+?)\s*:\s*(.+)$/.exec(line)
    const name = m ? m[2] : line
    teams.push({
      id: `${categoryId}t${teams.length + 1}`,
      name,
      categoryId,
      club: m ? m[1] : name.replace(/\s+\d+$/, ''),
    })
  }
  return teams
}

/**
 * The group timetable as planned from the tournament's settings, put back on the matches
 * (after clearing test results, when finished matches had moved the times).
 * Pairings and results stay; courts and times return to the plan.
 */
export function replanTimetable(state: State): State {
  const planned = buildGroupSchedule(state.groups, scheduleOf(state.tournament))
  const key = (m: { groupId: string; teamA: string; teamB: string }) => `${m.groupId}|${m.teamA}|${m.teamB}`
  const at = new Map(planned.map((m) => [key(m), m]))
  return {
    ...state,
    matches: state.matches.map(({ calledAt: _called, ...m }) => {
      const p = at.get(key(m))
      return p ? { ...m, start: p.start, court: p.court } : m
    }),
  }
}
