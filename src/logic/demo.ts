import type { Group, Rules, State, Team } from '../types'
import { drawTournament } from './draw'
import { buildGroupsOnOwnCourts } from './schedule'

/**
 * Albatros CUP (girls aged 10–11): one set to 15 with a 2-point lead (the organiser may
 * switch to 21). Table points as in PZPS mini volleyball: 2 for a win, 1 for a loss.
 * All of it can be changed in the admin settings.
 */
export const defaultRules: Rules = {
  setsMode: 'fixed',
  sets: 1,
  setPoints: 15,
  lastSetPoints: 15,
  winBy: 2,
  pointsWin: 2,
  pointsDraw: 1,
  pointsLoss: 1,
}

export const CLUBS: { name: string; dwojki: number; trojki: number }[] = [
  { name: 'Akademia Siatkówki 13 Koszalin', dwojki: 1, trojki: 2 },
  { name: 'SGS Goleniów', dwojki: 2, trojki: 2 },
  { name: 'UKS Volley 71 Szczecin', dwojki: 2, trojki: 2 },
  { name: 'UKS Pogodno Szczecin', dwojki: 2, trojki: 2 },
  { name: 'MKS Gryf Szczecinek', dwojki: 2, trojki: 2 },
  { name: 'UKS OPP Powiat Kołobrzeski', dwojki: 2, trojki: 2 },
  { name: 'AMPS Kołobrzeg', dwojki: 0, trojki: 1 },
  { name: 'UKS Tytan Ostrowy', dwojki: 2, trojki: 2 },
  { name: 'PTPS Człuchów', dwojki: 2, trojki: 2 },
  { name: 'MKS Sasvolley Stargard', dwojki: 2, trojki: 2 },
  { name: 'UKS Piątka Turek', dwojki: 0, trojki: 2 },
  { name: 'UKS Bukowe Szczecin', dwojki: 2, trojki: 2 },
  { name: 'SP 18 Koszalin', dwojki: 2, trojki: 0 },
  { name: 'TPS Czarni Słupsk', dwojki: 2, trojki: 2 },
  { name: 'Akademia Siatkarska Energia Chojna', dwojki: 1, trojki: 1 },
  // Teams 3 and 4 fill the two free places in each category ("wolne miejsce").
  { name: 'UKS Opty Mielno', dwojki: 4, trojki: 4 },
]

const GROUPS_PER_CATEGORY = 4

/**
 * Albatros CUP courts: one per group. Dwójki play on courts 1–4 (groups A–D),
 * Trójki on courts 5–9 (groups 1–5).
 */
export const COURT_COUNT = 9

/** Albatros CUP schedule: Friday 23.10 from 15:30, Saturday from 9:30; a match every 15 minutes (the organiser can change it). */
export const DEFAULT_SCHEDULE = {
  courts: COURT_COUNT, start: '2026-10-23T15:30', slotMinutes: 15, dayEnd: '18:40', dayStart: '09:30',
}

/** Qualified teams, one per entry; clubs with two teams in a category get "1" and "2". */
export function albatrosTeams(): Team[] {
  const categories = [{ id: 'c1', key: 'dwojki' as const }, { id: 'c2', key: 'trojki' as const }]
  const teams: Team[] = []
  for (const c of categories) {
    for (const club of CLUBS) {
      const count = club[c.key]
      for (let n = 1; n <= count; n++) {
        teams.push({ id: `${c.id}t${teams.length + 1}`, name: count > 1 ? `${club.name} ${n}` : club.name, categoryId: c.id, club: club.name })
      }
    }
  }
  return teams
}

export const GROUPS_DEFAULT = GROUPS_PER_CATEGORY

/**
 * The organiser's own groups (Krzysztof's list "LISTA ZESPOŁÓW ALBATROS"), fixed for
 * this tournament: Dwójki in 4 groups of 7 (A–D), Trójki in 5 groups of 6 (1–5).
 */
