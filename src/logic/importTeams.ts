import type { Category, Group, State, Team } from '../types'

/** Parses "team;category;group" lines (semicolon, comma or tab separated, as pasted from Excel). */
export function parseTeams(text: string): Pick<State, 'categories' | 'groups' | 'teams'> {
  const categories: Category[] = []
  const groups: Group[] = []
  const teams: Team[] = []
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  for (const line of lines) {
    const [name, cat, grp] = line.split(/[;\t,]/).map((x) => x.trim())
    if (!name || !cat || !grp || name.toLowerCase() === 'drużyna') continue
    let c = categories.find((x) => x.name === cat)
    if (!c) categories.push((c = { id: `c${categories.length + 1}`, name: cat }))
    const gName = /^grupa/i.test(grp) ? grp : `Grupa ${grp}`
    let g = groups.find((x) => x.categoryId === c.id && x.name === gName)
    if (!g) groups.push((g = { id: `${c.id}g${groups.length + 1}`, categoryId: c.id, name: gName, teamIds: [] }))
    const team: Team = { id: `t${teams.length + 1}`, name, categoryId: c.id, club: name.replace(/\s+\d+$/, '') }
    teams.push(team)
    g.teamIds.push(team.id)
  }
  return { categories, groups, teams }
}
