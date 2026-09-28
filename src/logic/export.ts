import { t } from '../i18n'
import type { Match, State } from '../types'
import { sourceLabel } from './knockout'
import { isScore, scoreUnit, setText, setsText, standings, tally } from './scoring'
import { sportLabelOf } from './sports'
import { eliminationPlaces, hasElimination } from './elimination'
import { customPlaces, hasCustom } from './custom'
import { xlsx, type Cell, type Sheet } from './xlsx'
import { koWinner } from './legs'

/*
 * The tournament as an Excel file, at any moment: every match with its time, court and
 * result so far, the group tables, the final places decided so far, and the teams.
 */

const byTime = (a: Match, b: Match) => a.start.localeCompare(b.start) || a.court - b.court

export function resultSheets(state: State): Sheet[] {
  const { rules } = state.tournament
  const team = new Map(state.teams.map((x) => [x.id, x]))
  const teamName = (id: string) => team.get(id)?.name ?? ''
  // The draw fills in the club with the team's own name when none was given.
  const club = (id: string) => { const x = team.get(id); return x?.club && x.club !== x.name ? x.club : '' }
  const category = (id: string) => state.categories.find((c) => c.id === id)?.name ?? ''
  const group = (id: string) => state.groups.find((g) => g.id === id)?.name ?? ''
  const court = (n: number) => state.tournament.courtNames?.[n - 1] ?? String(n)
  const side = (m: Match, s: 'a' | 'b') => {
    const id = s === 'a' ? m.teamA : m.teamB
    if (id) return teamName(id)
    return m.ko ? sourceLabel(state, s === 'a' ? m.ko.srcA : m.ko.srcB) : ''
  }
  const status = (m: Match) => (m.status === 'finished' ? t('Koniec meczu') : m.status === 'live' ? t('Trwa') : t('Zaplanowany'))
  const score = isScore(rules)

  // Matches: sets won (or the score) in two number columns, so they can be added up.
  const matches: Cell[][] = [[
    t('Kategoria'), t('Etap'), t('Dzień'), t('Godzina'), t('Boisko'), t('Drużyna A'), t('Drużyna B'),
    score ? `${t('Wynik')} A` : `${t('Sety')} A`, score ? `${t('Wynik')} B` : `${t('Sety')} B`,
    score ? t('Wynik') : t('Wynik w setach'), t('Status'),
  ]]
  for (const m of [...state.matches].sort(byTime)) {
    if (m.skipped) continue
    const started = m.status !== 'scheduled' && m.sets.length > 0
    const tl = started ? tally(rules, m.sets) : null
    const a = !tl ? null : score ? m.sets[0].a : tl.setsA
    const b = !tl ? null : score ? m.sets[0].b : tl.setsB
    matches.push([
      category(m.categoryId), m.ko?.label ?? group(m.groupId), m.start.slice(0, 10), m.start.slice(11, 16), court(m.court),
      side(m, 'a'), side(m, 'b'), a, b,
      !started ? '' : score ? setText(rules, m.sets[0]) : setsText(rules, m.sets), status(m),
    ])
  }

  // Group tables as they stand now.
  const unit = scoreUnit(rules)
  const tables: Cell[][] = [[
    t('Kategoria'), t('Grupa'), t('Miejsce'), t('Drużyna'), t('Klub'), t('Mecze'), t('Wygrane'), t('Remisy'), t('Porażki'),
    ...(score ? [] : [t('Sety wygrane'), t('Sety przegrane')]),
    `${unit} +`, `${unit} −`, t('Punkty'),
  ]]
  for (const c of state.categories) {
    for (const g of state.groups.filter((x) => x.categoryId === c.id)) {
      standings(rules, g, state.matches, state.teams).forEach((r, i) => {
        tables.push([
          c.name, g.name, i + 1, teamName(r.teamId), club(r.teamId), r.played, r.won, r.drawn, r.lost,
          ...(score ? [] : [r.setsWon, r.setsLost]),
          r.pointsWon, r.pointsLost, r.tablePoints,
        ])
      })
    }
  }

  // Final places: the winner and the loser of each finished match for a place.
  const places: Cell[][] = [[t('Kategoria'), t('Miejsce'), t('Drużyna'), t('Klub')]]
  const winnerOf = (m: Match) => koWinner(state, m)
  for (const c of state.categories) {
    if (hasCustom(state, c.id)) {
      customPlaces(state, c.id, winnerOf).forEach(({ place, teamId }) => places.push([c.name, place, teamName(teamId), club(teamId)]))
      continue
    }
    if (hasElimination(state, c.id)) {
      eliminationPlaces(state, c.id, winnerOf).forEach(({ place, teamId }) => places.push([c.name, place, teamName(teamId), club(teamId)]))
      continue
    }
    const rows: [number, string][] = []
    for (const m of state.matches) {
      if (m.categoryId !== c.id || m.ko?.round !== 'P' || !m.ko.place || m.status !== 'finished' || !m.sets.length) continue
      const tl = tally(rules, m.sets)
      if (tl.setsA === tl.setsB) continue
      const aWins = tl.setsA > tl.setsB
      rows.push([m.ko.place, aWins ? m.teamA : m.teamB], [m.ko.place + 1, aWins ? m.teamB : m.teamA])
    }
    rows.sort((x, y) => x[0] - y[0]).forEach(([p, id]) => places.push([c.name, p, teamName(id), club(id)]))
  }

  const teams: Cell[][] = [[t('Kategoria'), t('Drużyna'), t('Klub'), t('Grupa')]]
  for (const c of state.categories) {
    for (const x of state.teams.filter((x) => x.categoryId === c.id)) {
      teams.push([c.name, x.name, club(x.id), state.groups.find((g) => g.teamIds.includes(x.id))?.name ?? ''])
    }
  }

  const info: Cell[][] = [
    [state.tournament.name],
    [state.tournament.subtitle],
    [t('Dyscyplina'), sportLabelOf(rules)],
    [t('Stan na'), new Date().toLocaleString()],
    [t('Zakończone mecze'), state.matches.filter((m) => m.status === 'finished').length],
    [t('Wszystkie mecze'), state.matches.length],
  ]

  return [
    { name: t('Mecze'), rows: matches },
    { name: t('Tabele grup'), rows: tables },
    ...(places.length > 1 ? [{ name: t('Klasyfikacja końcowa'), rows: places }] : []),
    { name: t('Drużyny'), rows: teams },
    { name: t('Turniej'), rows: info },
  ]
}

/** File name from the tournament's name and today's date, e.g. "Puchar-Wiosny-2026-05-10.xlsx". */
export function exportFileName(state: State, now = new Date()): string {
  const base = state.tournament.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'turniej'
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return `${base}-${d}.xlsx`
}

/** Builds the file and hands it to the browser to save. */
export function downloadResults(state: State) {
  const blob = new Blob([xlsx(resultSheets(state)) as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = exportFileName(state)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
