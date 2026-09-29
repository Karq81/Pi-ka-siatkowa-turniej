// Live scores through the Realtime Database: referee scoring, fans, offline, reload offline.
import { chromium } from 'playwright'
// Screenshots and files go to e2e/out (or E2E_OUT). Runs against the Firebase emulators only.
const OUT = process.env.E2E_OUT || 'e2e/out'
const U = process.env.E2E_URL || 'http://localhost:5191/'
const API = 'http://127.0.0.1:8080/v1/projects/demo-siatkalive/databases/(default)/documents/tournaments/main'
const RT = (p) => `http://127.0.0.1:9000/${p}.json?ns=demo-siatkalive-default-rtdb`
const H = { Authorization: 'Bearer owner' }
const results = []
const check = (name, ok, info = '') => { results.push(ok); console.log(ok ? 'OK  ' : 'BŁĄD', name, info) }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const rt = async (p) => (await fetch(RT(p), { headers: H })).json()
const val = (v) => v.stringValue ?? (v.integerValue !== undefined ? +v.integerValue : v.arrayValue ? (v.arrayValue.values ?? []).map(val) : v.mapValue ? Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, val(x)])) : v.booleanValue ?? v.doubleValue ?? null)
const sheet = async (c) => val({ mapValue: { fields: (await (await fetch(`${API}/matches/court-${c}`, { headers: H })).json()).fields } })
const score = (m) => m.sets.map((s) => `${s.a}:${s.b}`).join(',')

// Clean databases
await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-siatkalive/databases/(default)/documents', { method: 'DELETE' })
await fetch(RT(''), { method: 'DELETE', headers: H })

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined })
const errs = []
const mk = async (name, opts) => {
  const ctx = await b.newContext({ locale: 'pl-PL', ...opts })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(`${name}: ${e.message}`))
  return { ctx, p }
}
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
const { p: adm } = await mk('admin', { viewport: { width: 1100, height: 900 } })
const { ctx: refCtx, p: ref0 } = await mk('sedzia', phone)
let ref = ref0
const { p: fan } = await mk('kibic', phone)
const at = async (p) => p.clock.setFixedTime(new Date('2026-10-23T15:35:00'))
for (const p of [adm, ref, fan]) await at(p)

await adm.goto(U + '#panel'); await wait(2500)
await adm.locator('input[inputmode=numeric]').first().fill('1234'); await adm.getByRole('button', { name: /Ustaw PIN/ }).click(); await wait(5000)
const rtPins = await rt('pins/main')
check('1. Klucze skopiowane do Realtime Database', rtPins?.admin === '1234' && !!rtPins?.courts?.['1'], JSON.stringify(rtPins).slice(0, 60))

// Organiser turns the camera app on
await adm.goto(U + '#panel-wiecej'); await wait(2500)
if (await adm.locator('input[inputmode=numeric]').count()) { await adm.locator('input[inputmode=numeric]').first().fill('1234'); await adm.locator('button[type=submit]').first().click(); await wait(2000) }
await adm.locator('.camera-app summary').click(); await wait(1500)
check('1b. Przed włączeniem nie ma kodu', await adm.getByRole('button', { name: /Włącz i pokaż kod/ }).count() === 1)
await adm.getByRole('button', { name: /Włącz i pokaż kod/ }).click(); await wait(2000)
const code = (await adm.locator('.camera-code').innerText()).trim()
const KEY = code.split('/')[1]
const qrHref = await adm.locator('.camera-app a').first().getAttribute('href'); console.log('QR:', qrHref)
check('1c. Kod dla SportCast i QR', /^main\/[A-Z0-9]{10}$/.test(code) && await adm.locator('.camera-app .larix-qr svg').count() === 1, code)
await adm.locator('.camera-app').screenshot({ path: OUT + '/qr.png' })
check('1d. Kibic nie odczyta kodu', (await (await fetch(RT('pins/main/stream'))).json())?.error !== undefined)
const pins = (await (await fetch(`${API}/private/pins`, { headers: H })).json()).fields.courts.mapValue.fields
await ref.goto(U + '#boisko-1'); await wait(2000)
await ref.fill('#pin-input', pins['1'].stringValue); await ref.click('button[type=submit]'); await wait(3000)
const sess = await rt('sessions/main')
check('2. Sędzia boiska 1 ma sesję w Realtime Database', Object.values(sess ?? {}).some((s) => s.role === 'court' && s.court === 1))

