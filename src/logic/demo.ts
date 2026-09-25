import type { Rules, State, Team } from '../types'
import { drawTournament } from './draw'

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
  { name: 'UKS Bukowe Szczecin', dwojki: 0, trojki: 2 },
  { name: 'SP 18 Koszalin', dwojki: 2, trojki: 0 },
  { name: 'TPS Czarni Słupsk', dwojki: 2, trojki: 2 },
  { name: 'Akademia Siatkarska Energia Chojna', dwojki: 1, trojki: 1 },
  { name: 'UKS Opty Mielno', dwojki: 2, trojki: 2 },
]

const GROUPS_PER_CATEGORY = 4

/** Albatros CUP schedule: Friday 23.10 from 15:30, then from 9:00; one set to 15 ≈ 20 minutes with changeover. */
export const DEFAULT_SCHEDULE = {
  courts: 10, start: '2026-10-23T15:30', slotMinutes: 20, dayEnd: '18:40', dayStart: '09:00',
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
 * The tournament before the draw: Albatros CUP teams in Dwójki and Trójki,
 * no groups and no matches yet. The organiser draws the groups in the panel.
 */
export function initialState(): State {
  const base: State = {
    tournament: {
      name: 'Albatros CUP 2026',
      subtitle: '23–25 października 2026 · Mielno',
      courts: DEFAULT_SCHEDULE.courts,
      rules: defaultRules,
    },
    categories: [
      { id: 'c1', name: 'Dwójki' },
      { id: 'c2', name: 'Trójki' },
    ],
    groups: [],
    teams: albatrosTeams(),
    matches: [],
  }
  return base
}

/** Both categories drawn into 4 groups each, with the default schedule. */
export function drawnState(rand: () => number = Math.random): State {
  return drawTournament(initialState(), { groups: { c1: GROUPS_PER_CATEGORY, c2: GROUPS_PER_CATEGORY }, schedule: DEFAULT_SCHEDULE }, rand)
}
