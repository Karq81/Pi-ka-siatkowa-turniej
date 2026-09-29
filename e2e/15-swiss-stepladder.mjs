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
  if (!opts.system) await p.locator('.setup-cat input[inputmode=numeric]').first().fill('1')
  await p.waitForTimeout(500)
  const btn = p.locator('.setup-cat').first().getByRole('button', { name: /losuj (grupy|drabinkę|1\. rundę)|ułóż drabinkę/ })
  if (await btn.isDisabled()) { await p.screenshot({ path: `${S}/fail-create-${sport}.png`, fullPage: true }); console.log('DISABLED', sport, await p.locator('.setup-cat').first().innerText()) }
  await btn.click()
  await p.locator('.setup-cat .ok').first().waitFor({ timeout: 15000 }); await p.waitForTimeout(1200)
  return slug
}
const MAPI = 'http://127.0.0.1:8080/v1/projects/demo-siatkalive/databases/(default)/documents/tournaments'
// Finish every open match of a tournament in the emulator: side A wins 1:0.
async function finishAll(slug) {
  const list = await (await fetch(`${MAPI}/${slug}/matches?pageSize=50`, { headers: H })).json()
  for (const d of list.documents ?? []) {
    const ms = d.fields.matches?.mapValue?.fields ?? {}
    for (const m of Object.values(ms)) {
      const f = m.mapValue.fields
      if (f.status.stringValue === 'finished') continue
      f.status = { stringValue: 'finished' }
      f.sets = { arrayValue: { values: [{ mapValue: { fields: { a: { integerValue: '1' }, b: { integerValue: '0' } } } }] } }
    }
    await fetch(`http://127.0.0.1:8080/v1/${d.name}?updateMask.fieldPaths=matches`, { method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { matches: d.fields.matches } }) })
  }
}
const six = ['Anna', 'Basia', 'Celina', 'Dorota', 'Ewa', 'Fela']
const ss = await create('szachy', null, six, { system: 'System szwajcarski' })
let T = await tdoc(ss); let ms = await matches(ss)
check('1. Szwajcarski: runda 1 = 3 partie, tabela, Buchholz', T.tournament.system === 'swiss' && ms.length === 3 && ms.every((m) => m.swissRound === 1) && T.tournament.rules.tiebreak[0] === 'buchholz_cut1', `${ms.length} ${JSON.stringify(T.tournament.rules.tiebreak)}`)
await p.goto(U + `?t=${ss}#panel-grupy`); await p.waitForTimeout(2500)
let panel = await p.locator('.stage2-panel').innerText().catch(() => '')
check('2. Panel: runda 1 z 5, przycisk nieaktywny (partie trwają)', panel.includes('runda 1 z 5') && await p.getByRole('button', { name: 'Losuj rundę 2' }).isDisabled(), panel.replace(/\n/g, ' | '))
await finishAll(ss); await p.reload(); await p.waitForTimeout(3000)
const next2 = p.getByRole('button', { name: 'Losuj rundę 2' })
check('3. Po wynikach przycisk „Losuj rundę 2” pulsuje', (await next2.getAttribute('class')).includes('btn-pulse') && !(await next2.isDisabled()))
await next2.click({ force: true }); await p.waitForTimeout(3000)
ms = await matches(ss)
const r2 = ms.filter((m) => m.swissRound === 2)
const r1 = ms.filter((m) => m.swissRound === 1)
const winners = new Set(r1.map((m) => m.teamA))
check('4. Runda 2: 3 partie, 3 zwycięzców → tylko jedna para mieszana, bez powtórek', r2.length === 3 && r2.filter((m) => winners.has(m.teamA) !== winners.has(m.teamB)).length === 1 && r2.every((m) => !r1.some((x) => [x.teamA, x.teamB].sort().join() === [m.teamA, m.teamB].sort().join())), JSON.stringify(r2.map((m) => [m.teamA, m.teamB])) + ' W=' + [...winners])
await p.screenshot({ path: S + '/swiss-panel.png' })
const fan = await phone()
await fan.goto(U + `?t=${ss}#grupy`); await fan.waitForTimeout(2500)
const ft = await fan.locator('body').innerText().catch(() => '')
check('5. Kibic: tabela i „Runda 2”, bez zakładki fazy pucharowej', ft.includes('Runda 2') && !ft.includes('FAZA PUCHAROWA'), ft.slice(0,300).replace(/\n/g, ' | '))
await fan.screenshot({ path: S + '/swiss-fan.png', fullPage: true })

// Stepladder: list order = strength
const ls = await create('tenis', '2z3', ['Nr1', 'Nr2', 'Nr3', 'Nr4'], { system: 'Drabinka schodkowa' })
ms = await matches(ls)
const first = ms.find((m) => m.ko?.col === 1)
T = await tdoc(ls)
const nameOf = (id) => T.teams.find((x) => x.id === id)?.name
check('6. Schodkowa: 3 spotkania, najpierw Nr3–Nr4', ms.length === 3 && [nameOf(first?.teamA), nameOf(first?.teamB)].sort().join() === 'Nr3,Nr4', ms.map((m) => `${m.ko?.label}:${nameOf(m.teamA) ?? '?'}-${nameOf(m.teamB) ?? '?'}`).join(' '))

const five = await create('szachy', null, ['P1', 'P2', 'P3', 'P4', 'P5'], { system: 'System szwajcarski' })
ms = await matches(five)
const fanB = await phone()
await fanB.goto(U + `?t=${five}#grupy`); await fanB.waitForTimeout(2500)
const fb = await fanB.locator('body').innerText()
check('7. 5 graczy: 2 partie + wolny los widoczny u kibica', ms.filter((m) => !m.bye).length === 2 && ms.filter((m) => m.bye).length === 1 && fb.includes('wolny los') && fb.includes('Runda 1'))
console.log('Błędy strony:', errs.length ? errs : 'brak')
console.log(`WYNIK: ${res.filter(Boolean).length}/${res.length}`)
await b.close()
