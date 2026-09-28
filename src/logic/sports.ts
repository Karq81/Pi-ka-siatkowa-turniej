import { t, tk } from '../i18n'
import type { Rules, Tiebreak } from '../types'
import { profileOf, profileRules, type RulesProfile } from './profiles'

/**
 * Templates for "Załóż turniej": each discipline with its usual match formats and table
 * points. Set sports (volleyball, racket sports) use sets to N points with a lead of 2,
 * a cap where the sport has one (tennis and padel: tie-break at 6:6 gives 7:6; badminton:
 * 30:29) and an optional deciding set of its own length (super tie-break to 10). Team
 * sports with goals or points have one score per match.
 */

type MatchRules = Pick<Rules,
  'scoring' | 'setsMode' | 'sets' | 'setPoints' | 'lastSetPoints' | 'winBy' | 'cap' | 'lastSetCap' | 'draws' | 'unit' | 'fightSeconds'
  | 'periods' | 'periodMinutes' | 'scoreButtons'>

export interface SportFormat {
  id: string
  label: string
  rules: MatchRules
  /** Minutes from one match to the next, when not the discipline's usual (chess time controls). */
  slot?: number
}

/** A discipline as written below; its table points and tie-breakers come from its profile (src/profiles). */
type SportDef = Omit<Sport, 'table' | 'tieBreakSplit' | 'tiebreak' | 'profile'>

export interface Sport {
  id: string
  label: string
  /** Heading in the discipline list. */
  group: 'Siatkówka' | 'Sporty rakietowe' | 'Gry zespołowe' | 'Sporty walki' | 'Inne'
  /** Who is entered: teams, players, pairs. */
  entrants: 'drużyny' | 'zawodnicy' | 'pary' | 'zawodnicy lub pary'
  /** Table points for a win, a draw and a loss (from the profile). */
  table: [number, number, number]
  /** Volleyball's 3:2 rule (see Rules.tieBreakSplit). */
  tieBreakSplit?: boolean
  /** Tie-breakers after table points (see Rules.tiebreak). */
  tiebreak?: Tiebreak[]
  /** The discipline's rules profile (src/profiles/<id>.json). */
  profile?: RulesProfile
  /** A usual time from one match to the next (minutes). */
  slot: number
  /** The first is the default. */
  formats: SportFormat[]
  /** Short description of the rules, shown under the choice. */
  note: string
  /** "Inna dyscyplina": the organiser sets the set length. */
  custom?: boolean
}

interface SetOpts { last?: number; cap?: number; lastCap?: number; winBy?: number; fixed?: boolean; unit?: string }

/** `n` sets to `points` ("best of" unless `fixed`: then all are played and a draw is possible). */
function sets(n: number, points: number, o: SetOpts = {}): MatchRules {
  const one = n === 1 || o.fixed
  return {
    scoring: 'sets', setsMode: one ? 'fixed' : 'bestOf', sets: n, setPoints: points,
    lastSetPoints: one ? points : o.last ?? points, winBy: o.winBy ?? 2, cap: o.cap, lastSetCap: o.lastCap,
    unit: o.unit,
  }
}

function score(unit: string, draws: boolean): MatchRules {
  return { scoring: 'score', setsMode: 'fixed', sets: 1, setPoints: 0, lastSetPoints: 0, winBy: 1, draws, unit }
}

/** A judo contest of `seconds` regular time, then golden score (see judo.ts). */
function judo(seconds: number): MatchRules {
  return { scoring: 'judo', setsMode: 'fixed', sets: 1, setPoints: 0, lastSetPoints: 0, winBy: 1, draws: false, fightSeconds: seconds }
}

/** A karate kumite bout (WKF) of `seconds`. */
function karate(seconds: number): MatchRules {
  return { scoring: 'karate', setsMode: 'fixed', sets: 1, setPoints: 0, lastSetPoints: 0, winBy: 1, draws: false, fightSeconds: seconds }
}

/** A chess game: 1–0, ½–½, 0–1. */
const CHESS: MatchRules = { scoring: 'chess', setsMode: 'fixed', sets: 1, setPoints: 0, lastSetPoints: 0, winBy: 1, draws: true }

