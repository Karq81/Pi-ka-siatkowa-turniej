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

const CLUBS = [
  'Orlik', 'Iskra', 'Sokół', 'Olimp', 'Tęcza', 'Grom', 'Płomyk', 'Żak', 'Jedynka', 'Dwójka',
  'Wisełka', 'Pogoń', 'Czarni', 'Delfin', 'Kometa', 'Rakieta', 'Promyk', 'Huragan', 'Jastrząb', 'Lotos',
]
const TOWNS = ['Kraków', 'Tarnów', 'Bochnia', 'Wieliczka', 'Myślenice', 'Niepołomice', 'Skawina', 'Brzesko']

/** Example tournament: 60 teams in 3 categories, 4 groups of 5 each, 10 courts. */
export function demoState(): State {
  const categories: Category[] = [
    { id: 'c1', name: 'Dwójki' },
    { id: 'c2', name: 'Trójki' },
    { id: 'c3', name: 'Czwórki' },
  ]
  const teams: Team[] = []
  const groups: Group[] = []
  let t = 0
  for (const c of categories) {
    for (let g = 0; g < 4; g++) {
      const group: Group = { id: `${c.id}g${g + 1}`, categoryId: c.id, name: `Grupa ${'ABCD'[g]}`, teamIds: [] }
      for (let i = 0; i < 5; i++) {
        const club = CLUBS[t % CLUBS.length]
        const town = TOWNS[Math.floor(t / 3) % TOWNS.length]
        const team: Team = { id: `t${++t}`, name: `UKS ${club} ${town}`, categoryId: c.id }
        teams.push(team)
        group.teamIds.push(team.id)
      }
      groups.push(group)
    }
  }
  // Make names unique where club+town repeat across categories.
  const seen = new Map<string, number>()
  for (const team of teams) {
    const n = (seen.get(team.name) ?? 0) + 1
    seen.set(team.name, n)
    if (n > 1) team.name += ` ${'I'.repeat(n)}`
  }

  const rules = defaultRules
  const matches = buildGroupSchedule(groups, {
    courts: 10, start: '2026-10-23T09:00', slotMinutes: 25, dayEnd: '18:00',
  })

  // The tournament has just started: the first match on every court is live at 0:0.
  const firstSlot = matches.map((m) => m.start).sort()[0]
  for (const m of matches) {
    if (m.start === firstSlot) {
      m.sets = [{ a: 0, b: 0 }]
      m.status = 'live'
      m.updatedAt = 1
    }
  }

  return {
    tournament: {
      name: 'Albatros CUP 2026',
      subtitle: '23–25 października 2026 · Mielno · drużyny przykładowe',
      courts: 10,
      rules,
    },
    categories,
    groups,
    teams,
    matches,
  }
}
