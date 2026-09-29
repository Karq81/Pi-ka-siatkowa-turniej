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
const ends = p.locator('.phase-ends')
const t1 = await ends.innerText().catch(() => '')
check('1. Przy fazach: „Zakończ fazę grupową” z liczbą meczów do końca', /Zakończ fazę grupową/i.test(t1) && t1.includes('do końca'), t1.replace(/\n/g, ' | '))
await p.screenshot({ path: S + '/phase-ends.png' })
await ends.getByRole('button', { name: /Zakończ fazę grupową/ }).click(); await wait(400)
const q = await p.locator('.confirm-box').innerText().catch(() => '')
check('2. Pytanie „Czy na pewno chcesz zakończyć fazę grupową?”', q.includes('Czy na pewno chcesz zakończyć fazę grupową?') && /nierozegran/.test(q), q.replace(/\n/g, ' | ').slice(0, 200))
await p.screenshot({ path: S + '/phase-confirm.png' })
await p.getByRole('button', { name: 'Nie, jeszcze nie' }).click(); await wait(500)
check('3. „Nie, jeszcze nie”: nic się nie zmienia', !(await tdoc()).groups.some((g) => g.id.startsWith('c1s2g')))
await ends.getByRole('button', { name: /Zakończ fazę grupową/ }).click(); await wait(300)
await p.getByRole('button', { name: 'Tak, zakończ fazę grupową' }).click(); await wait(4000)
let d = await tdoc()
check('4. Po potwierdzeniu: drugi etap ułożony, faza grupowa zakończona', d.groups.filter((g) => g.id.startsWith('c1s2g')).length === 4 && d.tournament.phases?.c1?.groupsEnded === true)
const t2 = await ends.innerText().catch(() => '')
check('5. Teraz „Zakończ drugi etap” z liczbą meczów', t2.includes('Faza grupowa zakończona') && /Zakończ drugi etap/i.test(t2) && t2.includes('84 mecze'), t2.replace(/\n/g, ' | '))
await ends.getByRole('button', { name: /Zakończ drugi etap/ }).click(); await wait(300)
await p.getByRole('button', { name: 'Tak, zakończ drugi etap' }).click(); await wait(4000)
const fr = await p.locator('.final-ranking').innerText().catch(() => '')
check('6. Klasyfikacja końcowa po zakończeniu drugiego etapu', fr.includes('Klasyfikacja końcowa'), fr.slice(0, 120).replace(/\n/g, ' | '))
await p.screenshot({ path: S + '/phase-final.png', fullPage: false })
const fan = await (await b.newContext({ locale: 'pl-PL', viewport: { width: 390, height: 844 } })).newPage()
await fan.goto(U + '#grupy'); await wait(3000)
check('7. Kibic nie widzi przycisków kończenia', (await fan.locator('.phase-ends').count()) === 0)
await ends.getByRole('button', { name: 'Cofnij' }).first().click(); await wait(3000)
d = await tdoc()
check('8. Cofnięcie obu: wszystko jak przed', !d.groups.some((g) => g.id.startsWith('c1s2g')) && !d.tournament.phases?.c1?.groupsEnded)
console.log('Błędy strony:', errs.length ? errs : 'brak')
console.log(`WYNIK: ${res.filter(Boolean).length}/${res.length}`)
await b.close()
