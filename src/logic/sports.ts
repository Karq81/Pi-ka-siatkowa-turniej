import type { Rules } from '../types'

/**
 * Disciplines offered on "Załóż turniej". Set sports keep the volleyball engine (sets to
 * N points with a 2-point lead); the others have one score per match (goals or points).
 */
export interface Sport {
  id: string
  label: string
  scoring: 'sets' | 'score'
  /** Set sports: how many sets and to how many points. */
  format?: 'one' | 'bo3' | 'bo5'
  setPoints?: number
  /** Points in the deciding set; the set points when missing. */
  lastSetPoints?: number
  /** Score sports: whether a match may end level, and what the score counts. */
  draws?: boolean
  unit?: string
  /** Table points for a win, a draw and a loss. */
  table: [number, number, number]
  /** A usual time from one match to the next (minutes). */
  slot: number
}

export const SPORTS: Sport[] = [
  { id: 'siatkowka', label: 'Siatkówka', scoring: 'sets', format: 'bo3', setPoints: 25, lastSetPoints: 15, table: [3, 1, 0], slot: 40 },
  { id: 'mini-siatkowka', label: 'Mini siatkówka', scoring: 'sets', format: 'one', setPoints: 15, table: [2, 1, 1], slot: 15 },
  { id: 'siatkowka-plazowa', label: 'Siatkówka plażowa', scoring: 'sets', format: 'bo3', setPoints: 21, lastSetPoints: 15, table: [2, 1, 1], slot: 40 },
  { id: 'pilka-nozna', label: 'Piłka nożna', scoring: 'score', draws: true, unit: 'bramki', table: [3, 1, 0], slot: 30 },
  { id: 'futsal', label: 'Futsal / halówka', scoring: 'score', draws: true, unit: 'bramki', table: [3, 1, 0], slot: 20 },
  { id: 'pilka-reczna', label: 'Piłka ręczna', scoring: 'score', draws: true, unit: 'bramki', table: [2, 1, 0], slot: 30 },
  { id: 'koszykowka', label: 'Koszykówka', scoring: 'score', draws: false, unit: 'punkty', table: [2, 0, 1], slot: 30 },
  { id: 'hokej', label: 'Hokej / unihokej', scoring: 'score', draws: true, unit: 'bramki', table: [3, 1, 0], slot: 30 },
  { id: 'badminton', label: 'Badminton', scoring: 'sets', format: 'bo3', setPoints: 21, table: [2, 1, 0], slot: 30 },
  { id: 'tenis-stolowy', label: 'Tenis stołowy', scoring: 'sets', format: 'bo5', setPoints: 11, table: [2, 1, 0], slot: 20 },
  { id: 'inna-sety', label: 'Inna dyscyplina (wynik w setach)', scoring: 'sets', format: 'bo3', setPoints: 25, table: [3, 1, 0], slot: 30 },
  { id: 'inna-wynik', label: 'Inna dyscyplina (bramki / punkty)', scoring: 'score', draws: true, unit: 'punkty', table: [3, 1, 0], slot: 30 },
]

export function sportById(id: string | undefined): Sport {
  return SPORTS.find((s) => s.id === id) ?? SPORTS[0]
}

/**
 * Match rules for a sport. For set sports the organiser may change the format and
 * the set points; for score sports whether draws are allowed.
 */
export function sportRules(sport: Sport, o: { format?: Sport['format']; setPoints?: number; draws?: boolean } = {}): Rules {
  const [pointsWin, pointsDraw, pointsLoss] = sport.table
  const base = { pointsWin, pointsDraw, pointsLoss, sport: sport.label, winBy: 2 }
  if (sport.scoring === 'score') {
    return {
      ...base, scoring: 'score', draws: o.draws ?? sport.draws ?? true, unit: sport.unit ?? 'punkty',
      setsMode: 'fixed', sets: 1, setPoints: 0, lastSetPoints: 0,
    }
  }
  const format = o.format ?? sport.format ?? 'bo3'
  const setPoints = o.setPoints ?? sport.setPoints ?? 25
  const sets = format === 'one' ? 1 : format === 'bo3' ? 3 : 5
  // The deciding set keeps its own length only when the set length is the sport's usual one.
  const last = setPoints === sport.setPoints ? sport.lastSetPoints ?? setPoints : setPoints
  return {
    ...base, scoring: 'sets',
    setsMode: format === 'one' ? 'fixed' : 'bestOf',
    sets, setPoints, lastSetPoints: format === 'one' ? setPoints : last,
  }
}
