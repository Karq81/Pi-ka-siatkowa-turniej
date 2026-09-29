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
const three = ['Orzeł', 'Sokół', 'Kruk']
const kp = await create('pilka-nozna', 'remis', three, {})
let T = await tdoc(kp); let ms = await matches(kp)
const nm = (id) => T.teams.find((x) => x.id === id)?.name ?? '?'
// 1. Settings: 2 points for a win instead of 3 → a question, then saved.
await p.goto(U + `?t=${kp}#admin`); await p.waitForTimeout(2500)
await p.locator('.tabs-admin button', { hasText: 'Ustawienia' }).click(); await p.waitForTimeout(800)
const win = p.locator('.points-settings label', { hasText: 'Pkt w tabeli za wygraną' }).locator('input')
await win.focus(); await win.fill('2'); await win.press('Enter'); await p.waitForTimeout(800)
const q = await p.locator('.confirm-box').innerText().catch(() => '')
check('1. Inna punktacja niż w przepisach: pytanie zamiast blokady', /Według przepisów \(Piłka nożna\) pkt w tabeli za wygraną: 3 pkt, a wpisujesz 2 pkt/.test(q) && /Zapisać mimo to\?/.test(q), q.replace(/\n/g, ' | '))
await p.getByRole('button', { name: 'Tak, zapisz' }).click(); await p.waitForTimeout(1500)
T = await tdoc(kp)
check('2. Zapisane 2 pkt za wygraną, widać „w przepisach: 3” i przycisk przywrócenia', T.tournament.rules.pointsWin === 2 && (await p.locator('.points-settings').innerText()).includes('w przepisach: 3') && await p.getByRole('button', { name: /Przywróć punktację z przepisów/ }).count() === 1)
// 3. A match: result 1:0, then points by hand 1:1.
const m = ms[0]
await p.goto(U + `?t=${kp}#korekta-${m.id}`); await p.waitForTimeout(2000)
await p.locator('.rf-input').nth(0).fill('1'); await p.locator('.rf-input').nth(1).fill('0')
await p.getByRole('button', { name: /Zapisz poprawiony wynik/ }).click(); await p.waitForTimeout(2000)
await p.goto(U + `?t=${kp}#korekta-${m.id}`); await p.waitForTimeout(2000)
await p.locator('.manual-points summary').click(); await p.waitForTimeout(300)
const boxes = p.locator('.manual-points input')
await boxes.nth(0).fill('1'); await boxes.nth(0).blur(); await boxes.nth(1).fill('1'); await boxes.nth(1).blur(); await p.waitForTimeout(300)
await p.getByRole('button', { name: 'Zapisz punkty' }).click(); await p.waitForTimeout(500)
const q2 = await p.locator('.confirm-box').innerText().catch(() => '')
await p.getByRole('button', { name: 'Tak, zapisz' }).click(); await p.waitForTimeout(2000)
ms = await matches(kp)
check('3. Punkty ręcznie w meczu: pytanie i zapis 1:1', /daje 2:0 pkt, a wpisujesz 1:1 pkt/.test(q2) && JSON.stringify(ms.find((x) => x.id === m.id).manualPoints) === '[1,1]', q2.replace(/\n/g, ' | '))
// 4. A penalty: −3 for Kruk.
await p.goto(U + `?t=${kp}#admin`); await p.waitForTimeout(2500)
await p.locator('.tabs-admin button', { hasText: 'Drużyny i terminarz' }).click(); await p.waitForTimeout(800)
const pan = p.locator('.panel', { hasText: 'Kary i bonusy w tabeli' })
await pan.locator('select').selectOption({ label: 'Kruk' })
await pan.getByLabel('Powód').fill('walkower')
await pan.getByRole('button', { name: 'Zapisz korektę' }).click(); await p.waitForTimeout(400)
await p.getByRole('button', { name: 'Tak, zapisz' }).click(); await p.waitForTimeout(2000)
await p.goto(U + `?t=${kp}#grupy`); await p.waitForTimeout(2500)
const table = await p.locator('.standings').first().innerText()
const ptsOf = (n) => { const x = new RegExp(`${n}(?: \\([^)]*\\))?\\s*\\n\\s*(-?\\d+)`).exec(table); return x ? Number(x[1]) : NaN }
const [ta, tb] = [nm(m.teamA), nm(m.teamB)]
const kruk = (ta === 'Kruk' || tb === 'Kruk' ? 1 : 0) - 3
check('4. Tabela: punkty ręczne 1:1 i −3 dla Kruka z powodem', /Kruk \(-3 pkt: walkower\)/.test(table) && ptsOf('Kruk') === kruk && [ta, tb].every((n) => ptsOf(n) === (n === 'Kruk' ? kruk : 1)), `${ta}-${tb} | ` + table.replace(/\n/g, ' | ').slice(0, 200))
await p.screenshot({ path: S + '/points-table.png', fullPage: true })
console.log('Błędy strony:', errs.length ? errs : 'brak')
console.log(`WYNIK: ${res.filter(Boolean).length}/${res.length}`)
await b.close()