export const ALBATROS_GROUPS: { categoryId: string; name: string; teams: string[] }[] = [
  { categoryId: 'c1', name: 'Grupa A', teams: [
    'Akademia Siatkówki 13 Koszalin', 'MKS Sasvolley Stargard 1', 'UKS Opty Mielno 1', 'TPS Czarni Słupsk 2',
    'SP 18 Koszalin 2', 'UKS Pogodno Szczecin 2', 'SGS Goleniów 2'] },
  { categoryId: 'c1', name: 'Grupa B', teams: [
    'UKS Opty Mielno 2', 'Akademia Siatkarska Energia Chojna', 'MKS Sasvolley Stargard 2', 'PTPS Człuchów 1',
    'UKS Bukowe Szczecin 1', 'UKS Volley 71 Szczecin 2', 'SP 18 Koszalin 1'] },
  { categoryId: 'c1', name: 'Grupa C', teams: [
    'UKS OPP Powiat Kołobrzeski 1', 'UKS Tytan Ostrowy 2', 'TPS Czarni Słupsk 1', 'UKS Bukowe Szczecin 2',
    'MKS Gryf Szczecinek 1', 'UKS Pogodno Szczecin 1', 'UKS Opty Mielno 3'] },
  { categoryId: 'c1', name: 'Grupa D', teams: [
    'SGS Goleniów 1', 'UKS Volley 71 Szczecin 1', 'MKS Gryf Szczecinek 2', 'UKS OPP Powiat Kołobrzeski 2',
    'UKS Tytan Ostrowy 1', 'PTPS Człuchów 2', 'UKS Opty Mielno 4'] },
  { categoryId: 'c2', name: 'Grupa 1', teams: [
    'AMPS Kołobrzeg', 'UKS Opty Mielno 1', 'TPS Czarni Słupsk 2', 'UKS Pogodno Szczecin 2',
    'Akademia Siatkówki 13 Koszalin 1', 'UKS Bukowe Szczecin 2'] },
  { categoryId: 'c2', name: 'Grupa 2', teams: [
    'Akademia Siatkarska Energia Chojna', 'Akademia Siatkówki 13 Koszalin 2', 'UKS Pogodno Szczecin 1',
    'UKS Bukowe Szczecin 1', 'UKS Opty Mielno 2', 'PTPS Człuchów 2'] },
  { categoryId: 'c2', name: 'Grupa 3', teams: [
    'SGS Goleniów 1', 'UKS Tytan Ostrowy 1', 'MKS Gryf Szczecinek 1', 'MKS Sasvolley Stargard 2',
    'UKS OPP Powiat Kołobrzeski 2', 'UKS Piątka Turek 2'] },
  { categoryId: 'c2', name: 'Grupa 4', teams: [
    'MKS Gryf Szczecinek 2', 'SGS Goleniów 2', 'UKS Volley 71 Szczecin 1', 'UKS OPP Powiat Kołobrzeski 1',
    'TPS Czarni Słupsk 1', 'UKS Opty Mielno 3'] },
  { categoryId: 'c2', name: 'Grupa 5', teams: [
    'UKS Piątka Turek 1', 'MKS Sasvolley Stargard 1', 'UKS Volley 71 Szczecin 2', 'PTPS Człuchów 1',
    'UKS Tytan Ostrowy 2', 'UKS Opty Mielno 4'] },
]

/** The fixed groups with team ids; fails loudly if a name does not match a team. */
export function albatrosGroups(teams: Team[]): Group[] {
  const count: Record<string, number> = {}
  return ALBATROS_GROUPS.map((g) => {
    count[g.categoryId] = (count[g.categoryId] ?? 0) + 1
    return {
      id: `${g.categoryId}g${count[g.categoryId]}`, categoryId: g.categoryId, name: g.name,
      teamIds: g.teams.map((name) => {
        const team = teams.find((t) => t.categoryId === g.categoryId && t.name === name)
        if (!team) throw new Error(`Brak drużyny ${name} (${g.categoryId})`)
        return team.id
      }),
    }
  })
}

/**
 * Albatros CUP as set up by the organiser: all teams in Dwójki and Trójki, in the
 * organiser's fixed groups, each group on its own court, from Friday 15:30.
 */
export function initialState(): State {
  const teams = albatrosTeams()
  const groups = albatrosGroups(teams)
  return {
    tournament: {
      name: 'Albatros CUP 2026',
      subtitle: '23–25 października 2026 · Mielno',
      courts: DEFAULT_SCHEDULE.courts,
      rules: defaultRules,
      slotMinutes: DEFAULT_SCHEDULE.slotMinutes,
    },
    categories: [
      { id: 'c1', name: 'Dwójki' },
      { id: 'c2', name: 'Trójki' },
    ],
    groups,
    teams,
    // Groups A–D on courts 1–4, groups 1–5 on courts 5–9.
    matches: buildGroupsOnOwnCourts(groups, groups.map((_, i) => i + 1), DEFAULT_SCHEDULE),
  }
}

/** Both categories drawn into 4 groups each, with the default schedule. */
export function drawnState(rand: () => number = Math.random): State {
  return drawTournament(initialState(), { groups: { c1: GROUPS_PER_CATEGORY, c2: GROUPS_PER_CATEGORY }, schedule: DEFAULT_SCHEDULE }, rand)
}