await ref.getByRole('button', { name: /Rozpocznij mecz/ }).click({ force: true }); await wait(1500)
let s1 = await sheet(1)
const id = Object.values(s1.matches).find((m) => m.status === 'live')?.id
check('3. Start meczu zapisany w Firestore', !!id, id)
const plus = (i) => ref.locator('.btn-plus').nth(i)
for (let i = 0; i < 5; i++) { await plus(0).click({ force: true }); await wait(150) }
for (let i = 0; i < 3; i++) { await plus(1).click({ force: true }); await wait(150) }
await wait(1500)
const liveEntry = (await rt(`live/main/1/${id}`))
s1 = await sheet(1)
check('4. Punkty 5:3 w Realtime Database', liveEntry && score(liveEntry) === '5:3', liveEntry && score(liveEntry))
const bd = await rt(`board/main/${KEY}/1`)
check('4b. Tablica boiska 1 dla aplikacji: live 5:3', bd?.status === 'live' && bd.pointsA === 5 && bd.pointsB === 3 && !!bd.a && !!bd.b, JSON.stringify(bd).slice(0, 200))
const b2 = await rt(`board/main/${KEY}/2`)
check('4b. Tablica boiska 2 wypełniona przez sędziego głównego', b2?.v === 1 && ['next', 'live', 'finished', 'none'].includes(b2.status), JSON.stringify(b2).slice(0, 120))
check('4. Firestore nie zapisuje każdego punktu (dalej 0:0)', score(s1.matches[id]) === '0:0', score(s1.matches[id]))

const courtText = async () => { await fan.goto(U + '#na-zywo'); await wait(2500); return (await fan.locator('.court').first().innerText()).replace(/\n/g, ' | ') }
let card = await courtText()
check('5. Kibic widzi 5:3 na żywo', /\| 5 \|.*\| 3/.test(card) || (card.includes('5') && card.includes('3') && card.includes('TRWA')), card.slice(0, 120))

// Live update without reload
await plus(0).click({ force: true }); await wait(2000)
card = (await fan.locator('.court').first().innerText()).replace(/\n/g, ' | ')
check('6. Kibic dostaje punkt bez odświeżania (6:3)', card.includes('6'), card.slice(0, 120))

// Offline scoring, then back online
await refCtx.setOffline(true)
await plus(0).click({ force: true }); await wait(200); await plus(0).click({ force: true }); await wait(800)
const local = (await ref.locator('.pad-score').allInnerTexts()).join(':')
check('7. Bez internetu sędzia dalej liczy (8:3 w telefonie)', local === '8:3', local)
await refCtx.setOffline(false); await wait(4000)
check('7. Po powrocie internetu punkty docierają (8:3)', score(await rt(`live/main/1/${id}`)) === '8:3', score(await rt(`live/main/1/${id}`)))

// Points typed offline, page closed before the signal came back
await refCtx.setOffline(true)
await plus(1).click({ force: true }); await wait(600)
await ref.close()
await refCtx.setOffline(false)
ref = await refCtx.newPage(); await at(ref)
ref.on('pageerror', (e) => errs.push(`sedzia2: ${e.message}`))
await ref.goto(U + '#boisko-1'); await wait(6000)
check('8. Punkt wpisany bez internetu przed zamknięciem strony nie ginie (8:4)', score(await rt(`live/main/1/${id}`)) === '8:4', score(await rt(`live/main/1/${id}`)))
card = await courtText()
check('8. Kibic widzi 8:4', card.includes('8') && card.includes('4'), card.slice(0, 120))

// Finish the set: A to 15
const reload = (await ref.locator('.pad-score').allInnerTexts()).join(':')
check('9. Sędzia po powrocie widzi 8:4', reload === '8:4', reload)
for (let i = 0; i < 7; i++) { await ref.locator('.btn-plus').nth(0).click({ force: true }); await wait(150) }
await wait(800)
await ref.getByRole('button', { name: /Zakończ mecz i wyślij wynik/ }).click({ force: true }); await wait(3000)
s1 = await sheet(1)
check('10. Wynik końcowy 15:4 w Firestore', s1.matches[id].status === 'finished' && score(s1.matches[id]) === '15:4', score(s1.matches[id]))
check('10. Wpis na żywo usunięty z Realtime Database', (await rt(`live/main/1/${id}`)) === null)
const bd10 = await rt(`board/main/${KEY}/1`)
check('10b. Tablica boiska 1: następny mecz i poprzedni wynik 15:4', bd10?.status === 'next' && bd10.previous?.sets?.[0]?.a === 15 && bd10.previous?.sets?.[0]?.b === 4, JSON.stringify(bd10).slice(0, 200))
await fan.goto(U + `kamera?cam=main/${KEY}#kamera`); await wait(2500)
const sb = (await fan.locator('.scoreboard').first().innerText()).replace(/\n/g, ' | ')
check('10c. Strona tablicy boiska pokazuje następny mecz', sb.includes(bd10.a), sb.slice(0, 160))
await fan.screenshot({ path: OUT + '/sb.png' })
check('11. Bez klucza nie da się wylistować tablic', (await (await fetch(RT('board/main'))).json())?.error !== undefined)
card = await courtText()
check('10. Kibic widzi wynik 15:4', card.includes('15:4') || (card.includes('15') && card.includes('4')), card.slice(0, 140))

console.log('\nBłędy w przeglądarkach:', errs.length ? errs : 'brak')
console.log(`WYNIK: ${results.filter(Boolean).length}/${results.length} OK`)
await b.close()
