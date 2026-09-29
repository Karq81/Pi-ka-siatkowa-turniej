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
// 1. Seeding from the list: 6 players, byes for 1 and 2, round 1: 3–6 and 4–5.
const six = ['Nr1', 'Nr2', 'Nr3', 'Nr4', 'Nr5', 'Nr6']
const k6 = await create('tenis', '2z3', six, { system: 'Drabinka pucharowa', before: async () => {
  await sel('Rozstawienie').selectOption('list'); await p.waitForTimeout(800)
} })
let T = await tdoc(k6); let ms = await matches(k6)
const nm = (id) => T.teams.find((x) => x.id === id)?.name ?? '?'
const r1 = ms.filter((m) => m.ko?.col === 1).map((m) => [nm(m.teamA), nm(m.teamB)].sort().join('–')).sort()
check('1. Rozstawienie z listy: wolne losy dla Nr1 i Nr2, grają Nr3–Nr6 i Nr4–Nr5', T.tournament.seeding === 'list' && r1.join(',') === 'Nr3–Nr6,Nr4–Nr5', r1.join(','))
// 2. Everybody plays for places: 8 players, 12 matches.
const eight = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
const k8 = await create('judo', null, eight, { system: 'Drabinka pucharowa', before: async () => {
  await sel('Po półfinałach').selectOption('all'); await p.waitForTimeout(800)
} })
ms = await matches(k8)
check('2. „Wszyscy grają o miejsca”: 12 walk, jest walka o 7. miejsce', ms.length === 12 && ms.some((m) => m.ko?.label === 'O 7. miejsce'), ms.map((m) => m.ko?.label).join(' | '))
// 3. Two bronzes.
const kb = await create('karate', null, eight, { system: 'Drabinka pucharowa', before: async () => {
  await sel('Po półfinałach').selectOption('bronzes'); await p.waitForTimeout(800)
} })
ms = await matches(kb)
check('3. Dwa brązy: 7 walk, bez walki o 3. miejsce', ms.length === 7 && ms.filter((m) => m.ko?.loserPlace === 3).length === 2, String(ms.length))
// 4. Groups, then a bracket for the top 2 of each group.
const ten = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10']
const kg = await create('pilka-nozna', 'remis', ten, { groups: 2, before: async () => {
  await sel('Po grupach').selectOption('top'); await p.waitForTimeout(1000)
  await sel('Po półfinałach').selectOption('third'); await p.waitForTimeout(800)
} })
T = await tdoc(kg); ms = await matches(kg)
const ko = ms.filter((m) => m.ko)
check('4. Grupy + drabinka: 2 półfinały, finał i mecz o 3. miejsce', ko.length === 4 && ms.filter((m) => !m.ko).length === 20 && T.tournament.advance?.perGroup === 2, ko.map((m) => m.ko.label).join(' | ') + ' / ' + ms.filter((m) => !m.ko).length)
await p.goto(U + `?t=${kg}#panel-grupy`); await p.waitForTimeout(2500)
await p.getByRole('button', { name: /faza pucharowa/i }).first().click().catch(() => p.getByText(/faza pucharowa/i).first().click()); await p.waitForTimeout(1200)
const txt = await p.locator('body').innerText()
check('5. Organizator widzi drabinkę z miejscami z grup', /1\. miejsce · Grupa A/.test(txt), (txt.match(/Półfinał 1[^\n]*\n[^\n]*\n[^\n]*/) ?? [''])[0].replace(/\n/g, ' | '))
await p.screenshot({ path: S + '/br3-groups.png', fullPage: true })
await p.goto(U + `?t=${kg}#panel`); await p.waitForTimeout(2000)
await p.locator('.system-setting').screenshot({ path: S + '/br3-setting.png' }).catch(() => {})
console.log('Błędy strony:', errs.length ? errs : 'brak')
console.log(`WYNIK: ${res.filter(Boolean).length}/${res.length}`)
await b.close()
