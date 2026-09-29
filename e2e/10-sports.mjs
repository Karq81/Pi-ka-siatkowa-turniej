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

async function create(sport, format, players, opts = {}) {
  const slug = `e2e-${sport}-${rnd}`.slice(0, 40)
  await p.goto(U + '#nowy-turniej'); await p.reload(); await p.waitForTimeout(1500)
  await p.locator('.new-t-form select').first().selectOption(sport)
  if (format) await p.locator('.new-t-form select').nth(1).selectOption(format)
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
  await p.locator('.setup-cat input[inputmode=numeric]').first().fill('1')
  await p.waitForTimeout(500)
  const btn = p.locator('.setup-cat').first().getByRole('button', { name: /losuj grupy/ })
  if (await btn.isDisabled()) { await p.screenshot({ path: `${S}/fail-create-${sport}.png`, fullPage: true }); console.log('DISABLED', sport, await p.locator('.setup-cat').first().innerText()) }
  await btn.click()
  await p.locator('.setup-cat .ok').first().waitFor({ timeout: 15000 }); await p.waitForTimeout(1200)
  return slug
}

// A. missing fields in red
await p.goto(U + '#nowy-turniej'); await p.waitForTimeout(2000)
await p.getByRole('button', { name: /Dalej/ }).click(); await p.waitForTimeout(300)
const miss = await p.locator('.form-missing').innerText().catch(() => '')
check('A. Brakujące pola na czerwono (nazwa, dzień)', (await p.locator('.new-t-form .field-bad').count()) >= 2 && miss.includes('Wybierz dzień pierwszego meczu') && miss.includes('Wpisz nazwę turnieju'), miss.replace(/\n/g, ' | ').slice(0, 160))

// B. own discipline name -> shown, and its words (mata)
const zs = await create('inna-wynik', null, ['Adam', 'Bartek', 'Czarek'], { customName: 'Zapasy' })
let T = await tdoc(zs)
check('B. Własna nazwa dyscypliny zapisana', T.tournament.rules.sport === 'Zapasy', T.tournament.rules.sport)
const fan = await phone()
await fan.goto(U + `?t=${zs}`); await fan.waitForTimeout(2000)
const hero = await fan.locator('.info-hero').innerText()
check('B. Nazwa dyscypliny na stronie turnieju', /zapasy/i.test(hero), hero.replace(/\n/g, ' | ').slice(0, 100))
await fan.goto(U + `?t=${zs}#na-zywo`); await fan.waitForTimeout(2000)
const zc = await fan.locator('.court').first().innerText()
check('B. Zapasy: „Mata” zamiast „Boisko”', /MATA 1/i.test(zc), zc.replace(/\n/g, ' | ').slice(0, 80))

// C. karate
const ks = await create('karate', '90s', ['Aka Jan', 'Ao Piotr'])
const kr = await phone()
await kr.goto(U + `?t=${ks}#boisko-1`); await kr.waitForTimeout(2000)
check('C. Karate: nagłówek „Mata 1”', (await kr.locator('h1').innerText()).includes('Mata 1'))
await kr.getByRole('button', { name: 'Rozpocznij walkę' }).click(); await kr.waitForTimeout(800)
const kpad = (i) => kr.locator('.jd-pad').nth(i)
await kpad(0).getByRole('button', { name: /Yuko \+1/ }).click(); await kr.waitForTimeout(300)
check('C. Pierwszy punkt daje senshu', (await kpad(0).locator('.kr-senshu').count()) === 1)
await kpad(0).getByRole('button', { name: /Ippon \+3/ }).click(); await kr.waitForTimeout(300)
await kpad(0).getByRole('button', { name: /Waza-ari \+2/ }).click(); await kr.waitForTimeout(300)
await kpad(1).getByRole('button', { name: 'Kara', exact: true }).click(); await kr.waitForTimeout(300)
check('C. Kara Chui 1', (await kpad(1).innerText()).includes('Chui 1'))
await kpad(0).getByRole('button', { name: /Waza-ari \+2/ }).click(); await kr.waitForTimeout(600)
const kn = await kr.locator('.notice').first().innerText()
check('C. Przewaga 8 pkt kończy walkę', kn.includes('Przewaga 8 punktów') && await kpad(0).getByRole('button', { name: /Yuko/ }).isDisabled(), kn.replace(/\n/g, ' '))
await kr.getByRole('button', { name: 'Zakończ walkę i wyślij wynik' }).click(); await kr.waitForTimeout(1500)
let ms = await matches(ks)
const km = ms.find((m) => m.status === 'finished')
check('C. Zapisane 8:0 z senshu i karą', km && km.sets[0].a === 8 && km.sets[0].karate.senshu === 'a' && km.sets[0].karate.pb === 1, JSON.stringify(km?.sets))

