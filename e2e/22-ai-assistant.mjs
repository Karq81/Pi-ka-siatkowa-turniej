import { chromium } from 'playwright'
// Screenshots and files go to e2e/out (or E2E_OUT). Runs against the Firebase emulators only.
const OUT = process.env.E2E_OUT || 'e2e/out'
const S = OUT
const U = process.env.E2E_URL || 'http://localhost:5191/'
const API = 'http://127.0.0.1:8080/v1/projects/demo-siatkalive/databases/(default)/documents/tournaments'
const H = { Authorization: 'Bearer owner' }
const res = []; const check = (n, ok, info = '') => { res.push(ok); console.log(ok ? 'OK  ' : 'BŁĄD', n, info) }
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined })
const errs = []
const p = await (await b.newContext({ viewport: { width: 1200, height: 1000 }, locale: 'pl-PL' })).newPage(); p.on('pageerror', (e) => errs.push(e.message))
// What Gemini would answer for: "Turniej piłki nożnej, 8 drużyn w 2 grupach, 2 najlepsze z grupy do półfinałów, dwumecze, bez meczu o 3. miejsce, najpierw bezpośredni mecz".
const draft = {
  name: 'Puchar Architekta', sport: 'pilka-nozna', sportName: '', format: 'remis', date: '2027-06-12', time: '09:00', dayEnd: '19:00', courts: 2, slotMinutes: 35,
  categories: [{ name: 'Seniorzy', teams: ['Orły', 'Sokoły', 'Kruki', 'Jastrzębie', 'Wrony', 'Czaple', 'Bociany', 'Mewy'], groups: [], matches: [] }],
  system: 'groups', thirdPlace: false, twice: false, swissRounds: 0, restRounds: 1, breakFrom: '13:00', breakTo: '13:30',
  bronzes: false, allPlaces: false, seeding: 'draw', separateClubs: false, advancePerGroup: 2, advanceBest: 0,
  ties: 'two', seriesGames: 0, awayGoals: false, finalSingle: true, measuredMode: '', qualifyQ: 0, qualifyq: 0, placePoints: '', dropWorst: 0,
  tiebreak: ['h2h_points', 'h2h_diff', 'diff', 'scored'], h2hReapply: true, withdrawal: 'A',
  notes: 'Grupy po 4, awans 2 najlepszych, półfinały i finał w dwumeczach (finał jeden mecz). Mecze: 12 grupowych + 5 w drabince, zmieści się do 19:00.',
}
let prompt = ''
await p.route(/generateContent/, async (route) => {
  prompt = route.request().postData() ?? ''
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(draft) }] }, finishReason: 'STOP', index: 0 }] }) })
})
await p.goto(U + '#rejestracja'); await p.waitForTimeout(2500)
await p.getByLabel(/^Login/).fill('arch' + Date.now() % 100000); await p.getByLabel(/Nazwa klubu/).fill('KS Architekt')
await p.locator('input[type=password]').nth(0).fill('haslo123'); await p.locator('input[type=password]').nth(1).fill('haslo123')
await p.getByRole('button', { name: 'Załóż konto' }).last().click(); await p.waitForTimeout(3000)
await p.goto(U + '#nowy-turniej'); await p.waitForTimeout(1500)
await p.locator('.ai-cta').click({ force: true }); await p.waitForTimeout(600)
await p.locator('.ai-box textarea').fill('Turniej piłki nożnej 12 czerwca od 9, 2 boiska, 8 drużyn w 2 grupach, 2 najlepsze z grupy do półfinałów, półfinały w dwumeczach, bez meczu o 3. miejsce, najpierw bezpośredni mecz, przerwa obiadowa 13:00–13:30, drużyny nie grają mecz po meczu. Orły, Sokoły, Kruki, Jastrzębie, Wrony, Czaple, Bociany, Mewy')
await p.getByRole('button', { name: 'Przygotuj turniej' }).click(); await p.waitForTimeout(2500)
check('1. Asystent dostaje wiedzę o wszystkich klockach', /advancePerGroup/.test(prompt) && /best:3:1/.test(prompt) && /measuredMode/.test(prompt) && /americano/.test(prompt), `${prompt.length} znaków`)
const notice = await p.locator('.notice-inline', { hasText: 'Asystent ustawił też' }).innerText().catch(() => '')
check('2. Formularz pokazuje ustawienia od asystenta', /2 najlepszych z każdej grupy/.test(notice) && /dwumecze/.test(notice) && /punkty w meczach bezpośrednich/.test(notice), notice)
const brk = await p.getByLabel('Przerwa od').inputValue()
check('3. Przerwa i odpoczynek z opisu w formularzu', brk === '13:00', brk)
await p.screenshot({ path: S + '/ai2-form.png', fullPage: true })
const slug = await p.locator('.new-t-link b').innerText().then((x) => x.split('?t=')[1]).catch(() => '')
await p.getByRole('button', { name: /Dalej/ }).click(); await p.waitForURL(/t=/); await p.waitForTimeout(2000)
const real = new URL(p.url()).searchParams.get('t')
await p.locator('#pin-admin').fill('5555'); await p.getByRole('button', { name: 'Utwórz turniej' }).click(); await p.waitForTimeout(5000)
const val = (v) => v.stringValue ?? (v.integerValue !== undefined ? +v.integerValue : v.booleanValue !== undefined ? v.booleanValue : v.arrayValue ? (v.arrayValue.values ?? []).map(val) : v.mapValue ? Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, val(x)])) : null)
const T = val({ mapValue: { fields: (await (await fetch(`${API}/${real}`, { headers: H })).json()).fields } })
check('4. Turniej ma awans z grup, dwumecze, kryteria i przerwę', T.tournament.advance?.perGroup === 2 && T.tournament.ties?.kind === 'two' && T.tournament.rules.tiebreak?.[0] === 'h2h_points' && T.tournament.rules.h2hReapply === true && T.tournament.rest === 1 && T.tournament.breaks?.[0]?.from === '13:00',
  JSON.stringify({ adv: T.tournament.advance, ties: T.tournament.ties, tb: T.tournament.rules.tiebreak, rest: T.tournament.rest, br: T.tournament.breaks, slug }))
// Draw: 2 groups, then the play-off bracket with return legs.
await p.locator('.setup-cat input[inputmode=numeric]').first().fill('2'); await p.waitForTimeout(500)
await p.locator('.setup-cat').first().getByRole('button', { name: /losuj grupy/ }).click()
await p.locator('.setup-cat .ok').first().waitFor({ timeout: 15000 }); await p.waitForTimeout(1500)
const mj = await (await fetch(`${API}/${real}/matches?pageSize=100`, { headers: H })).json()
const ms = (mj.documents ?? []).flatMap((d) => Object.values(val({ mapValue: { fields: d.fields } }).matches ?? {}))
const ko = ms.filter((m) => m.ko)
check('5. Po losowaniu: 12 meczów grupowych, półfinały z rewanżami, finał', ms.filter((m) => !m.ko).length === 12 && ko.filter((m) => m.ko.legOf).length === 2 && ko.some((m) => m.ko.label === 'Finał'), ko.map((m) => m.ko.label).join(' | '))
console.log('Błędy strony:', errs.length ? errs : 'brak')
console.log(`WYNIK: ${res.filter(Boolean).length}/${res.length}`)
await b.close()
