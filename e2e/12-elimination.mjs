import { chromium } from 'playwright'
// Screenshots and files go to e2e/out (or E2E_OUT). Runs against the Firebase emulators only.
const OUT = process.env.E2E_OUT || 'e2e/out'
const S = OUT
const U = process.env.E2E_URL || 'http://localhost:5191/'
const API = 'http://127.0.0.1:8080/v1/projects/demo-siatkalive/databases/(default)/documents/tournaments'
const H = { Authorization: 'Bearer owner' }
const val = (v) => v.stringValue ?? (v.integerValue !== undefined ? +v.integerValue : v.doubleValue !== undefined ? v.doubleValue : v.booleanValue !== undefined ? v.booleanValue : v.arrayValue ? (v.arrayValue.values ?? []).map(val) : v.mapValue ? Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, val(x)])) : null)
const tdoc = async (t) => val({ mapValue: { fields: (await (await fetch(`${API}/${t}`, { headers: H })).json()).fields } })
const matches = async (t) => {
  const j = await (await fetch(`${API}/${t}/matches?pageSize=100`, { headers: H })).json()
  return (j.documents ?? []).flatMap((d) => Object.values(val({ mapValue: { fields: d.fields } }).matches ?? {}))
}
const res = []; const check = (n, ok, info = '') => { res.push(ok); console.log(ok ? 'OK  ' : 'BŁĄD', n, info) }
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: "pl-PL" })
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message))
const rnd = Math.random().toString(36).slice(2, 6)
const phone = async () => { const r = await ctx.newPage(); await r.setViewportSize({ width: 390, height: 844 }); r.on('pageerror', (e) => errs.push('ref: ' + e.message)); return r }

async function create(sport, format, players, opts = {}) {
  const slug = `e2e-${sport}-${rnd}`.slice(0, 40)
  await p.goto(U + '#nowy-turniej'); await p.reload(); await p.waitForTimeout(1500)
  await p.locator('.new-t-form select').first().selectOption(sport)
  if (format) await p.locator('.new-t-form select').nth(1).selectOption(format)
  if (opts.system) await p.locator('.system-opt').filter({ has: p.locator('b', { hasText: new RegExp('^' + opts.system + '($| \\()') }) }).click()
  if (opts.customName) await p.getByLabel('Nazwa dyscypliny').fill(opts.customName)
  await p.getByLabel(/Nazwa turnieju/).fill(`E2E ${sport}`)
  await p.getByRole('button', { name: 'zmień' }).click()
  await p.locator('.new-t-address input').fill(slug)
  await p.getByLabel(/Dzień pierwszego meczu/).fill('2027-05-08')
  await p.getByRole('button', { name: /Dalej/ }).click()
  await p.waitForURL(new RegExp(`t=${slug}`), { timeout: 15000 }); await p.waitForTimeout(1500)
  await p.locator('#pin-admin').fill('4321'); await p.getByRole('button', { name: 'Utwórz turniej' }).click()
  await p.locator('.setup-cat textarea').first().waitFor({ timeout: 20000 })
  await p.locator('.setup-cat textarea').first().fill(players.join('\n'))
  if (!opts.system) await p.locator('.setup-cat input[inputmode=numeric]').first().fill('1')
  await p.waitForTimeout(500)
  const btn = p.locator('.setup-cat').first().getByRole('button', { name: /losuj (grupy|drabinkę)/ })
  if (await btn.isDisabled()) { await p.screenshot({ path: `${S}/fail-create-${sport}.png`, fullPage: true }); console.log('DISABLED', sport, await p.locator('.setup-cat').first().innerText()) }
  await btn.click()
  await p.locator('.setup-cat .ok').first().waitFor({ timeout: 15000 }); await p.waitForTimeout(1200)
  return slug
}
import { readFileSync } from 'fs'
const names17 = readFileSync(S + '/judo-paste.txt', 'utf8').split('\n').filter((l) => /^[A-ZŁŚŻ][a-ząćęłńóśźż]+ [A-ZŁŚŻ][a-ząćęłńóśźż]+$/.test(l))