/** Goals or points: draws allowed or decided by extra time / penalties. */
function scoreFormats(unit: string, drawsFirst: boolean): SportFormat[] {
  const withDraws = { id: 'remis', label: t('Remis możliwy'), rules: score(unit, true) }
  const noDraws = { id: 'bez-remisu', label: t('Bez remisów (dogrywka, karne, rzuty)'), rules: score(unit, false) }
  return drawsFirst ? [withDraws, noDraws] : [noDraws, withDraws]
}

/** Tennis-style sets in games: to 6 with a tie-break at 6:6 (so 7:6 ends the set). */
const TENNIS: SportFormat[] = [
  { id: '2z3', label: t('2 z 3 setów do 6 gemów, tie-break przy 6:6'), rules: sets(3, 6, { cap: 7, unit: 'gemy' }) },
  { id: '2z3-stb', label: t('2 z 3 setów, trzeci set: super tie-break do 10'), rules: sets(3, 6, { cap: 7, last: 10, unit: 'gemy' }) },
  { id: '1set', label: t('1 set do 6 gemów, tie-break przy 6:6'), rules: sets(1, 6, { cap: 7, unit: 'gemy' }) },
  { id: 'pro9', label: t('Pro-set do 9 gemów, tie-break przy 8:8'), rules: sets(1, 9, { cap: 9, unit: 'gemy' }) },
  { id: 'fast4', label: t('Fast4 / krótkie sety: 2 z 3 setów do 4 gemów, tie-break przy 3:3 (np. pomarańczowa piłka)'), rules: sets(3, 4, { cap: 4, unit: 'gemy' }) },
  { id: 'fast4-1', label: t('1 krótki set do 4 gemów, tie-break przy 3:3 (np. zielona piłka)'), rules: sets(1, 4, { cap: 4, unit: 'gemy' }) },
  { id: 'tb10', label: t('Cały mecz to super tie-break do 10 pkt (np. czerwona piłka, najmłodsi)'), rules: sets(1, 10) },
]

