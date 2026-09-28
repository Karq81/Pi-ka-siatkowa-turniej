import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LANGS } from './i18n'
import { SPORT_TEXTS } from './logic/sports'
import { TERM_LABELS } from './logic/terms'
import cs from './locales/cs'
import de from './locales/de'
import en from './locales/en'
import es from './locales/es'
import fr from './locales/fr'
import it_ from './locales/it'
import pt from './locales/pt'
import uk from './locales/uk'

const LOCALES: Record<string, Record<string, string>> = { en, de, fr, es, it: it_, pt, uk, cs }

/** Plural forms each language writes in tp() texts ("one|few|many" in Polish). */
const FORMS: Record<string, number> = { pl: 3, uk: 3, cs: 3, en: 2, de: 2, fr: 2, es: 2, it: 2, pt: 2 }

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'locales' ? [] : sources(path)
    return /\.tsx?$/.test(name) && !name.endsWith('.test.ts') && path !== join('src', 'i18n.ts') ? [path] : []
  })
}

const unescape = (s: string) => s.replace(/\\(.)/g, (_, c: string) => (c === 'n' ? '\n' : c))

/** Every Polish text passed to t(), tk() or tp() as a literal, and whether it is a plural. */
function keys(): Map<string, boolean> {
  const found = new Map<string, boolean>()
  const call = /\b(?:(?:t|tk)\(\s*|(tp)\(\s*[^'\n]*?,\s*)'((?:[^'\\]|\\.)*)'/g
  for (const file of sources('src')) {
    for (const m of readFileSync(file, 'utf8').matchAll(call)) found.set(unescape(m[2]), !!m[1])
  }
  for (const text of SPORT_TEXTS) found.set(text, false)
  for (const text of TERM_LABELS) found.set(text, false)
  return found
}

const placeholders = (s: string) => [...new Set(s.match(/\{\w+\}/g) ?? [])].sort()

describe('translations', () => {
  const all = keys()

  it('finds the texts', () => {
    expect(all.size).toBeGreaterThan(500)
  })

  it('lists a translation for every language', () => {
    expect(Object.keys(LOCALES).sort()).toEqual(LANGS.map((l) => l.code).filter((c) => c !== 'pl').sort())
  })

  for (const [lang, dict] of Object.entries(LOCALES)) {
    it(`${lang}: every text is translated, with the same {placeholders}`, () => {
      const missing = [...all.keys()].filter((k) => !dict[k]?.trim())
      expect(missing).toEqual([])
      const wrong = [...all.keys()].filter((k) => {
        if (all.get(k)) {
          const forms = dict[k].split('|')
          return forms.length !== FORMS[lang] || forms.some((f) => placeholders(f).join() !== placeholders(k.split('|')[0]).join())
        }
        return placeholders(dict[k]).join() !== placeholders(k).join()
      })
      expect(wrong).toEqual([])
    })

    it(`${lang}: no leftover texts`, () => {
      expect(Object.keys(dict).filter((k) => !all.has(k))).toEqual([])
    })
  }
})