// A. judo, 17 players, double elimination chosen in the form
const js = await create('judo', null, names17, { system: 'Podwójna eliminacja' })
let T = await tdoc(js)
let ms = await matches(js)
check('A. System zapisany: podwójna eliminacja', T.tournament.system === 'double', T.tournament.system)
check('A. Bez grup, 33 spotkania w drabince (32 + ewentualny rewanż)', T.groups.length === 0 && ms.length === 33 && ms.every((m) => m.ko?.bracket), `${T.groups.length} grup, ${ms.length} spotkań`)
check('A. Jedna walka wstępna, potem 1/8 finału (8 walk)', ms.filter((m) => m.ko.bracket === 'W' && m.ko.col === 1).length === 1 && ms.filter((m) => m.ko.bracket === 'W' && m.ko.col === 2).length === 8)
check('A. 15 zawodników z wolnym losem już wpisanych w 1/8', ms.filter((m) => m.ko.bracket === 'W' && m.ko.col === 2).reduce((n, m) => n + (m.teamA ? 1 : 0) + (m.teamB ? 1 : 0), 0) === 15)
const okMsg = await p.locator('.setup-cat .ok').first().innerText().catch(() => '')
check('A. Komunikat „Rozlosowano drabinkę”', okMsg.includes('Rozlosowano drabinkę: 17'), okMsg)
const fan = await phone()
await fan.goto(U + `?t=${js}#grupy`); await fan.waitForTimeout(2500)
const tabs = await fan.locator('.tabs').first().innerText()
const page = await fan.locator('.elim').innerText().catch(() => '')
check('A. Kibic: zakładka „Drabinka i terminarz”', tabs.includes('Drabinka i terminarz'), tabs.replace(/\n/g, ' | '))
check('A. Kibic: drabinka zwycięzców, przegranych, wielki finał', page.includes('Drabinka zwycięzców') && page.includes('Drabinka przegranych') && page.includes('Wielki finał') && page.includes('1/8 finału'), page.slice(0, 120).replace(/\n/g, ' | '))
await fan.screenshot({ path: S + '/elim-fan.png', fullPage: true })

// B. a whole double-elimination tournament played through the result pages (6 players, grand final with rematch)
const bs = await create('inna-wynik', null, ['Ala', 'Ola', 'Ela', 'Iza', 'Ewa', 'Ula'], { system: 'Podwójna eliminacja' })
let played = 0
for (let guard = 0; guard < 20; guard++) {
  ms = await matches(bs)
  const next = ms.filter((m) => m.status === 'scheduled' && m.teamA && m.teamB).sort((a, b) => a.start.localeCompare(b.start))[0]
  if (!next) break
  const lbWins = next.ko.bracket === 'F' && !next.ko.resetOf
  await p.goto(U + `?t=${bs}#korekta-${next.id}`); await p.waitForTimeout(1200)
  await p.locator('#rf-0-a').fill(lbWins ? '1' : String(2 + (played % 2))); await p.locator('#rf-0-b').fill(lbWins ? '3' : '1')
  await p.getByRole('button', { name: /Zapisz|Zakończ/ }).first().click(); await p.waitForTimeout(1500)
  played++
}
ms = await matches(bs)
const reset = ms.find((m) => m.ko.resetOf)
check('B. Wszystkie spotkania rozegrane', ms.every((m) => m.status === 'finished'), `${ms.filter((m) => m.status === 'finished').length}/${ms.length}`)
check('B. 11 spotkań (2×6−2) + rewanż w wielkim finale', played === 11, `${played} rozegranych`)
check('B. Rewanż rozegrany, bo wielki finał wygrał zawodnik z drabinki przegranych', reset && !reset.skipped && reset.status === 'finished' && reset.teamA && reset.teamB)
const bf = await phone()
await bf.goto(U + `?t=${bs}#grupy`); await bf.waitForTimeout(2500)
const pl = await bf.locator('.elim-places').innerText().catch(() => '')
check('B. Kibic widzi miejsca 1–3', pl.includes('🏆') && pl.includes('🥈') && pl.includes('🥉'), pl.replace(/\n/g, ' | '))
await bf.screenshot({ path: S + '/elim-done.png', fullPage: true })

// C. single elimination with 3rd place, 5 players
const ks = await create('koszykowka', null, ['A1', 'B2', 'C3', 'D4', 'E5'], { system: 'Drabinka pucharowa' })
ms = await matches(ks)
check('C. Drabinka pucharowa 5: 4 spotkania + o 3. miejsce', ms.length === 5 && ms.some((m) => m.ko.place === 3), `${ms.length}`)

// D. an existing groups tournament switched to double elimination on the draw screen
const ds = await create('karate', null, names17)
T = await tdoc(ds)
check('D. Najpierw grupy', T.groups.length >= 1)
await p.goto(U + `?t=${ds}#panel`); await p.waitForTimeout(2500)
await p.locator('.system-setting select').first().selectOption('double'); await p.waitForTimeout(1500)
await p.locator('.setup-cat').first().getByRole('button', { name: /losuj drabinkę/ }).click()
await p.locator('.setup-cat .ok', { hasText: 'Rozlosowano drabinkę' }).first().waitFor({ timeout: 20000 }).catch(() => {})
await p.waitForTimeout(1500)
T = await tdoc(ds); ms = await matches(ds)
check('D. Po zmianie systemu: drabinka zamiast grup', T.tournament.system === 'double' && T.groups.length === 0 && ms.length === 33, `${T.groups.length} grup, ${ms.length} spotkań`)

console.log('Błędy strony:', errs.length ? errs : 'brak')
console.log(`WYNIK: ${res.filter(Boolean).length}/${res.length}`)
await b.close()
