#!/usr/bin/env node
/*
 * Translations of the site (Polish is the key; see src/i18n.ts).
 *
 *   node scripts/i18n.mjs missing          – Polish texts in the code without a translation, per language
 *   node scripts/i18n.mjs add batch.json   – adds translations and writes src/locales/*.ts again
 *   node scripts/i18n.mjs write            – writes src/locales/*.ts again (order, unused texts out)
 *
 * batch.json: { "keys": ["Polski tekst", …], "en": ["English", …], "de": […], … } – one list per
 * language, in the order of "keys". Plural texts ("{n} mecz|{n} mecze|{n} meczów") need 2 forms
 * ("|"), and 3 in uk and cs. Placeholders ({n}, {team}…) must stay the same.
 * The check that every text is translated is a unit test (src/i18n.test.ts, npm test).
 */
import fs from 'node:fs'
import path from 'node:path'

const LANGS = ['en', 'de', 'fr', 'es', 'it', 'pt', 'uk', 'cs']
const FORMS = { uk: 3, cs: 3 }
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const locale = (lang) => path.join(root, 'src', 'locales', `${lang}.ts`)
// Texts that are not written as t('…') in the code: the disciplines' words (logic/termsPl.ts).
const EXTRA = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'i18n-extra.json'), 'utf8'))

const CALL = /\b(?:(t|tk)\(\s*|(tp)\(\s*[^'\n]*?,\s*)'((?:[^'\\]|\\.)*)'/g
const unescape = (s) => (s.includes('\\') ? JSON.parse(`"${s.replace(/\\'/g, "'").replace(/"/g, '\\"')}"`) : s)

/** Every Polish text shown by the site, in a fixed order. */
export function codeKeys() {
  const keys = new Set()
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) { if (e.name !== 'locales') walk(p); continue }
      if (!/\.tsx?$/.test(e.name) || e.name.endsWith('.test.ts') || p.endsWith(path.join('src', 'i18n.ts'))) continue
      for (const m of fs.readFileSync(p, 'utf8').matchAll(CALL)) keys.add(unescape(m[3]))
    }
  }
  walk(path.join(root, 'src'))
  // The catalogue's data: discipline names, groups, entrants; units.
  const sports = fs.readFileSync(path.join(root, 'src', 'logic', 'sports.ts'), 'utf8')
  for (const m of sports.matchAll(/id: '[^']+', label: '([^']+)', group: '([^']+)', entrants: '([^']+)'/g)) for (const k of m.slice(1)) keys.add(k)
  for (const k of ['gemy', 'bramki', 'punkty', 'legi', 'małe punkty']) keys.add(k)
  const sorted = [...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  return [...sorted, ...EXTRA.filter((k) => !keys.has(k))]
}

function readLocale(lang) {
  const dict = {}
  for (const line of fs.readFileSync(locale(lang), 'utf8').split('\n')) {
    if (!line.startsWith('  "')) continue
    Object.assign(dict, JSON.parse(`{${line.replace(/,\s*$/, '')}}`))
  }
  return dict
}

const ph = (s) => [...new Set(s.match(/\{\w+\}/g) ?? [])].sort().join()

function problems(lang, keys, dict) {
  const out = []
  for (const k of keys) {
    const v = dict[k]
    if (v === undefined) { out.push(`${lang} brak: ${JSON.stringify(k)}`); continue }
    if (k.includes('|')) {
      const forms = v.split('|')
      if (forms.length !== (FORMS[lang] ?? 2) || forms.some((f) => ph(f) !== ph(k.split('|')[0]))) out.push(`${lang} liczba mnoga: ${k} → ${v}`)
    } else if (ph(v) !== ph(k)) out.push(`${lang} {…}: ${k} → ${v}`)
  }
  return out
}

function write(lang, keys, dict) {
  const lines = ['/* Generated from the Polish texts in the code (see src/i18n.ts). */', 'const dict: Record<string, string> = {']
  for (const k of keys) if (dict[k] !== undefined) lines.push(`  ${JSON.stringify(k)}: ${JSON.stringify(dict[k])},`)
  lines.push('}', '', 'export default dict', '')
  fs.writeFileSync(locale(lang), lines.join('\n'))
}

const [cmd, file] = process.argv.slice(2)
const keys = codeKeys()
if (cmd === 'missing') {
  let n = 0
  for (const lang of LANGS) {
    const dict = readLocale(lang)
    const miss = keys.filter((k) => dict[k] === undefined)
    n += miss.length
    if (lang === 'en') for (const k of miss) console.log(JSON.stringify(k))
  }
  console.log(n ? `\nBrakuje tłumaczeń: ${n} (wszystkie języki razem).` : 'Wszystko przetłumaczone.')
  process.exit(n ? 1 : 0)
} else if (cmd === 'add' || cmd === 'write') {
  const batch = cmd === 'add' ? JSON.parse(fs.readFileSync(file, 'utf8')) : null
  let bad = []
  for (const lang of LANGS) {
    const dict = readLocale(lang)
    if (batch) {
      if (batch[lang]?.length !== batch.keys.length) { console.error(`${lang}: ${batch[lang]?.length ?? 0} tłumaczeń, a tekstów ${batch.keys.length}`); process.exit(1) }
      batch.keys.forEach((k, i) => { dict[k] = batch[lang][i] })
    }
    bad = bad.concat(problems(lang, keys, dict))
    write(lang, keys, dict)
  }
  for (const b of bad) console.log(b)
  console.log(bad.length ? `Problemy: ${bad.length}` : 'Zapisane, wszystko się zgadza.')
  process.exit(bad.length ? 1 : 0)
} else {
  console.log('Użycie: node scripts/i18n.mjs missing | add batch.json | write')
  process.exit(2)
}
