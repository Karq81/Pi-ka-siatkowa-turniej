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
const four = ['Lech', 'Legia', 'Wisła', 'Raków']
const kc = await create('pilka-nozna', 'remis', four, {})
await p.goto(U + `?t=${kc}#boisko-1`); await p.waitForTimeout(2200)
await p.getByRole('button', { name: /Rozpocznij mecz/ }).click(); await p.waitForTimeout(1000)
let ms = await matches(kc)
const live = ms.find((m) => m.status === 'live')
const T = await tdoc(kc)
const nm = (id) => T.teams.find((x) => x.id === id)?.name ?? '?'
const yA = p.getByRole('button', { name: `Żółta kartka dla: ${nm(live.teamA)}` })
await yA.click(); await p.waitForTimeout(500)
await yA.click(); await p.waitForTimeout(500)
await p.getByRole('button', { name: `Czerwona kartka dla: ${nm(live.teamB)}` }).click(); await p.waitForTimeout(1500)
ms = await matches(kc)
let m = ms.find((x) => x.id === live.id)
check('1. Sędzia na żywo: 2 żółte dla A i czerwona dla B zapisane', (m.cards ?? []).filter((c) => c.side === 'a' && c.kind === 'Y').length === 2 && (m.cards ?? []).some((c) => c.side === 'b' && c.kind === 'R'), JSON.stringify(m.cards))
// A fan sees the cards on the live board.
const fctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'pl-PL' }); const fan = await fctx.newPage()
await fan.goto(U + `?t=${kc}#na-zywo`); await fan.waitForTimeout(3000)
const yIcons = await fan.locator('.court .cards-icons .card-y').count()
const rIcons = await fan.locator('.court .cards-icons .card-r').count()
check('2. Kibic: kartki na tablicy na żywo', yIcons >= 1 && rIcons >= 1, `${yIcons} żółtych, ${rIcons} czerwonych`)
await fan.screenshot({ path: S + '/cards-board.png' })
// Finish 1:1 and give the second yellow a name and a minute on the correction page.
await p.goto(U + `?t=${kc}#korekta-${live.id}`); await p.waitForTimeout(2200)
await p.locator('.rf-input').nth(0).fill('1'); await p.locator('.rf-input').nth(1).fill('1')
await p.getByRole('button', { name: /Zapisz poprawiony wynik/ }).click(); await p.waitForTimeout(2000)
await p.goto(U + `?t=${kc}#korekta-${live.id}`); await p.waitForTimeout(2200)
const row = p.locator('.cards-edit .card-row').nth(1)
await row.locator('select').nth(1).selectOption('YR')
await p.waitForTimeout(800)
await row.getByLabel('Zawodnik').fill('Kowalski'); await p.waitForTimeout(800)
await row.getByLabel('Minuta').fill('78'); await p.waitForTimeout(1200)
ms = await matches(kc)
m = ms.find((x) => x.id === live.id)
check('3. Organizator: druga żółta z nazwiskiem i minutą', m.cards?.[1]?.kind === 'YR' && m.cards?.[1]?.player === 'Kowalski' && m.cards?.[1]?.minute === 78 && m.status === 'finished', JSON.stringify(m.cards))
await fan.goto(U + `?t=${kc}#grupy`); await fan.waitForTimeout(2500)
const fp = await fan.locator('.fair-play').innerText().catch(() => '')
check('4. Kibic: tabela fair play (A: 1+3 = 4 pkt, B: 4 pkt)', /Fair play/i.test(fp) && fp.includes(nm(live.teamA)) && fp.includes(nm(live.teamB)), fp.replace(/\n/g, ' | '))
await fan.screenshot({ path: S + '/cards-fairplay.png', fullPage: true })
console.log('Błędy strony:', errs.length ? errs : 'brak')
console.log(`WYNIK: ${res.filter(Boolean).length}/${res.length}`)
await b.close()
