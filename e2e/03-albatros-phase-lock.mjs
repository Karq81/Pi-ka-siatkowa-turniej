import { chromium } from 'playwright'
// Screenshots and files go to e2e/out (or E2E_OUT). Runs against the Firebase emulators only.
const OUT = process.env.E2E_OUT || 'e2e/out'
const S = OUT
const U = process.env.E2E_URL || 'http://localhost:5191/'
const API = 'http://127.0.0.1:8080/v1/projects/demo-siatkalive/databases/(default)/documents/tournaments/main'
const H = { Authorization: 'Bearer owner' }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined })
const res = []; const check = (n, ok, info = '') => { res.push(ok); console.log(ok ? 'OK  ' : 'BŁĄD', n, info) }
const errs = []
const ctx = await b.newContext({ locale: 'pl-PL', viewport: { width: 1100, height: 900 } })
const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message))
p.on('dialog', (d) => d.accept())
await p.goto(U + '#panel'); await wait(2500)
if (await p.getByRole('button', { name: /Ustaw PIN/ }).count()) {
  await p.locator('input[inputmode=numeric]').first().fill('1234'); await p.getByRole('button', { name: /Ustaw PIN/ }).click(); await wait(5000)
}
await p.goto(U + '#panel-grupy'); await wait(2500)
if (await p.locator('.stage2-panel').count() === 0 && await p.locator('input[inputmode=numeric]').count()) {
  await p.locator('input[inputmode=numeric]').first().fill('1234'); await p.locator('button[type=submit]').first().click(); await wait(2000)
}
const val = (v) => v.stringValue ?? (v.integerValue !== undefined ? +v.integerValue : v.arrayValue ? (v.arrayValue.values ?? []).map(val) : v.mapValue ? Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, val(x)])) : v.booleanValue ?? null)
const tdoc = async () => val({ mapValue: { fields: (await (await fetch(API, { headers: H })).json()).fields } })
p.removeAllListeners('dialog')
const MAPI = API + '/matches?pageSize=100'
const allMatches = async () => (await (await fetch(MAPI, { headers: H })).json()).documents.flatMap((doc) => Object.values(val({ mapValue: { fields: doc.fields } }).matches ?? {}))
const ends = p.locator('.phase-ends')
// Group phase ended, second stage not started.
await ends.getByRole('button', { name: /Zakończ fazę grupową/ }).click(); await wait(300)
await p.getByRole('button', { name: 'Tak, zakończ fazę grupową' }).click(); await wait(4000)
let ms = await allMatches()
const first = ms.find((m) => m.categoryId === 'c1' && !m.groupId.includes('s2') && m.status === 'finished')
await p.goto(U + `#korekta-${first.id}`); await wait(2500)
check('1. Drugi etap ogłoszony, nie zaczęty: wynik fazy grupowej można cofnąć', await p.getByRole('button', { name: /Cofnij wynik/ }).count() === 1 && await p.locator('.notice-inline', { hasText: 'Następna faza już się zaczęła' }).count() === 0)
// One second-stage match played.
const s2 = ms.find((m) => m.groupId.startsWith('c1s2'))
await p.goto(U + `#korekta-${s2.id}`); await wait(2500)
await p.locator('.rf-input').nth(0).fill('15'); await p.locator('.rf-input').nth(1).fill('10')
await p.getByRole('button', { name: /Zapisz poprawiony wynik/ }).click(); await wait(2500)
await p.goto(U + `#korekta-${first.id}`); await wait(2500)
const note = await p.locator('.notice-inline', { hasText: 'Następna faza już się zaczęła' }).innerText().catch(() => '')
check('2. Drugi etap trwa: wyniku z fazy grupowej nie można cofnąć, można poprawić', await p.getByRole('button', { name: /Cofnij wynik/ }).count() === 0 && note.includes('Można go tylko poprawić') && await p.getByRole('button', { name: /Zapisz poprawiony wynik/ }).count() === 1, note)
await p.screenshot({ path: S + '/phase-lock.png', fullPage: true })
// Clean up: the second-stage result back, the group phase open again.
await p.goto(U + `#korekta-${s2.id}`); await wait(2500)
await p.getByRole('button', { name: /Cofnij wynik/ }).click(); await wait(2500)
await p.goto(U + '#panel-grupy'); await wait(2500)
await ends.getByRole('button', { name: 'Cofnij' }).first().click(); await wait(3000)
const d = await tdoc()
check('3. Posprzątane: drugi etap usunięty', !d.groups.some((g) => g.id.startsWith('c1s2g')))
console.log('Błędy strony:', errs.length ? errs : 'brak')
console.log(`WYNIK: ${res.filter(Boolean).length}/${res.length}`)
await b.close()