const DEFS: SportDef[] = [
  {
    id: 'siatkowka', label: 'Siatkówka', group: 'Siatkówka', entrants: 'drużyny', slot: 40,
    note: t('Sety do 25 z przewagą 2, tie-break do 15. Tabela: 3:0 i 3:1 to 3 pkt, 3:2 to 2 pkt dla wygranego i 1 dla przegranego.'),
    formats: [
      { id: '2z3', label: t('2 z 3 setów do 25, trzeci do 15'), rules: sets(3, 25, { last: 15 }) },
      { id: '3z5', label: t('3 z 5 setów do 25, piąty do 15'), rules: sets(5, 25, { last: 15 }) },
      { id: '2sety', label: t('2 sety do 25 (możliwy remis)'), rules: sets(2, 25, { fixed: true }) },
      { id: '1set', label: t('1 set do 25'), rules: sets(1, 25) },
    ],
  },
  {
    id: 'mini-siatkowka', label: 'Mini siatkówka', group: 'Siatkówka', entrants: 'drużyny', slot: 15,
    note: t('Dzieci do 12–13 lat: dwójki, trójki i czwórki na mniejszym boisku. Sety z przewagą 2, zwykle 1 set do 15 lub 25 albo 2 z 3. Tabela: 2 pkt za wygraną, 1 za przegraną.'),
    formats: [
      { id: '1set15', label: t('1 set do 15'), rules: sets(1, 15) },
      { id: '1set21', label: t('1 set do 21'), rules: sets(1, 21) },
      { id: '1set25', label: t('1 set do 25 (jak w finałach mini siatkówki)'), rules: sets(1, 25) },
      { id: '2z3-15', label: t('2 z 3 setów do 15'), rules: sets(3, 15) },
      { id: '2z3-25', label: t('2 z 3 setów do 25, trzeci do 15'), rules: sets(3, 25, { last: 15 }) },
      { id: '2sety15', label: t('2 sety do 15 (możliwy remis)'), rules: sets(2, 15, { fixed: true }) },
    ],
  },
  {
    id: 'siatkowka-plazowa', label: 'Siatkówka plażowa', group: 'Siatkówka', entrants: 'pary', slot: 40,
    note: t('Sety do 21 z przewagą 2, trzeci do 15. Tabela: 2 pkt za wygraną, 1 za przegraną.'),
    formats: [
      { id: '2z3', label: t('2 z 3 setów do 21, trzeci do 15'), rules: sets(3, 21, { last: 15 }) },
      { id: '1set21', label: t('1 set do 21'), rules: sets(1, 21) },
      { id: '1set15', label: t('1 set do 15'), rules: sets(1, 15) },
    ],
  },
  {
    id: 'siatkowka-na-siedzaco', label: 'Siatkówka na siedząco', group: 'Siatkówka', entrants: 'drużyny', slot: 40,
    note: t('Zasady punktowania jak w siatkówce halowej.'),
    formats: [
      { id: '2z3', label: t('2 z 3 setów do 25, trzeci do 15'), rules: sets(3, 25, { last: 15 }) },
      { id: '3z5', label: t('3 z 5 setów do 25, piąty do 15'), rules: sets(5, 25, { last: 15 }) },
    ],
  },
  {
    id: 'tenis', label: 'Tenis', group: 'Sporty rakietowe', entrants: 'zawodnicy lub pary', slot: 90,
    note: t('Wynik wpisuje się w gemach. Set do 6 gemów z przewagą 2, przy 6:6 tie-break (set kończy się 7:6). Super tie-break: do 10 punktów z przewagą 2.'),
    formats: TENNIS,
  },
  {
    id: 'padel', label: 'Padel', group: 'Sporty rakietowe', entrants: 'pary', slot: 75,
    note: t('Liczenie jak w tenisie: gemy, set do 6 z tie-breakiem przy 6:6. W turniejach amatorskich trzeci set często zastępuje super tie-break do 10.'),
    formats: [TENNIS[1], TENNIS[0], TENNIS[2], TENNIS[3]],
  },
  {
    id: 'tenis-plazowy', label: 'Tenis plażowy', group: 'Sporty rakietowe', entrants: 'pary', slot: 45,
    note: t('Gemy jak w tenisie, zwykle jeden set do 6 z tie-breakiem przy 6:6.'),
    formats: [TENNIS[2], TENNIS[1], TENNIS[0]],
  },
  {
    id: 'squash', label: 'Squash', group: 'Sporty rakietowe', entrants: 'zawodnicy', slot: 45,
    note: t('Gemy do 11 punktów, każda wymiana to punkt (PAR). Przy 10:10 gra się do przewagi 2.'),
    formats: [
      { id: '3z5', label: t('3 z 5 gemów do 11'), rules: sets(5, 11) },
      { id: '2z3', label: t('2 z 3 gemów do 11'), rules: sets(3, 11) },
      { id: '2z3-15', label: t('2 z 3 gemów do 15'), rules: sets(3, 15) },
      { id: '1gem11', label: t('1 gem do 11 (dzieci, szybkie turnieje)'), rules: sets(1, 11) },
    ],
  },
  {
    id: 'badminton', label: 'Badminton', group: 'Sporty rakietowe', entrants: 'zawodnicy lub pary', slot: 30,
    note: t('Gemy do 21 z przewagą 2, przy 29:29 wygrywa ten, kto zdobędzie 30. punkt.'),
    formats: [
      { id: '2z3', label: t('2 z 3 gemów do 21'), rules: sets(3, 21, { cap: 30 }) },
      { id: '1gem21', label: t('1 gem do 21'), rules: sets(1, 21, { cap: 30 }) },
      { id: '2z3-15', label: t('2 z 3 gemów do 15 (do 21 maks.)'), rules: sets(3, 15, { cap: 21 }) },
      { id: '1gem15', label: t('1 gem do 15 (dzieci, szybkie turnieje)'), rules: sets(1, 15, { cap: 21 }) },
    ],
  },
  {
    id: 'tenis-stolowy', label: 'Tenis stołowy (ping-pong)', group: 'Sporty rakietowe', entrants: 'zawodnicy lub pary', slot: 25,
    note: t('Sety do 11 z przewagą 2. Tabela jak w lidze tenisa stołowego: 2 pkt za wygraną, 1 za przegraną.'),
    formats: [
      { id: '3z5', label: t('3 z 5 setów do 11'), rules: sets(5, 11) },
      { id: '2z3', label: t('2 z 3 setów do 11'), rules: sets(3, 11) },
      { id: '4z7', label: t('4 z 7 setów do 11'), rules: sets(7, 11) },
      { id: '1set11', label: t('1 set do 11 (dzieci, szybkie turnieje)'), rules: sets(1, 11) },
    ],
  },
  {
    id: 'pickleball', label: 'Pickleball', group: 'Sporty rakietowe', entrants: 'zawodnicy lub pary', slot: 30,
    note: t('Gry do 11 punktów z przewagą 2 (punkty zdobywa tylko serwujący).'),
    formats: [
      { id: '2z3', label: t('2 z 3 gier do 11'), rules: sets(3, 11) },
      { id: '1gra11', label: t('1 gra do 11'), rules: sets(1, 11) },
      { id: '1gra15', label: t('1 gra do 15'), rules: sets(1, 15) },
      { id: '1gra21', label: t('1 gra do 21'), rules: sets(1, 21) },
    ],
  },
  {
    id: 'pilka-nozna', label: 'Piłka nożna', group: 'Gry zespołowe', entrants: 'drużyny', slot: 30,
    note: t('Tabela: 3 pkt za wygraną, 1 za remis. Przy równej liczbie punktów decyduje różnica bramek. Turnieje dzieci (PZPN): przy 5–6 meczach dziennie mecz do 1×20 lub 2×10 min, przy 3–4 meczach do 1×25 lub 2×20 min.'),
    formats: scoreFormats('bramki', true),
  },
  {
    id: 'futsal', label: 'Futsal / halówka', group: 'Gry zespołowe', entrants: 'drużyny', slot: 20,
    note: t('Tabela: 3 pkt za wygraną, 1 za remis, potem różnica bramek.'),
    formats: scoreFormats('bramki', true),
  },
  {
    id: 'pilka-reczna', label: 'Piłka ręczna', group: 'Gry zespołowe', entrants: 'drużyny', slot: 30,
    note: t('Tabela: 2 pkt za wygraną, 1 za remis, potem różnica bramek.'),
    formats: scoreFormats('bramki', true),
  },
  {
    id: 'koszykowka', label: 'Koszykówka', group: 'Gry zespołowe', entrants: 'drużyny', slot: 30,
    note: t('Bez remisów (dogrywka). Tabela jak w FIBA: 2 pkt za wygraną, 1 za porażkę. Minikoszykówka (do 12 lat): 4×10 min; w turniejach dzieci remis bywa dozwolony, wybierz wtedy „Remis możliwy”.'),
    formats: scoreFormats('punkty', false),
  },
  {
    id: 'koszykowka-3x3', label: 'Koszykówka 3x3', group: 'Gry zespołowe', entrants: 'drużyny', slot: 15,
    note: t('Mecz do 21 punktów lub 10 minut, bez remisów (dogrywka do 2 punktów).'),
    formats: scoreFormats('punkty', false),
  },
  {
    id: 'hokej', label: 'Hokej na lodzie', group: 'Gry zespołowe', entrants: 'drużyny', slot: 40,
    note: t('Tabela: 3 pkt za wygraną, 1 za remis, potem różnica bramek.'),
    formats: scoreFormats('bramki', true),
  },
  {
    id: 'unihokej', label: 'Unihokej (floorball)', group: 'Gry zespołowe', entrants: 'drużyny', slot: 25,
    note: t('Tabela: 3 pkt za wygraną, 1 za remis, potem różnica bramek.'),
    formats: scoreFormats('bramki', true),
  },
  {
    id: 'hokej-na-trawie', label: 'Hokej na trawie', group: 'Gry zespołowe', entrants: 'drużyny', slot: 40,
    note: t('Tabela: 3 pkt za wygraną, 1 za remis. Remis w fazie pucharowej rozstrzygają najazdy.'),
    formats: scoreFormats('bramki', true),
  },
  {
    id: 'pilka-wodna', label: 'Piłka wodna', group: 'Gry zespołowe', entrants: 'drużyny', slot: 40,
    note: t('Tabela: 3 pkt za wygraną, 1 za remis. Remis w fazie pucharowej rozstrzygają rzuty karne.'),
    formats: scoreFormats('bramki', true),
  },
  {
    id: 'rugby-7', label: 'Rugby 7', group: 'Gry zespołowe', entrants: 'drużyny', slot: 25,
    note: t('Tabela jak w turniejach rugby 7: 3 pkt za wygraną, 2 za remis, 1 za porażkę.'),
    formats: scoreFormats('punkty', true),
  },
  {
    id: 'korfball', label: 'Korfball', group: 'Gry zespołowe', entrants: 'drużyny', slot: 30,
    note: t('Tabela: 2 pkt za wygraną, 1 za remis.'),
    formats: scoreFormats('punkty', true),
  },
  {
    id: 'judo', label: 'Judo', group: 'Sporty walki', entrants: 'zawodnicy', slot: 6,
    note: t('Punktacja IJF: ippon kończy walkę, dwa waza-ari to ippon, yuko nie sumują się w waza-ari. Trzecie shido to przegrana (hansoku-make). Remis po czasie: golden score, wygrywa pierwsza ocena. Trzymanie: yuko od 5 s, waza-ari od 10 s, ippon po 20 s.'),
    formats: [
      { id: '4min', label: t('Seniorzy, juniorzy i kadeci: 4 minuty'), rules: judo(240) },
      { id: '3min', label: t('Młodzicy (U15): 3 minuty'), rules: judo(180) },
      { id: '2min', label: t('Dzieci (U13): 2 minuty'), rules: judo(120) },
      { id: '90s', label: t('Najmłodsi: 1,5 minuty'), rules: judo(90) },
    ],
  },
  {
    id: 'karate', label: 'Karate (kumite WKF)', group: 'Sporty walki', entrants: 'zawodnicy', slot: 5,
    note: t('Punktacja WKF: yuko 1 pkt, waza-ari 2 pkt, ippon 3 pkt, punkty się sumują. Przewaga 8 punktów kończy walkę. Po czasie wygrywa więcej punktów, przy remisie senshu (pierwszy punkt), a bez senshu decyzja sędziów. Kary: chui 1–3, hansoku-chui, hansoku (dyskwalifikacja).'),
    formats: [
      { id: '3min', label: t('Seniorzy: 3 minuty'), rules: karate(180) },
      { id: '2min', label: t('Seniorki, juniorzy i kadeci: 2 minuty'), rules: karate(120) },
      { id: '90s', label: t('Dzieci i młodzicy: 1,5 minuty'), rules: karate(90) },
    ],
  },
  {
    id: 'szachy', label: 'Szachy', group: 'Inne', entrants: 'zawodnicy', slot: 30,
    note: t('Partia kończy się 1–0, ½–½ albo 0–1: wygrana to 1 pkt, remis ½, porażka 0. Tempo gry decyduje, co ile minut kolejna runda.'),
    formats: [
      { id: 'rapid10', label: t('Szachy szybkie 10 min + 5 s na ruch'), rules: CHESS, slot: 35 },
      { id: 'rapid15', label: t('Szachy szybkie 15 min + 10 s na ruch'), rules: CHESS, slot: 50 },
      { id: 'blitz', label: t('Błyskawiczne 3 min + 2 s na ruch'), rules: CHESS, slot: 12 },
      { id: 'blitz5', label: t('Błyskawiczne 5 minut'), rules: CHESS, slot: 15 },
      { id: 'klasyczne', label: t('Klasyczne 90 min + 30 s na ruch'), rules: CHESS, slot: 240 },
    ],
  },
  {
    id: 'dart', label: 'Dart', group: 'Inne', entrants: 'zawodnicy', slot: 20,
    note: t('Wynik w legach (np. 3:1). Bez remisów: gra się do wygrania określonej liczby legów.'),
    formats: [{ id: 'legi', label: t('Wynik w legach'), rules: score('legi', false) }],
  },
  {
    id: 'pilkarzyki', label: 'Piłkarzyki', group: 'Inne', entrants: 'zawodnicy lub pary', slot: 10,
    note: t('Wynik w bramkach, zwykle do 10 lub 5 goli. Bez remisów.'),
    formats: scoreFormats('bramki', false),
  },
  {
    id: 'esport', label: 'E-sport (np. EA FC)', group: 'Inne', entrants: 'zawodnicy', slot: 20,
    note: t('Wynik w bramkach lub punktach. Tabela: 3 pkt za wygraną, 1 za remis.'),
    formats: scoreFormats('bramki', true),
  },
  {
    id: 'inna-sety', label: 'Inna dyscyplina: wynik w setach', group: 'Inne', entrants: 'drużyny', slot: 30, custom: true,
    note: t('Ustaw liczbę setów i do ilu punktów grany jest set (przewaga 2).'),
    formats: [
      { id: '2z3', label: t('2 z 3 setów'), rules: sets(3, 25) },
      { id: '3z5', label: t('3 z 5 setów'), rules: sets(5, 25) },
      { id: '1set', label: t('1 set'), rules: sets(1, 25) },
    ],
  },
  {
    id: 'inna-wynik', label: 'Inna dyscyplina: bramki / punkty', group: 'Inne', entrants: 'drużyny', slot: 30, custom: true,
    note: t('Jeden wynik na mecz. Tabela: 3 pkt za wygraną, 1 za remis, potem różnica.'),
    formats: scoreFormats('punkty', true),
  },
]

