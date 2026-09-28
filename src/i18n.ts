/**
 * Languages of the site. Texts are written in Polish in the code, wrapped in t('…'); the
 * Polish text is the key of its translation in src/locales/<lang>.ts (loaded only for that
 * language). A missing translation shows the Polish text (src/i18n.test.ts checks there are none).
 *
 * The language is chosen before the app's modules load (see main.tsx), so t() works
 * everywhere, also in module-level constants; changing it reloads the page.
 */
export const LANGS = [
  { code: 'pl', name: 'Polski', locale: 'pl-PL' },
  { code: 'en', name: 'English', locale: 'en-GB' },
  { code: 'de', name: 'Deutsch', locale: 'de-DE' },
  { code: 'fr', name: 'Français', locale: 'fr-FR' },
  { code: 'es', name: 'Español', locale: 'es-ES' },
  { code: 'it', name: 'Italiano', locale: 'it-IT' },
  { code: 'pt', name: 'Português', locale: 'pt-PT' },
  { code: 'uk', name: 'Українська', locale: 'uk-UA' },
  { code: 'cs', name: 'Čeština', locale: 'cs-CZ' },
] as const

export type Lang = (typeof LANGS)[number]['code']

const STORAGE_KEY = 'sla:lang'

let lang: Lang = 'pl'
let dict: Record<string, string> = {}

const isLang = (v: unknown): v is Lang => LANGS.some((l) => l.code === v)

/** The language this visitor chose, or null when they never chose one. */
function chosen(): Lang | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return isLang(v) ? v : null
  } catch {
    return null
  }
}

/** The browser's first supported language, else English (Polish for Polish browsers). */
function fromBrowser(): Lang {
  const prefs = typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]
  for (const p of prefs) {
    const code = p.toLowerCase().split('-')[0]
    if (isLang(code)) return code
  }
  return 'en'
}

/**
 * Picks and loads the language: ?lang= in the address, then the visitor's choice, then
 * `fallback` (Albatros CUP: Polish), then the browser's language.
 */
export async function initLang(fallback?: Lang): Promise<void> {
  const param = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('lang')
  lang = isLang(param) ? param : chosen() ?? fallback ?? fromBrowser()
  if (lang !== 'pl') {
    try {
      dict = (await LOADERS[lang]()).default
    } catch {
      lang = 'pl'
    }
  }
  if (typeof document !== 'undefined') document.documentElement.lang = lang
}

const LOADERS: Record<Exclude<Lang, 'pl'>, () => Promise<{ default: Record<string, string> }>> = {
  en: () => import('./locales/en'),
  de: () => import('./locales/de'),
  fr: () => import('./locales/fr'),
  es: () => import('./locales/es'),
  it: () => import('./locales/it'),
  pt: () => import('./locales/pt'),
  uk: () => import('./locales/uk'),
  cs: () => import('./locales/cs'),
}

/** Remembers the visitor's language and reloads the page in it. */
export function setLang(next: Lang) {
  try { localStorage.setItem(STORAGE_KEY, next) } catch { /* no storage: this page only */ }
  const url = new URL(location.href)
  url.searchParams.delete('lang')
  location.replace(url.toString())
}

export function currentLang(): Lang {
  return lang
}

/** Locale for dates and numbers, e.g. "de-DE". */
export function locale(): string {
  return LANGS.find((l) => l.code === lang)!.locale
}

/** English name of the current language, for the AI assistant's answers. */
export function langNameEn(): string {
  return ({ pl: 'Polish', en: 'English', de: 'German', fr: 'French', es: 'Spanish', it: 'Italian', pt: 'Portuguese', uk: 'Ukrainian', cs: 'Czech' } as const)[lang]
}

function fill(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (all, k: string) => (k in vars ? String(vars[k]) : all))
}

/**
 * The words of the tournament's discipline: Polish text → the same text with "mata",
 * "walka"… (see logic/terms.ts). Null: the usual "boisko" and "mecz".
 */
let variants: Record<string, string> | null = null

export function setTermVariants(v: Record<string, string> | null) {
  variants = v
}

/** The text to translate: the discipline's variant when there is one (and it is translated). */
function source(pl: string): string {
  const v = variants?.[pl]
  if (!v) return dict[pl] ?? pl
  if (lang === 'pl') return v
  return dict[v] ?? dict[pl] ?? pl
}

/** Translation of a Polish text; {name} parts are filled from `vars`. */
export function t(pl: string, vars?: Record<string, string | number>): string {
  return fill(source(pl), vars)
}

/** Plural category order of each language's forms, separated by "|" in the text. */
const PLURAL_FORMS: Record<Lang, string[]> = {
  pl: ['one', 'few', 'many'],
  uk: ['one', 'few', 'many'],
  cs: ['one', 'few', 'other'],
  en: ['one', 'other'],
  de: ['one', 'other'],
  fr: ['one', 'other'],
  es: ['one', 'other'],
  it: ['one', 'other'],
  pt: ['one', 'other'],
}

/**
 * Text depending on a count: tp(n, '{n} mecz|{n} mecze|{n} meczów'). Each language lists
 * its own forms (Polish: 1 / 2–4 / 5+; English: 1 / other).
 */
export function tp(n: number, pl: string, vars?: Record<string, string | number>): string {
  const text = source(pl)
  const polish = lang === 'pl' || text === pl || text === variants?.[pl]
  const forms = text.split('|')
  const order = PLURAL_FORMS[polish ? 'pl' : lang]
  const cat = new Intl.PluralRules(polish ? 'pl-PL' : locale()).select(n)
  const i = order.indexOf(cat)
  const form = forms[i >= 0 ? i : forms.length - 1] ?? forms[forms.length - 1]
  return fill(form, { n, ...vars })
}

/** Marks a Polish text translated later with t(text) (e.g. in a table of messages). */
export function tk(pl: string): string {
  return pl
}