// D. chess
const cs = await create('szachy', 'blitz', ['Kasparow', 'Karpow'])
T = await tdoc(cs)
check('D. Szachy: tempo blitz, runda co 12 min, remis 0,5 pkt', T.tournament.slotMinutes === 12 && T.tournament.rules.pointsDraw === 0.5, `${T.tournament.slotMinutes} ${T.tournament.rules.pointsDraw}`)
const cr = await phone()
await cr.goto(U + `?t=${cs}#boisko-1`); await cr.waitForTimeout(2000)
check('D. Szachy: „Stół 1”', (await cr.locator('h1').innerText()).includes('Stół 1'))
await cr.getByRole('button', { name: 'Rozpocznij partię' }).click(); await cr.waitForTimeout(800)
await cr.getByRole('button', { name: /½–½/ }).click(); await cr.waitForTimeout(200)
await cr.locator('.chess-pick select').selectOption('pat')
await cr.getByRole('button', { name: 'Zakończ partię i wyślij wynik' }).click(); await cr.waitForTimeout(1500)
ms = await matches(cs)
const cm = ms.find((m) => m.status === 'finished')
check('D. Remis ½–½ (pat) zapisany', cm && cm.sets[0].a === 0.5 && cm.sets[0].chess === 'pat', JSON.stringify(cm?.sets))
await fan.goto(U + `?t=${cs}#tabele`); await fan.waitForTimeout(2000)
const ct = (await fan.locator('table').first().innerText()).replace(/\n/g, ' | ')
check('D. Tabela: po 0,5 pkt', /0[.,]5/.test(ct), ct.slice(0, 160))

// E. basketball
const bs = await create('koszykowka', null, ['Lakers', 'Bulls'])
const br = await phone()
await br.goto(U + `?t=${bs}#boisko-1`); await br.waitForTimeout(2000)
await br.getByRole('button', { name: /Rozpocznij mecz/ }).click(); await br.waitForTimeout(800)
check('E. Zegar: 1. kwarta 10:00', (await br.locator('.contest-clock').innerText()).includes('1. kwarta') && (await br.locator('.jd-time').innerText()) === '10:00', (await br.locator('.contest-clock').innerText()).replace(/\n/g, ' ').slice(0, 60))
await br.locator('.pad').nth(0).getByRole('button', { name: /\+3/ }).click(); await br.waitForTimeout(300)
await br.locator('.pad').nth(1).getByRole('button', { name: /\+2/ }).click(); await br.waitForTimeout(300)
await br.locator('.pad').nth(1).getByRole('button', { name: /\+1/ }).click(); await br.waitForTimeout(600)
const bsc = (await br.locator('.pad-score').allInnerTexts()).join(':')
check('E. Koszykówka +3 / +2 / +1 → 3:3', bsc === '3:3', bsc)