export const SPORTS: Sport[] = DEFS.map((d) => {
  const profile = profileOf(d.id)
  if (!profile) return { ...d, table: [3, 1, 0] }
  const r = profileRules(profile)
  return { ...d, profile, table: [r.pointsWin!, r.pointsDraw!, r.pointsLoss!], tieBreakSplit: r.tieBreakSplit, tiebreak: r.tiebreak }
})

export function sportById(id: string | undefined): Sport {
  return SPORTS.find((s) => s.id === id) ?? SPORTS[0]
}

export function formatById(sport: Sport, id: string | undefined): SportFormat {
  return sport.formats.find((f) => f.id === id) ?? sport.formats[0]
}

/**
 * Match rules for a sport and format; `setPoints` only for "Inna dyscyplina: wynik w setach",
 * `fightSeconds` only for judo (a contest time other than the format's).
 */
export function sportRules(sport: Sport, formatId?: string, setPoints?: number, fightSeconds?: number): Rules {
  const f = formatById(sport, formatId).rules
  const [pointsWin, pointsDraw, pointsLoss] = sport.table
  const rules: Rules = { ...f, pointsWin, pointsDraw, pointsLoss, sport: sport.label, ...(sport.profile ? profileRules(sport.profile) : {}) }
  if (!rules.tieBreakSplit) delete rules.tieBreakSplit
  if ((f.scoring === 'judo' || f.scoring === 'karate') && fightSeconds && fightSeconds >= 30) rules.fightSeconds = Math.round(fightSeconds)
  if (sport.custom && f.scoring === 'sets' && setPoints) {
    return { ...rules, setPoints, lastSetPoints: setPoints }
  }
  return rules
}

