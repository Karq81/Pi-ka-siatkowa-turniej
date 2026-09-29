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
const ctx = await b.newContext({ viewport: { width: 1200, height: 900 }, locale: 'pl-PL' })
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message))
const rnd = Math.random().toString(36).slice(2, 6)
const phone = async () => { const r = await ctx.newPage(); await r.setViewportSize({ width: 390, height: 844 }); r.on('pageerror', (e) => errs.push('ref: ' + e.message)); return r }

const slug = 'time-' + rnd
await p.goto(U + '#nowy-turniej'); await p.waitForTimeout(2000)
await p.locator('.new-t-form select').first().selectOption('pilka-reczna')
await p.getByLabel(/Nazwa turnieju/).fill('Ręczna U12')
await p.getByRole('button', { name: 'zmień' }).click()
await p.locator('.new-t-address input').fill(slug)
await p.getByLabel(/Dzień pierwszego meczu/).fill('2027-05-08')
await p.getByText('Policz „co ile minut” z czasu gry').click()
await p.getByLabel(/Czas gry \(min\)/).fill('24'); await p.getByLabel(/Przerwa w meczu/).fill('3'); await p.getByLabel(/Zmiana drużyn/).fill('5')
const calc = await p.locator('.slot-calc').innerText()
check('1. Kalkulator: slot 32 min', calc.includes('Slot meczu: 32 min'), calc.replace(/\n/g, ' | ').slice(-120))
await p.getByRole('button', { name: 'Ustaw 32 min' }).click()
await p.locator('.new-t-form select', { hasText: 'Może grać mecz po meczu' }).selectOption('1')
await p.getByLabel('Przerwa od').fill('12:00'); await p.getByLabel('Przerwa do').fill('13:00')
await p.getByRole('button', { name: /Dalej/ }).click()
await p.waitForURL(new RegExp(`t=${slug}`), { timeout: 15000 }); await p.waitForTimeout(1500)
await p.locator('#pin-admin').fill('4321'); await p.getByRole('button', { name: 'Utwórz turniej' }).click()
await p.locator('.setup-cat textarea').first().waitFor({ timeout: 20000 })
await p.locator('.setup-cat textarea').first().fill(Array.from({ length: 12 }, (_, i) => `Drużyna ${i + 1}`).join('\n'))
await p.locator('.setup-cat input[inputmode=numeric]').first().fill('2'); await p.waitForTimeout(800)
const fc = await p.locator('.forecast').innerText().catch(() => '')
check('2. Podpowiedź przed losowaniem: liczba spotkań i koniec', /30 spotkań/.test(fc), fc)
await p.screenshot({ path: S + '/forecast.png' })
await p.locator('.setup-cat').first().getByRole('button', { name: /losuj grupy/ }).click()
await p.locator('.setup-cat .ok', { hasText: 'Rozlosowano' }).first().waitFor({ timeout: 15000 })
const T = await tdoc(slug); const ms = await matches(slug)
check('3. Zapisane: slot 32, odpoczynek 1, przerwa 12–13', T.tournament.slotMinutes === 32 && T.tournament.rest === 1 && T.tournament.breaks?.[0]?.from === '12:00', JSON.stringify([T.tournament.slotMinutes, T.tournament.rest, T.tournament.breaks]))
check('4. Żaden mecz nie zaczyna się w przerwie obiadowej', !ms.some((m) => m.start.slice(11) >= '12:00' && m.start.slice(11) < '13:00'), ms.map((m) => m.start.slice(11)).sort().join(','))
const rounds = [...new Set(ms.map((m) => m.start))].sort()
const byTeam = {}
for (const m of ms) for (const id of [m.teamA, m.teamB]) (byTeam[id] ??= []).push(rounds.indexOf(m.start))
const okRest = Object.values(byTeam).every((r) => r.sort((a, b) => a - b).every((x, i, a) => i === 0 || x - a[i - 1] >= 2))
check('5. Każda drużyna ma co najmniej rundę przerwy', okRest)
console.log('Błędy strony:', errs.length ? errs : 'brak')
console.log(`WYNIK: ${res.filter(Boolean).length}/${res.length}`)
await b.close()
