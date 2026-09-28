import { setTermVariants } from '../i18n'
import { TERM_TEXTS } from './termsPl'

/**
 * Words of each discipline: where it is played (boisko, kort, stół, mata, tarcza, basen,
 * lodowisko, stanowisko) and what one game is called (mecz, walka, partia). The texts are
 * written with "boisko" and "mecz"; for other disciplines the translation layer swaps in the
 * declined words from termsPl.ts (generated, and checked by hand).
 */
export type TermSet = 'boisko' | 'kort' | 'stol' | 'mata' | 'szachy' | 'tarcza' | 'basen' | 'lodowisko' | 'stanowisko'

const BY_WORD: [RegExp, TermSet][] = [
  [/tenis sto|ping|piłkarzyki/i, 'stol'],
  [/tenis|padel|squash|badminton|pickleball|kort/i, 'kort'],
  [/judo|karate|zapas|taekwondo|jiu|sumo|aikido|mma|kickbox|sambo/i, 'mata'],
  [/szach|warcab|go\b/i, 'szachy'],
  [/dart|rzutki/i, 'tarcza'],
  [/piłka wodna|waterpolo|pływ/i, 'basen'],
  [/hokej na lodzie|łyżw|curling/i, 'lodowisko'],
  [/e-?sport|gry komputerowe|fifa|ea fc/i, 'stanowisko'],
]

/** The words for a discipline (its name as stored with the tournament). */
export function termSetFor(sport: string | undefined): TermSet {
  if (!sport) return 'boisko'
  return BY_WORD.find(([re]) => re.test(sport))?.[1] ?? 'boisko'
}

let current: TermSet = 'boisko'

/** Switches every text to the discipline's words (called when the tournament loads). */
export function useTermsOf(sport: string | undefined): TermSet {
  const set = termSetFor(sport)
  if (set !== current) {
    current = set
    setTermVariants(set === 'boisko' ? null : TERM_TEXTS[set] ?? null)
  }
  return set
}

export function currentTerms(): TermSet {
  return current
}

/**
 * Words shown on their own in other languages ("Mata {n}" → "Mat {n}"): the venue of each
 * discipline, alone, numbered and in the plural. Longer texts keep the usual words there.
 */
const VENUES: [string, string][] = [
  ['Mata', 'Maty'], ['Kort', 'Korty'], ['Stół', 'Stoły'], ['Tarcza', 'Tarcze'], ['Basen', 'Baseny'], ['Lodowisko', 'Lodowiska'], ['Stanowisko', 'Stanowiska'],
]
export const TERM_LABELS: string[] = VENUES.flatMap(([one, many]) => [`${one} {n}`, `· ${one}`, one, many])
