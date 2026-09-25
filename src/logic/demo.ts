import type { Category, Group, Rules, State, Team } from '../types'
import { buildGroupSchedule } from './schedule'

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

// Deterministic generator, so the example looks the same on every device.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

/**
 * Qualified teams of Albatros CUP 2026 (organiser's list): club → number of teams
 * in Dwójki and Trójki.
 */
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

/**
 * Albatros CUP with the real team list: Dwójki and Trójki, 4 groups each (so the
 * bracket starts with quarter-finals). A club with two teams gets "1" and "2", and
 * its teams go to different groups. Results are made up, to show how the site looks.
 */
export function demoState(): State {
  const categories: Category[] = [
    { id: 'c1', name: 'Dwójki' },
    { id: 'c2', name: 'Trójki' },
  ]
  const teams: Team[] = []
  const groups: Group[] = []
  for (const c of categories) {
    const key = c.id === 'c1' ? 'dwojki' : 'trojki'
    const catGroups: Group[] = Array.from({ length: GROUPS_PER_CATEGORY }, (_, g) => ({
      id: `${c.id}g${g + 1}`, categoryId: c.id, name: `Grupa ${'ABCDEFGH'[g]}`, teamIds: [],
    }))
    // Teams of one club are next to each other, so dealing them round the groups splits them up.
    let i = 0
    for (const club of CLUBS) {
      const count = club[key]
      for (let n = 1; n <= count; n++) {
        const team: Team = { id: `${c.id}t${teams.length + 1}`, name: count > 1 ? `${club.name} ${n}` : club.name, categoryId: c.id }
        teams.push(team)
        catGroups[i++ % GROUPS_PER_CATEGORY].teamIds.push(team.id)
      }
    }
    groups.push(...catGroups)
  }

  const rules = defaultRules
  // Friday 23.10 from 15:30, then Saturday and Sunday from 9:00; one set to 15 ≈ 20 minutes with changeover.
  const matches = buildGroupSchedule(groups, {
    courts: 10, start: '2026-10-23T15:30', slotMinutes: 20, dayEnd: '18:40', dayStart: '09:00',
  })

  // Example moment of the tournament: the first two rounds on the courts are finished,
  // the third is being played, the rest is still to come.
  const r = rng(2026)
  const slots = [...new Set(matches.map((m) => m.start))].sort()
  const target = rules.setPoints
  for (const m of matches) {
    const slot = slots.indexOf(m.start)
    if (slot < 2) {
      // Mostly clear wins, sometimes a close set that goes past the target.
      const close = r() < 0.2
      const win = close ? target + 1 + Math.floor(r() * 2) : target
      const lose = close ? win - rules.winBy : 4 + Math.floor(r() * (target - 6))
      m.sets = [r() < 0.5 ? { a: win, b: lose } : { a: lose, b: win }]
      m.status = 'finished'
      m.updatedAt = 1
    } else if (slot === 2) {
      m.sets = [{ a: Math.floor(r() * (target - 1)), b: Math.floor(r() * (target - 1)) }]
      m.status = 'live'
      m.updatedAt = 1
    }
  }

  return {
    tournament: {
      name: 'Albatros CUP 2026',
      subtitle: '23–25 października 2026 · Mielno · wyniki przykładowe (pokaz)',
      courts: 10,
      rules,
    },
    categories,
    groups,
    teams,
    matches,
  }
}
