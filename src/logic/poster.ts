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
  /** Sponsor's logo: an image as a data: URL, or BUILTIN_SPONSOR (Albatros CUP's own); '' = none. */
  sponsorLogo?: string
  /** Words next to the sponsor's logo (default: main sponsor of the tournament). */
  sponsorLabel?: string
}

/** Albatros CUP's main sponsor, whose logo is part of the site. */
export const BUILTIN_SPONSOR = 'builtin:albatros'
export const MAX_LOGO_CHARS = 250_000

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
  /** Private details of the account: on a poster only when the organiser ticks them. */
  contactName: string
  phone: string
  email: string
  website: string
}

export const MAX_LINES = 6
export const FIELD_LIMITS = { kicker: 60, title: 70, tagline: 120, when: 80, where: 80, line: 90, footer: 120, sponsorLabel: 40 }

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

/** What the organiser ticked to have on the poster (nothing personal is on it unless ticked). */
export interface PosterOptions {
  categories: boolean
  teams: boolean
  registration: boolean
  contact: boolean
  /** The contact person, as it should be written. */
  contactName: string
  phone: boolean
  email: boolean
  website: boolean
  fee: string
  prizes: string
  /** More points, one per line. */
  extra: string
}

/** The starting ticks: the tournament's own facts yes, anything about a person no. */
export function defaultOptions(f: PosterFacts): PosterOptions {
  return {
    categories: f.categories.length > 1, teams: false, registration: f.registration,
    contact: false, contactName: f.contactName, phone: false, email: false, website: false,
    fee: '', prizes: '', extra: '',
  }
}

/** The "Kontakt: …" line for what is ticked; empty when nothing is. */
export function contactLine(o: Pick<PosterOptions, 'contact' | 'contactName' | 'phone' | 'email'>, f: Pick<PosterFacts, 'phone' | 'email'>): string {
  const parts = [o.contact && o.contactName.trim(), o.phone && f.phone, o.email && f.email].filter(Boolean)
  return parts.length ? `${t('Kontakt')}: ${parts.join(' · ')}` : ''
}

/** Facts for the AI: private details only when ticked. */
export function factsFor(f: PosterFacts, o: PosterOptions): PosterFacts {
  return {
    ...f,
    categories: o.categories ? f.categories : [],
    teams: o.teams ? f.teams : 0,
    registration: o.registration && f.registration,
    contactName: o.contact ? o.contactName.trim() : '',
    phone: o.phone ? f.phone : '',
    email: o.email ? f.email : '',
    website: o.website ? f.website : '',
  }
}

/** What the organiser typed into the fee, prizes and more fields, as one instruction for the AI. */
export function optionsText(o: PosterOptions): string {
  return [o.fee.trim() && `${t('Wpisowe')}: ${o.fee.trim()}`, o.prizes.trim() && `${t('Nagrody')}: ${o.prizes.trim()}`, ...o.extra.split('\n').map((l) => l.trim())].filter(Boolean).join('\n')
}

/** A poster from the facts and what was ticked: everything the tournament and the account know, nothing invented. */
export function defaultPoster(f: PosterFacts, loc: string, o: PosterOptions = defaultOptions(f)): Poster {
  const lines: string[] = []
  if (o.categories && f.categories.length) lines.push(`${t('Kategorie')}: ${f.categories.join(', ')}`)
  if (o.teams && f.teams > 0) lines.push(t('Zgłoszone drużyny: {n}', { n: f.teams }))
  if (o.registration) lines.push(t('Zgłoszenia drużyn przez stronę turnieju (kod QR)'))
  lines.push(...optionsText(o).split('\n').filter(Boolean))
  const contact = contactLine(o, f)
  if (contact) lines.push(contact)
  return normalizePoster({
    theme: 'blue',
    kicker: f.sport ? t('Turniej: {sport}', { sport: f.sport }) : t('Turniej'),
    title: f.name,
    tagline: t('Zapraszamy zawodników i kibiców!'),
    when: posterDate(f.start, loc),
    where: f.city || f.subtitle,
    lines,
    footer: [f.organizer && t('Organizator: {name}', { name: f.organizer }), o.website && f.website].filter(Boolean).join(' · '),
    url: f.url,
  })
}

/** The poster has a "Kontakt: …" line, so its contact details were put there on purpose. */
export const hasContactLine = (p: Poster) => p.lines.some((l) => l.startsWith(`${t('Kontakt')}:`))

/** The poster's lines with the "Kontakt: …" line replaced by `line` (or removed when empty). */
export function withContactLine(p: Poster, line: string): Poster {
  const rest = p.lines.filter((l) => !l.startsWith(`${t('Kontakt')}:`))
  return { ...p, lines: (line ? [...rest.slice(0, MAX_LINES - 1), line] : rest).slice(0, MAX_LINES) }
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
    ...(validLogo(p.sponsorLogo) ? { sponsorLogo: p.sponsorLogo } : p.sponsorLogo === '' ? { sponsorLogo: '' } : {}),
    ...(p.sponsorLabel ? { sponsorLabel: clip(p.sponsorLabel, FIELD_LIMITS.sponsorLabel) } : {}),
  }
}

/** A logo we accept: the built-in one, or a small raster image (never a script or an outside address). */
function validLogo(v: unknown): v is string {
  return typeof v === 'string' && (v === BUILTIN_SPONSOR || (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length <= MAX_LOGO_CHARS))
}

/** Albatros CUP ("main") has its main sponsor's logo on the poster unless it was taken off. */
export function withSponsorDefault(p: Poster, tournamentId: string): Poster {
  return tournamentId === 'main' && p.sponsorLogo === undefined ? { ...p, sponsorLogo: BUILTIN_SPONSOR } : p
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

/**
 * Takes people's names out of a poster: the poster names the club, never a person. `names` are
 * the account's contact person(s); the full name and each longer part of it are removed, and
 * what is left of the sentence (separators, a label with nothing after it) is tidied.
 */
export function scrubNames(p: Poster, names: (string | undefined)[]): Poster {
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = new Set<string>()
  for (const n of names) {
    const full = (n ?? '').replace(/\s+/g, ' ').trim()
    if (full.length < 3) continue
    parts.add(esc(full))
    for (const w of full.split(' ')) if (w.length >= 5) parts.add(`\\S*${esc(w)}\\S*`)
  }
  if (!parts.size) return p
  const re = new RegExp([...parts].sort((a, b) => b.length - a.length).join('|'), 'giu')
  const clean = (text: string) => {
    if (!re.test(text)) return text
    re.lastIndex = 0
    return text.replace(re, '').replace(/\s+/g, ' ').replace(/(\s*[·,;–-]\s*){2,}/g, ' · ').replace(/^[\s·,;:–-]+|[\s·,;–-]+$/g, '').replace(/^[^:]{1,30}:$/, '').trim()
  }
  return {
    ...p,
    kicker: clean(p.kicker), title: clean(p.title), tagline: clean(p.tagline), when: clean(p.when), where: clean(p.where),
    lines: p.lines.map(clean).filter(Boolean), footer: clean(p.footer),
  }
}
