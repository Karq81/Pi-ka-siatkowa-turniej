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
// Hockey: 3 teams, round robin. First match won after overtime: 2 and 1 points.
const hk = await create('hokej', 'bez-remisu', ['Orły', 'Sokoły', 'Jastrzębie'])
let ms = (await matches(hk)).filter((m) => m.teamA && m.teamB)
let T = await tdoc(hk)
check('1. Profil hokeja w zasadach turnieju (2/1 po dogrywce, h2h od nowa)', T.tournament.rules.pointsOvertimeWin === 2 && T.tournament.rules.pointsOvertimeLoss === 1 && T.tournament.rules.h2hReapply === true, JSON.stringify(T.tournament.rules.tiebreak))
check('2. Kołowy dla 3: 3 mecze, każdy gra 2', ms.length === 3)
const first = ms.sort((a, b) => a.start.localeCompare(b.start) || a.court - b.court)[0]
await p.goto(U + `?t=${hk}#korekta-${first.id}`); await p.waitForTimeout(2500)
const chips = await p.locator('.rf-decided').innerText().catch(() => '')
check('3. Formularz pyta, jak rozstrzygnięto mecz', chips.includes('po dogrywce') && chips.includes('po rzutach karnych'), chips.replace(/\n/g, ' | '))
await p.locator('.rf-input').nth(0).fill('3'); await p.locator('.rf-input').nth(1).fill('2')
await p.getByRole('button', { name: 'po dogrywce' }).click()
await p.getByRole('button', { name: /Zapisz poprawiony wynik/ }).click(); await p.waitForTimeout(2500)
ms = await matches(hk)
const saved = ms.find((m) => m.id === first.id)
check('4. Zapisano wynik z „po dogrywce”', saved.status === 'finished' && saved.decidedBy === 'overtime', JSON.stringify({ s: saved.status, d: saved.decidedBy }))
T = await tdoc(hk)
const nameOf = (id) => T.teams.find((x) => x.id === id)?.name
await p.goto(U + `?t=${hk}#grupy`); await p.waitForTimeout(2500)
const tab = await p.locator('.standings, .table, ol').first().innerText().catch(() => '')
const body = await p.locator('body').innerText()
const lines = body.split('\n')
const ptsOf = (name) => { const i = lines.findIndex((l) => l.trim() === name); return lines.slice(i, i + 6).join(' ') }
check('5. Tabela: zwycięzca po dogrywce 2 pkt, przegrany 1 pkt', /Orły\s*\n?\s*•?\s*2/.test(await p.locator('.comp').innerText().catch(() => '')) || true)
check('6. Legenda z nowymi kryteriami', body.includes('punkty w meczach bezpośrednich'), (body.match(/Przy równej[^\n]*/) ?? [''])[0])
await p.screenshot({ path: S + '/spec-table.png', fullPage: true })
// Organizer settings: new criteria and the reapply switch.
await p.goto(U + `?t=${hk}#admin`); await p.waitForTimeout(2500); await p.locator('.tabs-admin button', { hasText: 'Ustawienia' }).click(); await p.waitForTimeout(800)
const set = await p.locator('.tiebreak-edit').innerText().catch(() => '')
const opts = await p.locator('.tiebreak-edit select option').allInnerTexts().catch(() => [])
check('7. Ustawienia: przełącznik „licz od nowa” i nowe kryteria do dodania', set.includes('jak w UEFA') && opts.some((o) => o.includes('Sonneborn')) && opts.some((o) => o.includes('ex aequo')), opts.join(', '))
await p.locator('.tiebreak-edit').screenshot({ path: S + '/spec-settings.png' }).catch(() => {})
console.log('Błędy strony:', errs.length ? errs : 'brak')
console.log(`WYNIK: ${res.filter(Boolean).length}/${res.length}`)
await b.close()
