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
  const btn = p.locator('.setup-cat').first().getByRole('button', { name: /losuj (grupy|drabinkę|1\. rundę)|ułóż drabinkę/ })
  if (await btn.isDisabled()) { await p.screenshot({ path: `${S}/fail-create-${sport}.png`, fullPage: true }); console.log('DISABLED', sport, await p.locator('.setup-cat').first().innerText()) }
  await btn.click()
  await p.locator('.setup-cat .ok').first().waitFor({ timeout: 15000 }); await p.waitForTimeout(1200)
  return slug
}
const sel = (label) => p.locator('.system-setting label', { hasText: label }).locator('select')
const four = ['Lech', 'Legia', 'Wisła', 'Raków']
const kt = await create('pilka-nozna', 'bez-remisu', four, { system: 'Drabinka pucharowa', before: async () => {
  await sel('Rozstawienie').selectOption('list'); await p.waitForTimeout(600)
  await sel('Pary w drabince grają').selectOption('two'); await p.waitForTimeout(800)
} })
let ms = await matches(kt)
const T = await tdoc(kt)
const nm = (id) => T.teams.find((x) => x.id === id)?.name ?? '?'
const semi = ms.find((m) => m.ko?.label === 'Półfinał 1')
const ret = ms.find((m) => m.ko?.label === 'Półfinał 1 · rewanż')
check('1. Dwumecz: 2 półfinały + 2 rewanże + finał i mecz o 3. miejsce (po jednym meczu)', ms.length === 6 && ret && ret.teamA === semi.teamB && ret.start > semi.start, ms.map((m) => `${m.ko.label} ${nm(m.teamA)}-${nm(m.teamB)} ${m.start.slice(11)}`).join(' | '))
async function enter(id, a, b, pens) {
  await p.goto(U + `?t=${kt}#korekta-${id}`); await p.waitForTimeout(2200)
  await p.locator('.rf-input').nth(0).fill(String(a)); await p.locator('.rf-input').nth(1).fill(String(b)); await p.waitForTimeout(300)
  if (pens) {
    const pen = p.locator('.rf-pens .rf-input')
    check(`   karne widoczne przy ${a}:${b}`, await pen.count() === 2)
    await pen.nth(0).fill(String(pens[0])); await pen.nth(1).fill(String(pens[1]))
  }
  await p.getByRole('button', { name: /Zapisz poprawiony wynik/ }).click(); await p.waitForTimeout(2200)
}
// Leg 1: 1:1 is allowed in a two-legged tie even without draws.
await enter(semi.id, 1, 1)
ms = await matches(kt)
check('2. Pierwszy mecz dwumeczu może skończyć się remisem', ms.find((m) => m.id === semi.id).status === 'finished')
// Return: 2:2 → aggregate 3:3 → penalties 3:4 (from the return match's side).
await enter(ret.id, 2, 2, [3, 4])
ms = await matches(kt)
const r = ms.find((m) => m.id === ret.id)
const final = ms.find((m) => m.ko?.label === 'Finał')
check('3. Karne zapisane osobno, awansuje zwycięzca karnych', r.penalties?.a === 3 && r.penalties?.b === 4 && final.teamA === ret.teamB, `${JSON.stringify(r.penalties)} finał: ${nm(final.teamA)}`)
await p.goto(U + `?t=${kt}#grupy`); await p.waitForTimeout(2500)
const body = await p.locator('body').innerText()
check('4. Drabinka pokazuje sumę dwumeczu', /Półfinał 1 · suma/i.test(body), (body.match(/Półfinał 1[^\n]*/i) ?? [''])[0])
await p.screenshot({ path: S + '/legs-bracket.png', fullPage: true })
console.log('Błędy strony:', errs.length ? errs : 'brak')
console.log(`WYNIK: ${res.filter(Boolean).length}/${res.length}`)
await b.close()