// F. tennis point by point
const ts = await create('tenis', '2z3', ['Nadal', 'Federer'])
const tr = await phone()
await tr.goto(U + `?t=${ts}#boisko-1`); await tr.waitForTimeout(2000)
check('F. Tenis: „Kort 1”', (await tr.locator('h1').innerText()).includes('Kort 1'))
await tr.getByRole('button', { name: /Rozpocznij mecz/ }).click(); await tr.waitForTimeout(800)
const pt = (i) => tr.locator('.pad').nth(i).getByRole('button', { name: /^Punkt dla/ })
await pt(0).click(); await tr.waitForTimeout(250); await pt(0).click(); await tr.waitForTimeout(250); await pt(1).click(); await tr.waitForTimeout(500)
check('F. Gem 30:15', (await tr.locator('.tn-game').innerText()).includes('30:15'), await tr.locator('.tn-game').innerText())
await fan.goto(U + `?t=${ts}#na-zywo`); await fan.waitForTimeout(2500)
const tc = (await fan.locator('.court').first().innerText()).replace(/\n/g, ' | ')
check('F. Kibic widzi gem 30:15', tc.includes('30:15'), tc.slice(0, 140))
await pt(0).click(); await tr.waitForTimeout(250); await pt(0).click(); await tr.waitForTimeout(600)
const tg = (await tr.locator('.pad-score').allInnerTexts()).join(':')
check('F. Wygrany gem → 1:0 w gemach', tg === '1:0' && (await tr.locator('.tn-game').innerText()).includes('0:0'), tg)

// G. number box: deleting the last digit leaves it empty
await p.goto(U + `?t=${bs}#panel-sedziowie`); await p.waitForTimeout(2000)
const slot = p.locator('#slot-minutes')
await slot.click(); await slot.press('End'); await slot.press('Backspace'); await slot.press('Backspace'); await p.waitForTimeout(200)
const emptied = await slot.inputValue()
await slot.type('7'); await p.waitForTimeout(200)
check('G. Pole liczbowe: po skasowaniu puste, można wpisać 7', emptied === '' && (await slot.inputValue()) === '7', `po kasowaniu „${emptied}”, potem „${await slot.inputValue()}”`)

// H. sign-ups
await p.goto(U + `?t=${bs}#panel`); await p.waitForTimeout(2000)
await p.getByLabel('Zgłoszenia otwarte').check(); await p.waitForTimeout(1500)
const guest = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'pl-PL' })
const g = await guest.newPage(); g.on('pageerror', (e) => errs.push('guest: ' + e.message))
await g.goto(U + `?t=${bs}`); await g.waitForTimeout(2500)
check('H. Na stronie turnieju przycisk „Zgłoś drużynę”', await g.getByRole('link', { name: 'Zgłoś drużynę' }).count() === 1)
await g.goto(U + `?t=${bs}#zgloszenie`); await g.waitForTimeout(2000)
await g.getByRole('button', { name: 'Wyślij zgłoszenie' }).click(); await g.waitForTimeout(300)
check('H. Puste zgłoszenie: pola na czerwono', (await g.locator('.field-bad').count()) >= 3)
await g.getByLabel(/Nazwa drużyny albo zawodnika/).fill('Celtics')
await g.getByLabel(/Skład/).fill('7 Jan\n10 Adam')
await g.getByLabel(/Osoba do kontaktu/).fill('Trener Tomek')
await g.getByLabel('Telefon').fill('600100200')
await g.locator('.reg-form input[type=checkbox]').check()
await g.getByRole('button', { name: 'Wyślij zgłoszenie' }).click(); await g.waitForTimeout(2500)
check('H. Zgłoszenie wysłane', (await g.locator('main').innerText()).includes('Zgłoszenie wysłane'))
await p.reload(); await p.waitForTimeout(2500)
const ent = await p.locator('.entry').first().innerText().catch(() => '')
check('H. Organizator widzi zgłoszenie z kontaktem', ent.includes('Celtics') && ent.includes('600100200'), ent.replace(/\n/g, ' | ').slice(0, 120))
await p.getByRole('button', { name: 'Przyjmij do turnieju' }).first().click(); await p.waitForTimeout(2000)
T = await tdoc(bs)
check('H. Przyjęta drużyna jest w turnieju', T.teams.some((x) => x.name === 'Celtics'), T.teams.map((x) => x.name).join(','))

console.log('Błędy strony:', errs.length ? errs : 'brak')
console.log(`WYNIK: ${res.filter(Boolean).length}/${res.length}`)
await b.close()