/** Short description of a set-based format for referees: "sety do 6 gemów, tie-break przy 6:6". */
export function describeSets(rules: Rules): string {
  const games = rules.unit === 'gemy'
  const n = rules.setPoints
  const parts = [games ? t('sety do {n} gemów', { n }) : t('sety do {n} pkt', { n })]
  if (rules.cap === n + 1) parts.push(t('tie-break przy {a}:{a}', { a: n }))
  else if (rules.cap === n) parts.push(t('tie-break przy {a}:{a}', { a: n - 1 }))
  else if (rules.cap) parts.push(t('maksymalnie do {n}', { n: rules.cap }))
  if (rules.setsMode === 'bestOf' && rules.sets > 1 && rules.lastSetPoints !== n) {
    parts.push(games
      ? t('decydujący super tie-break do {n} pkt', { n: rules.lastSetPoints })
      : t('decydujący set do {n} pkt', { n: rules.lastSetPoints }))
  }
  parts.push(t('przewaga {n}', { n: rules.winBy }))
  return parts.join(', ')
}

/**
 * How a timed game is played, for the referee's panel: parts and their length (official
 * rules for seniors; the organiser can change them), scoring buttons, timed penalties.
 */
export interface PlayRules {
  periods: number
  periodMinutes: number
  part: 'połowa' | 'kwarta' | 'tercja' | 'część'
  buttons?: { points: number; label: string }[]
  /** A timed suspension (handball, hockey: 2 minutes; water polo: 20 s). */
  penaltySeconds?: number
}

