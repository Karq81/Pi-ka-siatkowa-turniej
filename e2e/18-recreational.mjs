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
  const btn = p.locator('.setup-cat').first().getByRole('button', { name: /losuj (grupy|drabinkę|1\. rundę)|ułóż (drabinkę|serie)|zacznij/ })
  if (await btn.isDisabled()) { await p.screenshot({ path: `${S}/fail-create-${sport}.png`, fullPage: true }); console.log('DISABLED', sport, await p.locator('.setup-cat').first().innerText()) }
  await btn.click()
  await p.locator('.setup-cat .ok').first().waitFor({ timeout: 15000 }); await p.waitForTimeout(1200)
  return slug
}
const eight = ['Ala', 'Bea', 'Cela', 'Dora', 'Ewa', 'Fela', 'Gosia', 'Hela']
const ka = await create('padel', '1set', eight, { system: 'Americano' })
let T = await tdoc(ka); let ms = await matches(ka)
check('1. Americano: runda 1 = 2 mecze par, gra 8 osób', T.tournament.system === 'americano' && ms.length === 2 && new Set(ms.flatMap((m) => [...m.teamA.split('+'), ...m.teamB.split('+')])).size === 8, ms.map((m) => `${m.teamA} v ${m.teamB}`).join(' | '))
for (const m of ms) {
  await p.goto(U + `?t=${ka}#korekta-${m.id}`); await p.waitForTimeout(2000)
  await p.locator('.rf-input').nth(0).fill('6'); await p.locator('.rf-input').nth(1).fill('3')
  await p.getByRole('button', { name: /Zapisz poprawiony wynik/ }).click(); await p.waitForTimeout(1800)
}
await p.goto(U + `?t=${ka}#panel-grupy`); await p.waitForTimeout(2500)
const table = await p.locator('.rec .perf-table').innerText().catch(() => '')
check('2. Tabela: zwycięzcy mają po 6 pkt, nazwy par w meczach', /\b6\b/.test(table) && (await p.locator('.rec').innerText()).includes(' / '), table.replace(/\n/g, ' | ').slice(0, 200))
await p.getByRole('button', { name: 'Losuj rundę 2' }).click({ force: true }); await p.waitForTimeout(2500)
ms = await matches(ka)
const r2 = ms.filter((m) => m.swissRound === 2)
const pairs1 = new Set(ms.filter((m) => m.swissRound === 1).flatMap((m) => [m.teamA, m.teamB]))
check('3. Runda 2: 2 mecze, żadna para się nie powtarza', r2.length === 2 && r2.every((m) => !pairs1.has(m.teamA) && !pairs1.has(m.teamB)))
await p.screenshot({ path: S + '/rec-americano.png', fullPage: true })
// Ladder
const six = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6']
const kl = await create('tenis', '1set', six, { system: 'Drabinka rankingowa' })
await p.goto(U + `?t=${kl}#panel-grupy`); await p.waitForTimeout(2500)
const form = p.locator('.rec .panel', { hasText: 'Nowe wyzwanie' })
await form.locator('label', { hasText: 'Wyzywa' }).first().locator('select').selectOption({ label: '5. L5' }); await p.waitForTimeout(300)
const opts = await form.locator('label', { hasText: 'Kogo' }).locator('option:not([disabled])').allInnerTexts()
check('4. Drabinka: L5 może wyzwać tylko L2–L4', opts.filter((x) => x !== '—').join(',') === '2. L2,3. L3,4. L4', opts.join(','))
await form.locator('label', { hasText: 'Kogo' }).locator('select').selectOption({ label: '2. L2' })
await form.getByRole('button', { name: 'Dodaj wyzwanie' }).click(); await p.waitForTimeout(2000)
ms = await matches(kl)
await p.goto(U + `?t=${kl}#korekta-${ms[0].id}`); await p.waitForTimeout(2000)
await p.locator('.rf-input').nth(0).fill('6'); await p.locator('.rf-input').nth(1).fill('4')
await p.getByRole('button', { name: /Zapisz poprawiony wynik/ }).click(); await p.waitForTimeout(2000)
await p.goto(U + `?t=${kl}#grupy`); await p.waitForTimeout(2500)
const lad = await p.locator('.rec .perf-table').innerText()
check('5. Po wygranej L5 jest na 2. miejscu', /2\s*\n\s*L5/.test(lad), lad.replace(/\n/g, ' | ').slice(0, 160))
console.log('Błędy strony:', errs.length ? errs : 'brak')
console.log(`WYNIK: ${res.filter(Boolean).length}/${res.length}`)
await b.close()
