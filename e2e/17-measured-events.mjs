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
const num = async (label, v) => { const i = p.locator('.system-setting label', { hasText: label }).locator('input'); await i.fill(String(v)); await i.blur(); await p.waitForTimeout(700) }
const six = ['Ala', 'Bea', 'Cela', 'Dora', 'Ewa', 'Fela']
const kb = await create('bieg', 'czas', six, { groups: 2, before: async () => { await num('Do finału z każdej serii', 1); await num('Plus najlepsze wyniki', 2) } })
let T = await tdoc(kb)
check('1. Bieg: system „measured”, 2 serie po 3, bez meczów', T.tournament.system === 'measured' && T.groups.filter((g) => g.categoryId === 'k1').length === 2 && (await matches(kb)).length === 0 && T.tournament.measured?.Q === 1, JSON.stringify(T.tournament.measured))
await p.goto(U + `?t=${kb}#panel-grupy`); await p.waitForTimeout(2500)
const times = { Ala: '12,10', Bea: '12,50', Cela: '12,30', Dora: '12,20', Ewa: '12,90', Fela: '13,00' }
for (const tab of ['Seria 1', 'Seria 2']) {
  await p.locator('.measured .seg-groups button', { hasText: tab }).click(); await p.waitForTimeout(500)
  const rows = p.locator('.perf-table li')
  const n = await rows.count()
  for (let i = 0; i < n; i++) {
    const row = rows.nth(i)
    const name = (await row.locator('.name').innerText()).trim()
    if (name === 'Fela') { await row.locator('select').selectOption('DNF'); await p.waitForTimeout(700); continue }
    const box = row.locator('.perf-edit input').first()
    await box.fill(times[name]); await box.press('Enter'); await p.waitForTimeout(700)
  }
}
T = await tdoc(kb)
const count = Object.values(T.tournament.perf ?? {}).reduce((s, g) => s + Object.keys(g).length, 0)
check('2. Wyniki 6 zawodników zapisane (w tym DNF)', count === 6, String(count))
await p.locator('.measured .seg-groups button', { hasText: 'Seria 1' }).click(); await p.waitForTimeout(600)
const s1 = await p.locator('.perf-table').innerText()
check('3. Tabela serii: czasy, Q i q', /12,\d0/.test(s1) && /\bQ\b/.test(s1) && /DNF/.test(s1), s1.replace(/\n/g, ' | ').slice(0, 250))
await p.getByRole('button', { name: /Utwórz finał/ }).click({ force: true }); await p.waitForTimeout(500)
await p.getByRole('button', { name: 'Tak, utwórz finał' }).click(); await p.waitForTimeout(2500)
T = await tdoc(kb)
const fin = T.groups.find((g) => g.id === 'k1fin')
check('4. Finał: 2 zwycięzców serii (Q) + 2 najszybszych z reszty (q)', fin?.teamIds.length === 4, String(fin?.teamIds.length))
const rows = p.locator('.perf-table li')
for (let i = 0; i < await rows.count(); i++) {
  const row = rows.nth(i)
  const name = (await row.locator('.name').innerText()).trim()
  const box = row.locator('.perf-edit input').first()
  await box.fill(times[name].replace(',1', ',0')); await box.press('Enter'); await p.waitForTimeout(700)
}
await p.locator('.measured .seg-groups button', { hasText: 'Klasyfikacja' }).click(); await p.waitForTimeout(800)
const kl = await p.locator('.perf-table').innerText()
check('5. Klasyfikacja: Ala 1., Fela (DNF) 6.', /^Klasyfikacja[\s\S]*1\s*\n\s*Ala/.test(kl) && /6\s*\n\s*Fela/.test(kl), kl.replace(/\n/g, ' | ').slice(0, 250))
await p.screenshot({ path: S + '/meas-panel.png', fullPage: true })
// A fan sees the results without the boxes.
const fctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'pl-PL' }); const fan = await fctx.newPage()
await fan.goto(U + `?t=${kb}#grupy`); await fan.waitForTimeout(2500)
const ft = await fan.locator('.measured').innerText().catch(() => '')
check('6. Kibic: finał i wyniki, bez pól do wpisywania', /Finał/.test(ft) && await fan.locator('.perf-edit').count() === 0, ft.replace(/\n/g, ' | ').slice(0, 200))
await fan.screenshot({ path: S + '/meas-fan.png', fullPage: true })
console.log('Błędy strony:', errs.length ? errs : 'brak')
console.log(`WYNIK: ${res.filter(Boolean).length}/${res.length}`)
await b.close()