const PLAY: Record<string, PlayRules> = {
  'Piłka nożna': { periods: 2, periodMinutes: 45, part: 'połowa' },
  'Futsal / halówka': { periods: 2, periodMinutes: 20, part: 'połowa' },
  'Piłka ręczna': { periods: 2, periodMinutes: 30, part: 'połowa', penaltySeconds: 120 },
  'Koszykówka': { periods: 4, periodMinutes: 10, part: 'kwarta', buttons: [{ points: 1, label: tk('rzut wolny') }, { points: 2, label: tk('za 2') }, { points: 3, label: tk('za 3') }] },
  'Koszykówka 3x3': { periods: 1, periodMinutes: 10, part: 'część', buttons: [{ points: 1, label: tk('z łuku i wolny') }, { points: 2, label: tk('zza łuku') }] },
  'Hokej na lodzie': { periods: 3, periodMinutes: 20, part: 'tercja', penaltySeconds: 120 },
  'Unihokej (floorball)': { periods: 3, periodMinutes: 20, part: 'tercja', penaltySeconds: 120 },
  'Hokej na trawie': { periods: 4, periodMinutes: 15, part: 'kwarta' },
  'Piłka wodna': { periods: 4, periodMinutes: 8, part: 'kwarta', penaltySeconds: 20 },
  'Rugby 7': { periods: 2, periodMinutes: 7, part: 'połowa', buttons: [{ points: 5, label: tk('przyłożenie') }, { points: 2, label: tk('podwyższenie') }, { points: 3, label: tk('karny / drop') }] },
  'Korfball': { periods: 2, periodMinutes: 25, part: 'połowa' },
}

