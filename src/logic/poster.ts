import { t, tk } from '../i18n'

/**
 * The poster of a tournament: what it says (`Poster`, kept on the organiser's account and
 * editable, also by the AI) and the facts it is made from (`PosterFacts`, read from the
 * tournament). The picture itself is drawn from these in views/posterCanvas.ts.
 */
export type PosterTheme = 'blue' | 'green' | 'red' | 'dark' | 'gold'

export const POSTER_THEMES: PosterTheme[] = ['blue', 'green', 'red', 'dark', 'gold']

export const THEME_NAMES: Record<PosterTheme, string> = {
  blue: tk('Niebieski'), green: tk('Zielony'), red: tk('Czerwony'), dark: tk('Ciemny'), gold: tk('Złoty'),
}

export interface Poster {
  theme: PosterTheme
  /** Small line above the title, e.g. "Turniej piłki nożnej". */
  kicker: string
  title: string
  tagline: string
  when: string
  where: string
  /** Extra lines under the date and place: categories, entry, prizes, contact… */
  lines: string[]
  /** The line at the very bottom (organiser, contact). */
  footer: string
  /** The address the QR code opens (the fan page). */
  url: string
}

/** What is known about the tournament and its organiser. */
export interface PosterFacts {
  name: string
  subtitle: string
  sport: string
  /** ISO local date-time of the first match. */
  start?: string
  categories: string[]
  teams: number
  courts: number
  registration: boolean
  url: string
  organizer: string
  city: string
  phone: string
  email: string
  website: string
}

export const MAX_LINES = 6
export const FIELD_LIMITS = { kicker: 60, title: 70, tagline: 120, when: 80, where: 80, line: 90, footer: 120 }

/** "23 października 2026, godz. 09:00" from the first match's time; empty when unknown. */
export function posterDate(start: string | undefined, loc: string): string {
  const m = start && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(start)
  if (!m) return ''
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(d.getTime())) return ''
  const day = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'long', year: 'numeric' }).format(d)
  return `${day}, ${t('godz.')} ${m[4]}:${m[5]}`
}

const clip = (s: unknown, n: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

/** A poster from the facts alone: everything the tournament and the account know, nothing invented. */
export function defaultPoster(f: PosterFacts, loc: string): Poster {
  const lines: string[] = []
  if (f.categories.length > 1) lines.push(`${t('Kategorie')}: ${f.categories.join(', ')}`)
  if (f.teams > 0) lines.push(t('Zgłoszone drużyny: {n}', { n: f.teams }))
  if (f.registration) lines.push(t('Zgłoszenia drużyn przez stronę turnieju (kod QR)'))
  const contact = [f.phone, f.email].filter(Boolean).join(' · ')
  if (contact) lines.push(`${t('Kontakt')}: ${contact}`)
  return normalizePoster({
    theme: 'blue',
    kicker: f.sport ? t('Turniej: {sport}', { sport: f.sport }) : t('Turniej'),
    title: f.name,
    tagline: t('Zapraszamy zawodników i kibiców!'),
    when: posterDate(f.start, loc),
    where: f.city || f.subtitle,
    lines,
    footer: [f.organizer && t('Organizator: {name}', { name: f.organizer }), f.website].filter(Boolean).join(' · '),
    url: f.url,
  })
}

/** Keeps a poster within sane limits (also for what the AI or the organiser typed). */
export function normalizePoster(p: Partial<Poster> & { url?: string }): Poster {
  const theme = POSTER_THEMES.includes(p.theme as PosterTheme) ? (p.theme as PosterTheme) : 'blue'
  return {
    theme,
    kicker: clip(p.kicker, FIELD_LIMITS.kicker),
    title: clip(p.title, FIELD_LIMITS.title),
    tagline: clip(p.tagline, FIELD_LIMITS.tagline),
    when: clip(p.when, FIELD_LIMITS.when),
    where: clip(p.where, FIELD_LIMITS.where),
    lines: (p.lines ?? []).map((l) => clip(l, FIELD_LIMITS.line)).filter(Boolean).slice(0, MAX_LINES),
    footer: clip(p.footer, FIELD_LIMITS.footer),
    url: String(p.url ?? '').slice(0, 300),
  }
}

/** Words of a text split into lines no wider than `fits` allows (a single long word stays whole). */
export function wrapWords(text: string, fits: (line: string) => boolean): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word
    if (!line || fits(next)) line = next
    else { lines.push(line); line = word }
  }
  if (line) lines.push(line)
  return lines
}

export interface ThemeColors { bg1: string; bg2: string; accent: string; ink: string; card: string; cardInk: string }

export const THEME_COLORS: Record<PosterTheme, ThemeColors> = {
  blue: { bg1: '#0b1b4a', bg2: '#2447b8', accent: '#ffd21f', ink: '#ffffff', card: '#ffffff', cardInk: '#0b1b4a' },
  green: { bg1: '#06301f', bg2: '#12804f', accent: '#ffe14d', ink: '#ffffff', card: '#ffffff', cardInk: '#06301f' },
  red: { bg1: '#4a0c12', bg2: '#c4262e', accent: '#ffd21f', ink: '#ffffff', card: '#ffffff', cardInk: '#4a0c12' },
  dark: { bg1: '#0a0d14', bg2: '#232b3d', accent: '#ff9f1c', ink: '#ffffff', card: '#f4f6fb', cardInk: '#0a0d14' },
  gold: { bg1: '#3b2a05', bg2: '#b98811', accent: '#ffffff', ink: '#ffffff', card: '#fff8e0', cardInk: '#3b2a05' },
}
