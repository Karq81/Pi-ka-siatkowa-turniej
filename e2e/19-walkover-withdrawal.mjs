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
  const slug = `e2e-${sport}-${players.length}-${rnd}`.slice(0, 40)
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
  if (opts.groups) await p.locator('.setup-cat input[inputmode=numeric]').first().fill(String(opts.groups))
  else if (!opts.system) await p.locator('.setup-cat input[inputmode=numeric]').first().fill('1')
  if (opts.before) await opts.before()
  await p.waitForTimeout(500)
  const btn = p.locator('.setup-cat').first().getByRole('button', { name: /losuj (grupy|drabinkę|1\. rundę)|ułóż (drabinkę|serie)/ })
  if (await btn.isDisabled()) { await p.screenshot({ path: `${S}/fail-create-${sport}.png`, fullPage: true }); console.log('DISABLED', sport, await p.locator('.setup-cat').first().innerText()) }
  await btn.click()
  await p.locator('.setup-cat .ok').first().waitFor({ timeout: 15000 }); await p.waitForTimeout(1200)
  return slug
}
const four = ['Orzeł', 'Sokół', 'Kruk', 'Wróbel']
const kl = await create('pilka-nozna', 'remis', four, {})
let ms = await matches(kl)
let T = await tdoc(kl)
const nm = (id) => T.teams.find((x) => x.id === id)?.name ?? '?'
const first = ms.sort((a, b) => a.start.localeCompare(b.start) || a.court - b.court)[0]
await p.goto(U + `?t=${kl}#korekta-${first.id}`); await p.waitForTimeout(2200)
await p.getByRole('button', { name: `Walkower dla: ${nm(first.teamA)}` }).click(); await p.waitForTimeout(400)
await p.getByRole('button', { name: 'Tak, walkower' }).click(); await p.waitForTimeout(2200)
ms = await matches(kl)
const w = ms.find((m) => m.id === first.id)
check('1. Walkower: 3:0 dla gospodarza, zapisany jako walkower', w.status === 'finished' && w.decidedBy === 'walkover' && w.sets[0].a === 3 && w.sets[0].b === 0, JSON.stringify(w.sets))
// Withdraw Wróbel (option A, 0 or 1 of 3 played → results removed).
await p.goto(U + `?t=${kl}#admin`); await p.waitForTimeout(2500)
await p.locator('.tabs-admin button', { hasText: 'Drużyny i terminarz' }).click(); await p.waitForTimeout(800)
const panel = p.locator('.panel', { hasText: 'Wycofanie lub dyskwalifikacja' })
await panel.locator('label', { hasText: 'Drużyna' }).last().locator('select').selectOption({ label: 'Wróbel' })
await panel.getByRole('button', { name: 'Wycofaj', exact: true }).click(); await p.waitForTimeout(400)
await p.getByRole('button', { name: 'Tak, wycofaj' }).click(); await p.waitForTimeout(2500)
T = await tdoc(kl)
check('2. Wróbel wycofany, wyniki usunięte (opcja A)', T.teams.find((x) => x.name === 'Wróbel')?.status === 'withdrawn' && T.teams.find((x) => x.name === 'Wróbel')?.voided === true)
const log = await p.locator('.change-log').innerText().catch(() => '')
check('3. Historia zmian: walkower i wycofanie', /Walkower/.test(log) && /Wróbel: wycofana/.test(log), log.replace(/\n/g, ' | ').slice(0, 200))
await p.goto(U + `?t=${kl}#grupy`); await p.waitForTimeout(2500)
const table = await p.locator('.standings').first().innerText()
check('4. Tabela bez Wróbla', !table.includes('Wróbel') && table.includes('Orzeł'), table.replace(/\n/g, ' | ').slice(0, 200))
await p.goto(U + `?t=${kl}#panel`); await p.waitForTimeout(2000)
check('5. Przycisk „Drukuj / PDF” w panelu', await p.getByRole('button', { name: /Drukuj \/ PDF/ }).count() === 1)
console.log('Błędy strony:', errs.length ? errs : 'brak')
console.log(`WYNIK: ${res.filter(Boolean).length}/${res.length}`)
await b.close()
