import type { Category, Group, Rules, SetScore, State, Team } from '../types'
import { buildGroupSchedule } from './schedule'
import { isMatchDecided, setTarget } from './scoring'

export const defaultRules: Rules = {
  setsMode: 'bestOf',
  sets: 3,
  setPoints: 25,
  lastSetPoints: 15,
  winBy: 2,
  pointsWin: 2,
  pointsDraw: 1,
  pointsLoss: 0,
}

// Deterministic PRNG so the demo looks the same on every device.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

const CLUBS = [
  'Orlik', 'Iskra', 'Sokół', 'Olimp', 'Tęcza', 'Grom', 'Płomyk', 'Żak', 'Jedynka', 'Dwójka',
  'Wisełka', 'Pogoń', 'Czarni', 'Delfin', 'Kometa', 'Rakieta', 'Promyk', 'Huragan', 'Jastrząb', 'Lotos',
]
const TOWNS = ['Kraków', 'Tarnów', 'Bochnia', 'Wieliczka', 'Myślenice', 'Niepołomice', 'Skawina', 'Brzesko']

function randomSet(r: () => number, target: number, aWins: boolean): SetScore {
  const loser = Math.floor(target * 0.45 + r() * (target * 0.45))
  const extra = r() < 0.15 ? 1 + Math.floor(r() * 4) : 0
  const w = extra ? target + extra : target
  const l = extra ? w - 2 : Math.min(loser, target - 2)
  return aWins ? { a: w, b: l } : { a: l, b: w }
}

/** Example tournament: 60 teams in 3 categories, 4 groups of 5 each, 10 courts. */
export function demoState(): State {
  const r = rng(2026)
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

  // Pretend the tournament is under way: first slots finished, the next one live.
  const slots = [...new Set(matches.map((m) => m.start))].sort()
  const finishedSlots = new Set(slots.slice(0, 4))
  const liveSlot = slots[4]
  for (const m of matches) {
    if (finishedSlots.has(m.start)) {
      const sets: SetScore[] = []
      while (!isMatchDecided(rules, sets)) sets.push(randomSet(r, setTarget(rules, sets.length), r() < 0.55))
      m.sets = sets
      m.status = 'finished'
      m.updatedAt = 1
    } else if (m.start === liveSlot) {
      const done = Math.floor(r() * 2)
      const sets: SetScore[] = []
      for (let i = 0; i < done; i++) sets.push(randomSet(r, setTarget(rules, i), r() < 0.5))
      sets.push({ a: Math.floor(r() * 20), b: Math.floor(r() * 20) })
      m.sets = sets
      m.status = 'live'
      m.updatedAt = 1
    }
  }

  return {
    tournament: {
      name: 'Turniej Mini Siatkówki',
      subtitle: '23–25 października 2026 · dane przykładowe',
      courts: 10,
      rules,
    },
    categories,
    groups,
    teams,
    matches,
  }
}