/** The discipline's way of play, with the organiser's own game time when set. */
export function playOf(rules: Rules): PlayRules | null {
  const base = rules.sport ? PLAY[rules.sport] : undefined
  if (!base && !rules.periods) return null
  const p: PlayRules = base ?? { periods: 1, periodMinutes: 10, part: 'część' }
  return { ...p, periods: rules.periods ?? p.periods, periodMinutes: rules.periodMinutes ?? p.periodMinutes }
}

/** "1. połowa", "3. kwarta"… */
export function partLabel(part: PlayRules['part'], n: number): string {
  return part === 'połowa' ? t('{n}. połowa', { n }) : part === 'kwarta' ? t('{n}. kwarta', { n }) : part === 'tercja' ? t('{n}. tercja', { n }) : t('Część {n}', { n })
}

/** A tournament's discipline as shown: the catalogue's name translated, or the organiser's own name. */
export function sportLabelOf(rules: Pick<Rules, 'sport'>): string {
  if (!rules.sport) return ''
  const known = SPORTS.find((s) => s.label === rules.sport)
  return known ? t(known.label) : rules.sport
}

/** Name of a discipline in the visitor's language (the Polish name is what tournaments store). */
export function sportName(sport: Sport): string {
  return t(sport.label)
}

/** Every Polish text shown from the catalogue's data fields (for the translation check). */
export const SPORT_TEXTS: string[] = [
  ...SPORTS.flatMap((s) => [s.label, s.group, s.entrants]),
  'gemy', 'bramki', 'punkty', 'legi', 'małe punkty',
]
