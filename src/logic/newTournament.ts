import { locale, t } from '../i18n'
import { withCustom } from './custom'
import type { CustomMatch, Group, State, Team, Tournament } from '../types'
import { GROUP_LETTERS } from './draw'
import { sportById, sportRules } from './sports'
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
  /** Discipline and match format (see SPORTS); volleyball's first format when missing. */
  sport?: string
  format?: string
  /** "Inna dyscyplina: wynik w setach": points per set. */
  setPoints?: number
  /** Judo: contest time in seconds, when not the format's. */
  fightSeconds?: number
  /** "Inna dyscyplina": the discipline's own name ("Zapasy"), shown instead of "Inna dyscyplina". */
  sportName?: string
  /**
   * Teams (and optionally groups) per category, e.g. prepared by the AI assistant from pasted
   * notes. Groups list team names; empty groups mean the organiser draws them later.
   */
  preset?: { category: string; teams: string[]; groups: string[][]; matches?: CustomMatch[] }[]
  /** Groups: each pair plays twice. */
  twice?: boolean
  /** How it is played: groups (default), a knockout bracket, or double elimination. */
  system?: 'groups' | 'knockout' | 'double' | 'custom'
  thirdPlace?: boolean
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

/**
 * A new tournament as set up on "Załóż turniej": settings and categories, no teams yet.
 * Category ids start with "k" so they never pick up content written for Albatros CUP.
 */
export function blankState(draft: TournamentDraft): State {
  const day = new Date(draft.start)
  const subtitle = Number.isNaN(day.getTime())
    ? ''
    : day.toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' })
  const state: State = {
    tournament: {
      name: draft.name,
      subtitle,
      courts: draft.courts,
      rules: { ...sportRules(sportById(draft.sport), draft.format, draft.setPoints, draft.fightSeconds), ...(draft.sportName?.trim() ? { sport: draft.sportName.trim() } : {}) },
      slotMinutes: draft.slotMinutes,
      start: draft.start,
      dayEnd: draft.dayEnd,
      dayStart: draft.start.slice(11),
      ...(draft.system && draft.system !== 'groups' ? { system: draft.system } : {}),
      ...(draft.system === 'knockout' && draft.thirdPlace ? { thirdPlace: true } : {}),
      ...(draft.twice ? { twice: true } : {}),
    },
    ...presetTeams(draft),
  }
  // The organiser's own plan (from the AI assistant): matches after the groups, any shape.
  const custom: Record<string, CustomMatch[]> = {}
  state.categories.forEach((c, i) => {
    const p = draft.preset?.find((x) => x.category.trim().toLowerCase() === c.name.trim().toLowerCase())
      ?? (draft.preset?.length === state.categories.length ? draft.preset[i] : undefined)
      ?? (state.categories.length === 1 ? { matches: draft.preset?.flatMap((x) => x.matches ?? []) } : undefined)
    if (p?.matches?.length) custom[c.id] = p.matches
  })
  if (!Object.keys(custom).length) return state
  return withCustom({ ...state, tournament: { ...state.tournament, custom } })
}

/** Categories with the draft's preset teams and groups, and the group timetable if groups are set. */
function presetTeams(draft: TournamentDraft): Pick<State, 'categories' | 'groups' | 'teams' | 'matches'> {
  const categories = draft.categories.map((name, i) => ({ id: `k${i + 1}`, name }))
  const teams: Team[] = []
  const groups: Group[] = []
  const presets = (draft.preset ?? []).filter((p) => p.teams.length)
  const key = (s: string) => s.trim().toLowerCase()
  // The names typed in the assistant's notes come with the tournament even when the category
  // was renamed in the form (or the notes had none): by name, else in the same order, and with
  // one category every list goes to it.
  const presetFor = (name: string, i: number) =>
    presets.find((p) => key(p.category) === key(name))
    ?? (presets.length === categories.length && !presets.some((p) => categories.some((c) => key(c.name) === key(p.category))) ? presets[i] : undefined)
    ?? (categories.length === 1 ? { category: name, teams: presets.flatMap((p) => p.teams), groups: presets.flatMap((p) => p.groups) } : undefined)
  const bracket = !!draft.system && draft.system !== 'groups'
  for (const [i, c] of categories.entries()) {
    const found = presetFor(c.name, i)
    const preset = found && bracket ? { ...found, groups: [] } : found
    if (!preset || !preset.teams.length) continue
    const own = parseTeamList(preset.teams.join('\n'), c.id)
    teams.push(...own)
    const idOf = (name: string) => own.find((t) => t.name.toLowerCase() === name.trim().toLowerCase())?.id
    preset.groups.filter((g) => g.length > 1).forEach((names, gi) => {
      const ids = names.map(idOf).filter((id): id is string => !!id)
      if (ids.length > 1) groups.push({ id: `${c.id}g${gi + 1}`, categoryId: c.id, name: t('Grupa {letter}', { letter: GROUP_LETTERS[gi] ?? gi + 1 }), teamIds: ids })
    })
  }
  if (!draft.start || !groups.length) return { categories, teams, groups: [], matches: [] }
  const schedule: ScheduleOptions = {
    courts: draft.courts, start: draft.start, slotMinutes: draft.slotMinutes, dayEnd: draft.dayEnd, dayStart: draft.start.slice(11),
    ...(draft.twice ? { twice: true } : {}),
  }
  return { categories, teams, groups, matches: buildGroupSchedule(groups, schedule) }
}

/** Shown until the organiser's settings arrive (e.g. the tournament opened on another device). */
export const EMPTY_DRAFT: TournamentDraft = {
  name: t('Nowy turniej'), start: '', courts: 4, slotMinutes: 20, dayEnd: '18:00',
  categories: [t('Kategoria {n}', { n: 1 })],
}

/** How a tournament's matches are laid out in time. */
export function scheduleOf(t: Tournament): ScheduleOptions & { dayStart: string } {
  return {
    courts: t.courts,
    start: t.start ?? DEFAULT_SCHEDULE.start,
    slotMinutes: t.slotMinutes ?? DEFAULT_SCHEDULE.slotMinutes,
    dayEnd: t.dayEnd ?? DEFAULT_SCHEDULE.dayEnd,
    dayStart: t.dayStart ?? DEFAULT_SCHEDULE.dayStart,
    ...(t.twice ? { twice: true } : {}),
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

/**
 * Lines that look like sentences rather than names (pasted notes, rules): long, many words,
 * ending like a sentence, or a heading in capitals ("WIELKI FINAŁ"; short club names like
 * "AZS AGH" pass). They are shown before the draw so they do not become teams.
 */
export function suspiciousNames(names: string[]): string[] {
  const heading = (n: string) => {
    const words = n.trim().split(/\s+/)
    return words.length >= 2 && n === n.toUpperCase() && n !== n.toLowerCase() && !/\d/.test(n) && words.some((w) => w.length >= 5)
  }
  return names.filter((n) => n.length > 40 || n.trim().split(/\s+/).length >= 5 || /[.:!?]$/.test(n.trim()) || heading(n))
}
