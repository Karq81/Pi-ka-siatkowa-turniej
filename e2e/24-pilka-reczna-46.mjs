import { chromium } from 'playwright'
import { writeFileSync } from 'fs'
// Test end-to-end: piłka ręczna, 46 (albo 45: N=45) drużyn, 6 grup, 3 boiska, awans 2+4 do drabinki 16.
// Wyłącznie emulatory Firebase. Zrzuty i raport JSON trafiają do e2e/out (E2E_OUT).
// Uruchomienie: NO_PROXY=127.0.0.1,localhost CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome N=46 node e2e/24-pilka-reczna-46.mjs
const N = Number(process.env.N || 46)
const BEST = Number(process.env.BEST ?? 4) // ile najlepszych drużyn z 3. miejsc awansuje (45: 3 -> 15 drużyn, drabinka z wolnym losem)
const EXTRA = process.env.EXTRA === '1' // sędzia na żywo, wycofania drużyn
const FULL = N === 46 && BEST === 4
const OUT = process.env.E2E_OUT || 'e2e/out'
const S = OUT
const U = process.env.E2E_URL || 'http://localhost:5191/'
const API = 'http://127.0.0.1:8080/v1/projects/demo-siatkalive/databases/(default)/documents/tournaments'
const H = { Authorization: 'Bearer owner' }
const val = (v) => v.stringValue ?? (v.integerValue !== undefined ? +v.integerValue : v.doubleValue !== undefined ? v.doubleValue : v.booleanValue !== undefined ? v.booleanValue : v.arrayValue ? (v.arrayValue.values ?? []).map(val) : v.mapValue ? Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, val(x)])) : null)
const tdoc = async (t) => val({ mapValue: { fields: (await (await fetch(`${API}/${t}`, { headers: H })).json()).fields } })
const matches = async (t) => {
  let out = []; let tok = ''
  do {
    const j = await (await fetch(`${API}/${t}/matches?pageSize=100${tok ? '&pageToken=' + tok : ''}`, { headers: H })).json()
    out = out.concat((j.documents ?? []).flatMap((d) => Object.values(val({ mapValue: { fields: d.fields } }).matches ?? {})))
    tok = j.nextPageToken
  } while (tok)
  return out
}
const res = []; const bugs = []
const check = (n, ok, info = '') => { res.push(ok); console.log(ok ? 'OK  ' : 'BŁĄD', n, info); if (!ok) bugs.push({ n, info }) }
const t0 = Date.now(); const el = () => ((Date.now() - t0) / 1000).toFixed(0) + 's'
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined })
const ctx = await b.newContext({ viewport: { width: 1200, height: 900 }, locale: 'pl-PL' })
const p = await ctx.newPage(); const errs = []; const cons = []
const hook = (pg, tag) => { pg.on('pageerror', (e) => errs.push(`${tag}: ${e.message}`)); pg.on('console', (m) => { if (m.type() === 'error') cons.push(`${tag}: ${m.text().slice(0, 200)}`) }) }
hook(p, 'admin')
p.on('dialog', (d) => d.accept())
const rnd = Math.random().toString(36).slice(2, 6)
const slug = `e2e-hb${N}-${rnd}`
const stage = process.env.STAGE || 'all'
const stop = (s) => { if (stage === s) { console.log('STOP po etapie', s); return true } return false }
// pseudo-random, deterministic
let seed = 12345 + N
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }

// --- drużyny: kluby po 2-3 drużyny (rozdzielenie w grupach)
const cities = ['Alfa', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa', 'Lambda', 'Mi', 'Ni', 'Ksi', 'Omikron', 'Pi', 'Rho', 'Sigma', 'Tau', 'Ypsilon']
const teamLines = []
let ci = 0
while (teamLines.length < N) { const c = cities[ci++ % cities.length]; const k = 2 + (ci % 2); for (let j = 1; j <= k && teamLines.length < N; j++) teamLines.push(`KS ${c}: ${c} ${j}`) }

// --- 0. konto organizatora
await p.goto(U + '#rejestracja'); await p.waitForTimeout(2500)
await p.getByLabel(/^Login/).fill('hb' + (Date.now() % 1000000)); await p.getByLabel(/Nazwa klubu/).fill('KS Test Ręczna')
await p.locator('input[type=password]').nth(0).fill('haslo123'); await p.locator('input[type=password]').nth(1).fill('haslo123')
await p.getByRole('button', { name: 'Załóż konto' }).last().click(); await p.waitForTimeout(3000)
await p.screenshot({ path: `${S}/hb-00-konto.png` })

// --- 1. nowy turniej
await p.goto(U + '#nowy-turniej'); await p.reload(); await p.waitForTimeout(2000)
await p.locator('.new-t-form select').first().selectOption('pilka-reczna')
await p.getByLabel(/Nazwa turnieju/).fill(`Puchar Ręcznej ${N}`)
await p.getByRole('button', { name: 'zmień' }).click()
await p.locator('.new-t-address input').fill(slug)
await p.getByLabel(/Dzień pierwszego meczu/).fill('2027-05-08')
await p.getByLabel(/Liczba boisk/).fill('3')
await p.getByLabel(/Mecz co ile minut/).fill('20')
await p.screenshot({ path: `${S}/hb-01-formularz.png`, fullPage: true })
await p.getByRole('button', { name: /Dalej/ }).click()
await p.waitForURL(new RegExp(`t=${slug}`), { timeout: 20000 }); await p.waitForTimeout(1500)
await p.locator('#pin-admin').fill('4321'); await p.getByRole('button', { name: 'Utwórz turniej' }).click()
await p.locator('.setup-cat textarea').first().waitFor({ timeout: 20000 })
const base = U + `?t=${slug}`
let T = await tdoc(slug)
check('1. Turniej piłki ręcznej: punkty 2/1/0, remisy dozwolone', T.tournament.rules.pointsWin === 2 && T.tournament.rules.pointsDraw === 1 && T.tournament.rules.pointsLoss === 0 && T.tournament.rules.draws === true, JSON.stringify({ w: T.tournament.rules.pointsWin, d: T.tournament.rules.pointsDraw, l: T.tournament.rules.pointsLoss, draws: T.tournament.rules.draws, courts: T.tournament.courts, slot: T.tournament.slotMinutes }))

// --- 2. ustawienia „Po grupach”: awans 2 z grupy + 4 najlepsze z 3. miejsc, wszyscy grają o miejsca
await p.locator('.system-setting label', { hasText: 'Po grupach' }).locator('select').selectOption('top'); await p.waitForTimeout(800)
await p.locator('.system-setting label', { hasText: 'Awansuje z każdej grupy' }).locator('input').fill('2'); await p.keyboard.press('Tab')
await p.locator('.system-setting label', { hasText: 'Plus najlepsze z kolejnego miejsca' }).locator('input').fill(String(BEST)); await p.keyboard.press('Tab')
await p.locator('.system-setting label', { hasText: 'Po półfinałach' }).locator('select').selectOption('all'); await p.waitForTimeout(800)
await p.locator('.setup-cat textarea').first().fill(teamLines.join('\n'))
await p.locator('.setup-cat input[inputmode=numeric]').first().fill('6'); await p.keyboard.press('Tab'); await p.waitForTimeout(600)
const forecast = await p.locator('.forecast').first().innerText().catch(() => '(brak prognozy)')
console.log('Prognoza:', forecast.replace(/\n/g, ' '))
await p.screenshot({ path: `${S}/hb-02-przed-losowaniem.png`, fullPage: true })
const tDraw = Date.now()
await p.locator('.setup-cat').first().getByRole('button', { name: /losuj grupy/ }).click()
await p.locator('.setup-cat .ok', { hasText: 'Rozlosowano' }).first().waitFor({ timeout: 30000 }); await p.waitForTimeout(2500)
console.log('Losowanie:', Date.now() - tDraw, 'ms')
await p.screenshot({ path: `${S}/hb-03-po-losowaniu.png`, fullPage: true })
T = await tdoc(slug)
let ms = await matches(slug)
console.log('grup', T.groups.length, 'drużyn', T.teams.length, 'meczów', ms.length, 'advance', JSON.stringify(T.tournament.advance), 'finish', T.tournament.allPlaces, el())
writeFileSync(`${S}/hb-state-${N}.json`, JSON.stringify({ T, ms }, null, 1))

// ============ pomocnicze ============
const tname = Object.fromEntries(T.teams.map((x) => [x.id, x.name])); const tclub = Object.fromEntries(T.teams.map((x) => [x.id, x.club]))
const gname = Object.fromEntries(T.groups.map((g) => [g.id, g.name]))
const strength = Object.fromEntries(T.teams.map((x) => [x.id, rand()]))
const grpMs = ms.filter((m) => m.groupId); const koMs0 = ms.filter((m) => !m.groupId)
const tmin = (iso) => Date.parse(iso + ':00Z') / 60000

// --- 3. struktura terminarza
let bad = []
for (const g of T.groups) { const n = g.teamIds.length; const c = grpMs.filter((m) => m.groupId === g.id).length; if (c !== n * (n - 1) / 2) bad.push(`${g.name}: ${n} drużyn, ${c} meczów`) }
check('2. Liczba meczów w grupach = n(n-1)/2 w każdej grupie', !bad.length && grpMs.length === T.groups.reduce((s, g) => s + g.teamIds.length * (g.teamIds.length - 1) / 2, 0), `${grpMs.length} meczów; ${bad.join('; ')}`)
const sizes = T.groups.map((g) => g.teamIds.length).sort()
check('2b. Grupy po 7–8 drużyn, razem N', sizes.every((x) => x >= 7 && x <= 8) && sizes.reduce((a, b) => a + b, 0) === N, sizes.join(','))
check('2c. Każda drużyna w dokładnie jednej grupie', new Set(T.groups.flatMap((g) => g.teamIds)).size === N && T.groups.reduce((s, g) => s + g.teamIds.length, 0) === N)
// zbiory par
const pairKey = (m) => [m.teamA, m.teamB].sort().join('|')
const pairs = grpMs.map(pairKey); check('3. Każda para w grupie gra dokładnie raz', new Set(pairs).size === pairs.length)
const noSelf = grpMs.every((m) => m.teamA && m.teamB && m.teamA !== m.teamB); check('3b. Brak meczów drużyny z samą sobą / pustych', noSelf)
// kolizje
const byStart = new Map(); for (const m of ms) { if (m.skipped || m.bye) continue; (byStart.get(m.start) ?? byStart.set(m.start, []).get(m.start)).push(m) }
let teamClash = [], courtClash = []
for (const [st, list] of byStart) {
  const seen = new Set(); for (const m of list) for (const id of [m.teamA, m.teamB]) { if (!id) continue; if (seen.has(id)) teamClash.push(`${st} ${tname[id]}`); seen.add(id) }
  const cs = new Set(); for (const m of list) { if (cs.has(m.court)) courtClash.push(`${st} boisko ${m.court}`); cs.add(m.court) }
}
check('4. Żadna drużyna nie gra dwóch meczów w tym samym czasie', !teamClash.length, teamClash.slice(0, 5).join('; '))
check('4b. Brak kolizji boisk (dwa mecze: to samo boisko i czas)', !courtClash.length, courtClash.slice(0, 5).join('; '))
check('4c. Boiska tylko 1–3', ms.every((m) => m.court >= 1 && m.court <= 3), [...new Set(ms.map((m) => m.court))].join(','))
check('4d. Wszystkie mecze w godzinach 09:00–18:00', ms.every((m) => m.start.slice(11) >= '09:00' && m.start.slice(11) <= '18:00'), ms.filter((m) => m.start.slice(11) < '09:00' || m.start.slice(11) > '18:00').slice(0, 3).map((m) => m.start).join(','))
// brak meczów po sobie (odpoczynek 0 = dozwolone) -> informacyjnie
const clubsByGroup = T.groups.map((g) => { const c = {}; for (const id of g.teamIds) c[tclub[id]] = (c[tclub[id]] ?? 0) + 1; return Object.entries(c).filter(([, n]) => n > 1).map(([k, n]) => `${g.name}: ${k} x${n}`) }).flat()
check('5. Drużyny z jednego klubu rozdzielone między grupy', !clubsByGroup.length, clubsByGroup.join('; '))
// dni wolne / kolejność: bracket po grupach
const lastGroup = grpMs.map((m) => m.start).sort().at(-1); const firstKo = koMs0.map((m) => m.start).sort()[0]
check('6. Faza pucharowa zaczyna się po ostatnim meczu grupowym', firstKo > lastGroup, `ostatni grupowy ${lastGroup}, pierwszy pucharowy ${firstKo}`)
// zależności w pucharze: każdy mecz późniejszej rundy po meczach źródłowych
const koBad = []
for (const m of koMs0) for (const src of [m.ko.srcA, m.ko.srcB]) { if (src?.matchId) { const sm = koMs0.find((x) => x.id === src.matchId); if (!sm) koBad.push(`brak źródła ${src.matchId}`); else if (sm.start >= m.start) koBad.push(`${m.ko.label} (${m.start}) nie po ${sm.ko.label} (${sm.start})`) } }
check('6b. Mecze pucharowe zaplanowane po meczach, z których wynikają', !koBad.length, koBad.slice(0, 4).join('; '))
// ten sam zespół (wiadomo dopiero po awansie) -> sprawdzimy po rozegraniu
const sh = (n) => p.screenshot({ path: `${S}/${n}.png`, fullPage: true })
if (stop('structure')) { await b.close(); process.exit(0) }

// ============ wyniki ============
async function enter(m, a, b2, extra = {}) {
  await p.evaluate((h) => { location.hash = h }, `korekta-${m.id}`)
  await p.locator('#rf-0-a').waitFor({ timeout: 15000 })
  await p.locator('#rf-0-a').fill(String(a)); await p.locator('#rf-0-b').fill(String(b2))
  await p.getByRole('button', { name: /Zapisz poprawiony wynik/ }).click()
  await p.waitForTimeout(extra.wait ?? 250)
}
const score = (idA, idB, allowDraw) => {
  const d = (strength[idA] - strength[idB]) * 8
  let a = Math.max(8, Math.round(24 + d + (rand() - 0.5) * 8)); let c = Math.max(8, Math.round(24 - d + (rand() - 0.5) * 8))
  if (allowDraw && rand() < 0.22) c = a
  else if (a === c) a += 1
  return [a, c]
}
const results = new Map() // matchId -> [a,b]
const tPlay = Date.now()
const order = [...grpMs].sort((x, y) => x.start.localeCompare(y.start) || x.court - y.court)
let walkId = null
const done = new Set()
const withdrawn = []
async function withdraw(kind) {
  const cur = await matches(slug)
  const gOf = (id) => T.groups.find((g) => g.teamIds.includes(id)).name
  const stat = (id) => { const l = cur.filter((m) => m.groupId && (m.teamA === id || m.teamB === id)); return { all: l.length, played: l.filter((m) => m.status === 'finished').length } }
  const cand = T.teams.filter((x) => !withdrawn.some((w) => w.id === x.id)).map((x) => ({ x, ...stat(x.id) }))
    .filter((c) => kind === 'early' ? c.played * 2 < c.all : c.played * 2 >= c.all && c.played < c.all)
  const pick = cand.find((c) => !withdrawn.some((w) => gOf(w.id) === gOf(c.x.id))) ?? cand[0]
  if (!pick) { check(`Wycofanie (${kind}): jest drużyna do wycofania`, false); return }
  await p.evaluate(() => { location.hash = 'admin' }); await p.waitForTimeout(1200)
  await p.getByRole('button', { name: 'Drużyny i terminarz' }).first().click(); await p.waitForTimeout(500)
  const wp = p.locator('section.panel', { hasText: 'Wycofanie lub dyskwalifikacja' }); await wp.locator('select').nth(1).selectOption(pick.x.id)
  await p.screenshot({ path: `${S}/hb-wycofanie-${kind}.png`, fullPage: true })
  await wp.getByRole('button', { name: 'Wycofaj', exact: true }).click()
  await p.getByRole('button', { name: 'Tak, wycofaj' }).click(); await p.waitForTimeout(1500)
  const after = await matches(slug); const tt = await tdoc(slug)
  const team = tt.teams.find((x) => x.id === pick.x.id)
  const mine = after.filter((m) => m.groupId && (m.teamA === pick.x.id || m.teamB === pick.x.id))
  const open = mine.filter((m) => m.status !== 'finished')
  withdrawn.push({ id: pick.x.id, kind, played: pick.played, all: pick.all, name: pick.x.name })
  if (kind === 'early') check(`W1. Wycofanie drużyny (rozegrała ${pick.played}/${pick.all}, mniej niż połowa): wyniki znikają z tabel, nierozegrane mecze pominięte`, team.status === 'withdrawn' && team.voided === true && !open.length && mine.filter((m) => m.skipped).length === pick.all - pick.played, `status ${team.status}, voided ${team.voided}, otwartych ${open.length}, pominiętych ${mine.filter((m) => m.skipped).length}/${pick.all - pick.played}`)
  else {
    const walk = mine.filter((m) => m.decidedBy === 'walkover')
    check(`W2. Wycofanie drużyny (rozegrała ${pick.played}/${pick.all}, co najmniej połowa): reszta meczów jako walkowery dla rywali`, team.status === 'withdrawn' && !team.voided && !open.length && walk.length === pick.all - pick.played && walk.every((m) => (m.teamA === pick.x.id ? m.sets[0].a < m.sets[0].b : m.sets[0].b < m.sets[0].a)), `status ${team.status}, voided ${team.voided}, walkowerów ${walk.length}/${pick.all - pick.played}`)
  }
  T = tt
  for (const m of after) if (m.status === 'finished' || m.skipped) done.add(m.id)
  return pick.x
}
async function refLive(m, ptsA, ptsB) {
  await p.evaluate((h) => { location.hash = h }, `boisko-${m.court}`); await p.waitForTimeout(900)
  const startBtn = p.getByRole('button', { name: /Rozpocznij mecz i licz/ })
  await startBtn.waitFor({ timeout: 8000 })
  await startBtn.click(); await p.waitForTimeout(500)
  const plusA = p.getByRole('button', { name: `Punkt dla: ${tname[m.teamA]}` }), plusB = p.getByRole('button', { name: `Punkt dla: ${tname[m.teamB]}` })
  for (let k = 0; k < ptsA; k++) await plusA.click()
  for (let k = 0; k < ptsB; k++) await plusB.click()
  await p.waitForTimeout(400)
  await p.screenshot({ path: `${S}/hb-sedzia-live-${m.court}.png`, fullPage: true })
  await p.getByRole('button', { name: /Zakończ mecz i wyślij wynik/ }).click(); await p.waitForTimeout(900)
  const dlg = await p.locator('.confirm-box').innerText().catch(() => '')
  if (dlg) { console.log('  sędzia: okno po zakończeniu:', dlg.replace(/\n/g, ' | ').slice(0, 200)); await p.getByRole('button', { name: /Tak/ }).first().click(); await p.waitForTimeout(700) }
  results.set(m.id, [ptsA, ptsB]); done.add(m.id)
}
if (EXTRA) {
  // sędziowie na żywo: pierwszy mecz na każdym boisku (przycisk +1), potem „Podaj wynik” z kartki na boisku 2
  for (const c of [1, 2, 3]) { const m = order.find((x) => x.court === c); await refLive(m, 5 + c, 3 + c) }
  const m2 = order.filter((x) => x.court === 2).find((x) => !done.has(x.id))
  await p.evaluate((h) => { location.hash = h }, 'wynik-2'); await p.waitForTimeout(900)
  await p.locator('#rf-0-a').fill('27'); await p.locator('#rf-0-b').fill('27')
  await p.getByRole('button', { name: /Zakończ mecz i wyślij wynik/ }).click(); await p.waitForTimeout(900)
  results.set(m2.id, [27, 27]); done.add(m2.id)
  const live = await matches(slug)
  const bad2 = [...results.keys()].filter((id) => { const mm = live.find((x) => x.id === id); return !(mm.status === 'finished' && mm.sets[0].a === results.get(id)[0] && mm.sets[0].b === results.get(id)[1]) })
  check('S1. Sędzia: wyniki wpisane na żywo (+1) i „Podaj wynik” zapisane poprawnie', !bad2.length && live.find((x) => x.id === m2.id).sets[0].a === 27, bad2.join(','))
}
for (let i = 0; i < order.length; i++) {
  const m = order[i]
  if (done.has(m.id)) continue
  if (EXTRA && i === 25) await withdraw('early')
  if (EXTRA && i === 120) await withdraw('late')
  if (done.has(m.id)) continue
  if (i === 7 && !EXTRA) {
    // walkower: drużyna A wygrywa walkowerem
    await p.evaluate((h) => { location.hash = h }, `korekta-${m.id}`)
    await p.getByRole('button', { name: new RegExp(`Walkower dla: ${tname[m.teamA]}$`) }).click()
    await p.getByRole('button', { name: 'Tak, walkower' }).click(); await p.waitForTimeout(500)
    walkId = m.id; continue
  }
  if (i === 7 && EXTRA) {
    await p.evaluate((h) => { location.hash = h }, `korekta-${m.id}`)
    await p.getByRole('button', { name: new RegExp(`Walkower dla: ${tname[m.teamB]}$`) }).click()
    await p.getByRole('button', { name: 'Tak, walkower' }).click(); await p.waitForTimeout(500)
    walkId = m.id; continue
  }
  const [a, c] = score(m.teamA, m.teamB, true); results.set(m.id, [a, c])
  await enter(m, a, c)
  if (i % 40 === 0) console.log('  grupowe', i, '/', order.length, el())
}
await p.waitForTimeout(1500)
console.log('Rozegranie meczów grupowych:', ((Date.now() - tPlay) / 1000).toFixed(0), 's', el())
ms = await matches(slug); T = await tdoc(slug)
const gm = ms.filter((m) => m.groupId)
check('7. Wszystkie mecze grupowe zakończone (albo pominięte po wycofaniu)', gm.every((m) => m.status === 'finished'), `${gm.filter((m) => m.status === 'finished').length}/${gm.length}`)
let wrong = gm.filter((m) => results.has(m.id) && (m.sets?.[0]?.a !== results.get(m.id)[0] || m.sets?.[0]?.b !== results.get(m.id)[1]))
check('7b. Zapisane wyniki zgodne z wpisanymi', !wrong.length, wrong.slice(0, 3).map((m) => m.id).join(','))
const wm = gm.find((m) => m.id === walkId); const voidedIds = new Set(T.teams.filter((x) => x.voided).map((x) => x.id)); console.log('walkower:', JSON.stringify(wm && { sets: wm.sets, decidedBy: wm.decidedBy, a: tname[wm.teamA], b: tname[wm.teamB] }))
writeFileSync(`${S}/hb-state-${N}-po-grupach.json`, JSON.stringify({ T, ms }, null, 1))
if (stop('groups')) { await b.close(); process.exit(0) }

// ============ tabele: moje obliczenia kontra strona kibica (telefon 390 px) ============
const fanCtx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'pl-PL' })
const fan = await fanCtx.newPage(); hook(fan, 'kibic')
const openFan = async (h) => { await fan.goto(base + h); await fan.reload(); await fan.waitForTimeout(2200) }
const overflow = async (pg, label) => { const w = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); let wide = ''; if (w[0] > w[1] + 1) wide = ' ; szerokie elementy: ' + (await pg.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1 && e.getBoundingClientRect().width > 0).slice(0, 6).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 30)}→${Math.round(e.getBoundingClientRect().right)}`).join(', '))); check(`Telefon 390: brak przewijania poziomego (${label})`, w[0] <= w[1] + 1, `scrollWidth ${w[0]} / ${w[1]}${wide}`); return w }
function standingsOf(gid, all) {
  const g = T.groups.find((x) => x.id === gid)
  const rows = Object.fromEntries(g.teamIds.filter((id) => !voidedIds.has(id)).map((id) => [id, { id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }]))
  const fin = all.filter((m) => m.groupId === gid && m.status === 'finished' && !m.skipped && !voidedIds.has(m.teamA) && !voidedIds.has(m.teamB))
  for (const m of fin) {
    const a = rows[m.teamA], c = rows[m.teamB]; const [x, y] = [m.sets[0].a, m.sets[0].b]
    a.p++; c.p++; a.gf += x; a.ga += y; c.gf += y; c.ga += x
    if (x > y) { a.w++; c.l++; a.pts += 2 } else if (x < y) { c.w++; a.l++; c.pts += 2 } else { a.d++; c.d++; a.pts++; c.pts++ }
  }
  const list = Object.values(rows)
  for (const r of list) r.diff = r.gf - r.ga
  // Zasady piłki ręcznej w serwisie: punkty, potem mecze bezpośrednie (punkty, różnica, bramki; ponownie wśród wciąż równych), różnica, bramki, losowanie.
  const miniTable = (ids) => {
    const set = new Set(ids); const o = Object.fromEntries(ids.map((id) => [id, [0, 0, 0]]))
    for (const m of fin) { if (!set.has(m.teamA) || !set.has(m.teamB)) continue; const [x, y] = [m.sets[0].a, m.sets[0].b]
      o[m.teamA][0] += x > y ? 2 : x === y ? 1 : 0; o[m.teamB][0] += y > x ? 2 : x === y ? 1 : 0
      o[m.teamA][1] += x - y; o[m.teamB][1] += y - x; o[m.teamA][2] += x; o[m.teamB][2] += y }
    return o
  }
  const cmpArr = (a2, c2) => { for (let i = 0; i < a2.length; i++) if (a2[i] !== c2[i]) return c2[i] - a2[i]; return 0 }
  const groupBy = (arr, keyf) => { const out = []; for (const x of arr) { const k = keyf(x); const last = out.at(-1); if (last && last.k === k) last.items.push(x); else out.push({ k, items: [x] }) } return out }
  // Kryteria jak w profilu piłki ręcznej: mecze bezpośrednie (pkt, różnica, bramki) liczone wśród wciąż równych
  // (po podziale bloku liczone od nowa), potem różnica bramek, bramki; reszta: losowanie (dowolna kolejność).
  const rankBlock = (blk, i = 0) => { // lista bloków (każdy: drużyny nieodróżnialne), od najlepszego
    if (blk.length === 1) return [blk]
    if (i >= 5) return [blk]
    let valOf
    if (i < 3) { const mt = miniTable(blk.map((x) => x.id)); valOf = (x) => mt[x.id][i] } else valOf = (x) => (i === 3 ? x.diff : x.gf)
    const sorted = [...blk].sort((x, y) => valOf(y) - valOf(x))
    const parts = groupBy(sorted, (x) => valOf(x))
    if (parts.length === 1) return rankBlock(blk, i + 1)
    return parts.flatMap((pt) => rankBlock(pt.items, i < 3 ? 0 : i + 1))
  }
  list.sort((x, y) => y.pts - x.pts)
  const ordered = []; let tier = 0
  for (const blk of groupBy(list, (x) => x.pts)) for (const part of rankBlock(blk.items)) { for (const r of part) { r.tier = tier; ordered.push(r) } tier++ }
  return ordered
}
const keyOf = (r) => [r.tier]
const cmpKey = (a, c) => a[0] - c[0] > 0 ? 1 : 0
await fan.goto(base + '#grupy'); await fan.waitForTimeout(2500)
await overflow(fan, 'Grupy')
const tabCount = await fan.locator('.seg-groups button').count()
check('8. Kibic: zakładki wszystkich grup', tabCount === T.groups.length, `${tabCount}`)
let sumPts = 0; const expStand = {}
for (let gi = 0; gi < T.groups.length; gi++) {
  const g = T.groups[gi]
  await fan.locator('.seg-groups button').nth(gi).click(); await fan.waitForTimeout(400)
  const exp = standingsOf(g.id, ms); expStand[g.id] = exp
  const rows = await fan.locator('.standings li').evaluateAll((els) => els.map((li) => ({ pos: li.querySelector('.pos')?.textContent, name: li.querySelector('.name')?.textContent?.trim().replace(/\s·\s.*$/, ''), p: li.querySelectorAll('.stat')[0]?.textContent, gfga: li.querySelector('.small-pts')?.textContent, pts: li.querySelector('.pts')?.textContent })))
  if (gi === 0) await fan.screenshot({ path: `${S}/hb-10-tabela-A-telefon.png`, fullPage: true })
  const issues = []
  if (rows.length !== exp.length) issues.push(`wierszy ${rows.length}/${exp.length}`)
  const byName = Object.fromEntries(exp.map((r) => [tname[r.id], r]))
  const keys = []
  for (const r of rows) {
    const e = byName[r.name]; if (!e) { issues.push(`nieznana ${r.name}`); continue }
    if (Number(r.pts) !== e.pts) issues.push(`${r.name}: pkt ${r.pts} zamiast ${e.pts}`)
    if (Number(r.p) !== e.p) issues.push(`${r.name}: mecze ${r.p} zamiast ${e.p}`)
    if (r.gfga !== `${e.gf}:${e.ga}`) issues.push(`${r.name}: bramki ${r.gfga} zamiast ${e.gf}:${e.ga}`)
    keys.push(keyOf(e))
  }
  for (let i = 1; i < keys.length; i++) if (cmpKey(keys[i - 1], keys[i]) > 0) issues.push(`kolejność: ${rows[i - 1].name} przed ${rows[i].name}`)
  check(`9. ${g.name}: tabela (punkty 2/1/0, mecze, bramki, kolejność)`, !issues.length, issues.slice(0, 4).join('; '))
  sumPts += exp.reduce((s2, r) => s2 + r.pts, 0)
}
const countable = gm.filter((m) => m.status === 'finished' && !m.skipped && !voidedIds.has(m.teamA) && !voidedIds.has(m.teamB)).length
check('9b. Suma punktów wszystkich tabel = 2 × liczba rozegranych meczów', sumPts === 2 * countable, `${sumPts} vs ${2 * countable}`)
const wWin = EXTRA ? wm.teamB : wm.teamA
check('9c. Walkower 10:0 policzony do tabeli (wygrana = 2 pkt)', (EXTRA ? wm.sets[0].b === 10 && wm.sets[0].a === 0 : wm.sets[0].a === 10 && wm.sets[0].b === 0) && wm.decidedBy === 'walkover' && (voidedIds.has(wm.teamA) || voidedIds.has(wm.teamB) || expStand[T.groups.find((g) => g.teamIds.includes(wWin)).id].find((r) => r.id === wWin).w >= 1))
await fan.locator('.seg-groups button').first().click(); await fan.waitForTimeout(300)
const gamesTxt = await fan.locator('.cards').first().innerText()
check('9d. Lista meczów grupy widoczna z wynikami', /\d+\s*:\s*\d+/.test(gamesTxt) || /\d+\n:\n\d+/.test(gamesTxt), gamesTxt.slice(0, 60).replace(/\n/g, ' '))
await sh('hb-11-admin-po-grupach')

// ============ drabinka po grupach ============
const cust = T.tournament.custom.k1
const place = (g, pos) => { const gid = T.groups.find((x) => x.name === 'Grupa ' + g).id; return expStand[gid][pos - 1].id }
const all3 = T.groups.map((g) => expStand[g.id][2]).map((r) => ({ id: r.id, ppm: r.pts / r.p, dpm: (r.gf - r.ga) / r.p, gpm: r.gf / r.p, n: tname[r.id] }))
all3.sort((a, c) => c.ppm - a.ppm || c.dpm - a.dpm || c.gpm - a.gpm || a.n.localeCompare(c.n, 'pl'))
const expSide = (str) => { const [k, x, y] = str.split(':'); return k === 'group' ? place(x, Number(y)) : k === 'best' ? all3[Number(y) - 1].id : null }
const ko1 = ms.filter((m) => m.ko).sort((a, c) => a.ko.label.localeCompare(c.ko.label, 'pl', { numeric: true }))
const Q = 12 + BEST
const r1 = cust.filter((c) => c.name.startsWith('1/8'))
const issues = []
for (const c of r1) { const m = ms.find((x) => x.ko?.label === c.name); const ea = expSide(c.a), eb = expSide(c.b); if ((ea && m.teamA !== ea) || (eb && m.teamB !== eb)) issues.push(`${c.name}: ${tname[m.teamA]}–${tname[m.teamB]} zamiast ${tname[ea]}–${tname[eb]}`) }
check(`10. Do pierwszej rundy awansowali właściwi: po 2 z grup + ${BEST} najlepsze z 3. miejsc (jak w regulaminie strony)`, !issues.length && r1.length === Q - 8, issues.slice(0, 4).join('; '))
const r1teams = r1.flatMap((c) => { const m = ms.find((x) => x.ko?.label === c.name); return [m.teamA, m.teamB] })
check(`10b. ${2 * (Q - 8)} różnych drużyn w 1/8 finału, bez pustych miejsc`, r1teams.length === 2 * (Q - 8) && new Set(r1teams).size === r1teams.length && r1teams.every(Boolean))
const expectedQ = new Set(cust.flatMap((c) => [c.a, c.b]).map(expSide).filter(Boolean))
const inBracket = new Set(ms.filter((m) => m.ko).flatMap((m) => [m.teamA, m.teamB]).filter(Boolean))
check(`10e. Wszystkie ${Q} awansujących drużyn jest w drabince (także z wolnym losem)`, expectedQ.size === Q && [...expectedQ].every((id) => inBracket.has(id)) && inBracket.size === Q, `oczekiwano ${expectedQ.size}, w drabince ${inBracket.size}; brakuje: ${[...expectedQ].filter((id) => !inBracket.has(id)).map((id) => tname[id]).join(',')}`)
const sameGroupR1 = r1.filter((c) => { const m = ms.find((x) => x.ko?.label === c.name); const ga = T.groups.find((g) => g.teamIds.includes(m.teamA)); return ga.teamIds.includes(m.teamB) })
check('10c. W 1/8 nikt nie gra z drużyną z własnej grupy', !sameGroupR1.length, sameGroupR1.map((c) => c.name).join(','))
await openFan('#drabinka')
await overflow(fan, 'Drabinka'); await fan.screenshot({ path: `${S}/hb-12-drabinka-przed-pucharem.png`, fullPage: true })
const bracketTxt = await fan.locator('.elim').first().innerText().catch(() => '(brak .elim)')
check('10d. Drabinka na stronie kibica pokazuje drużyny 1/8 (bez „?”/pustych)', r1teams.every((id) => bracketTxt.includes(tname[id])), bracketTxt.slice(0, 80).replace(/\n/g, ' '))
if (stop('bracket')) { await b.close(); process.exit(0) }

// ============ puchar: remis w meczu pucharowym ============
const playable = async () => (await matches(slug)).filter((m) => m.ko && m.status === 'scheduled' && m.teamA && m.teamB && !m.skipped).sort((x, y) => x.start.localeCompare(y.start) || x.court - y.court)
let first = (await playable())[0]
await p.evaluate((h) => { location.hash = h }, `korekta-${first.id}`)
await p.locator('#rf-0-a').waitFor(); await p.locator('#rf-0-a').fill('20'); await p.locator('#rf-0-b').fill('20')
await p.waitForTimeout(300)
const formTxt = await p.locator('.result-form').innerText()
await p.screenshot({ path: `${S}/hb-20-remis-w-pucharze-formularz.png`, fullPage: true })
await p.getByRole('button', { name: /Zapisz poprawiony wynik/ }).click(); await p.waitForTimeout(600)
const dlg = await p.locator('.confirm-box').innerText().catch(() => '')
await p.screenshot({ path: `${S}/hb-21-remis-w-pucharze-po-zapisie.png`, fullPage: true })
console.log('Remis w pucharze, formularz:', formTxt.replace(/\n/g, ' | ').slice(0, 300))
console.log('Remis w pucharze, okno:', dlg.replace(/\n/g, ' | ').slice(0, 300))
let after = (await matches(slug)).find((m) => m.id === first.id)
console.log('Po próbie zapisu remisu:', after.status, JSON.stringify(after.sets), JSON.stringify(after.penalties ?? null))
check('11. Remis w meczu pucharowym: strona żąda rozstrzygnięcia (karne/dogrywka) albo odmawia', after.status !== 'finished' || !!after.penalties, `status ${after.status}, karne ${JSON.stringify(after.penalties ?? null)}; okno: ${dlg.replace(/\n/g, ' | ').slice(0, 160)}`)

// ============ puchar: remis + karne, potem reszta pucharu aż do finału i meczów o miejsca ============
const tKo = Date.now()
await p.getByRole('button', { name: 'Nie, poprawię' }).click().catch(() => {})
await p.locator('.rf-pens input').nth(0).fill('5'); await p.locator('.rf-pens input').nth(1).fill('4')
await p.getByRole('button', { name: /Zapisz poprawiony wynik/ }).click(); await p.waitForTimeout(700)
after = (await matches(slug)).find((m) => m.id === first.id)
check('11b. Remis 20:20 + karne 5:4 zapisany; awansuje zwycięzca karnych', after.status === 'finished' && after.penalties?.a === 5 && after.penalties?.b === 4, JSON.stringify({ s: after.status, pen: after.penalties }))
const nextOf = (await matches(slug)).filter((m) => (m.ko?.srcA?.matchId === first.id && m.ko.srcA.take === 'winner') || (m.ko?.srcB?.matchId === first.id && m.ko.srcB.take === 'winner'))
if (nextOf.length) { const nm = nextOf[0]; const slot = nm.ko.srcA?.matchId === first.id && nm.ko.srcA.take === 'winner' ? nm.teamA : nm.teamB; check('11c. Do następnej rundy trafia zwycięzca karnych (drużyna A)', slot === first.teamA, `trafił: ${tname[slot]}, powinien: ${tname[first.teamA]}`) }
const koResults = new Map([[first.id, [20, 20, 'k']]])
let rounds = 0
for (;;) {
  const list = await playable(); if (!list.length) break
  rounds++
  for (const m of list) {
    const [a, c] = score(m.teamA, m.teamB, false); koResults.set(m.id, [a, c]); await enter(m, a, c)
  }
  await p.waitForTimeout(500)
  if (rounds > 12) { check('12. Puchar kończy się (bez nieskończonej pętli)', false, 'więcej niż 12 rund'); break }
}
await p.waitForTimeout(1200)
console.log('Puchar rozegrany:', ((Date.now() - tKo) / 1000).toFixed(0), 's, rund:', rounds, el())
ms = await matches(slug)
const ko = ms.filter((m) => m.ko)
check('12. Wszystkie mecze pucharowe zakończone (do finału i meczów o miejsca)', (!FULL || ko.length === 32) && ko.length > 0 && ko.every((m) => m.status === 'finished'), `${ko.filter((m) => m.status === 'finished').length}/${ko.length}; bez drużyn: ${ko.filter((m) => !m.teamA || !m.teamB).map((m) => m.ko.label).join(',')}`)
const koTeams = ko.flatMap((m) => [m.teamA, m.teamB])
check('12b. W żadnym meczu pucharowym drużyna nie gra sama z sobą, brak pustych', ko.every((m) => m.teamA && m.teamB && m.teamA !== m.teamB))
// każda drużyna z 1/8: ile meczów w pucharze, ile razy gra o miejsca
const cnt = {}; for (const m of ko) for (const id of [m.teamA, m.teamB]) cnt[id] = (cnt[id] ?? 0) + 1
check(`12c. ${Q} drużyn w pucharze, każda gra 1–4 mecze, nikt spoza awansujących`, Object.keys(cnt).length === Q && Object.keys(cnt).every((id) => expectedQ.has(id)) && Object.values(cnt).every((n) => n >= 1 && n <= 4), JSON.stringify(Object.values(cnt).sort()))
// czasy po zmianie: ten sam zespół nie w dwóch meczach pucharowych o tej samej minucie
const clash = []; for (const id of Object.keys(cnt)) { const st = ko.filter((m) => m.teamA === id || m.teamB === id).map((m) => koMs0.find((x) => x.id === m.id).start); if (new Set(st).size !== st.length) clash.push(tname[id]) }
check('12d. Wg pierwotnego terminarza żadna drużyna nie ma dwóch meczów pucharowych w tej samej minucie', !clash.length, clash.join(','))
// miejsca
const by = (label) => ko.find((m) => m.ko.label === label)
const win = (m) => { const [x, y] = [m.sets[0].a, m.sets[0].b]; if (x !== y) return x > y ? m.teamA : m.teamB; return m.penalties.a > m.penalties.b ? m.teamA : m.teamB }
const lose = (m) => (win(m) === m.teamA ? m.teamB : m.teamA)
const placeOf = {}
const tryPlace = (label, pw, pl) => { const m = by(label); if (!m) { bugs.push({ n: `brak meczu ${label}` }); return }; placeOf[pw] = win(m); placeOf[pl] = lose(m) }
tryPlace('Finał', 1, 2); tryPlace('O 3. miejsce', 3, 4); tryPlace('O 5. miejsce', 5, 6); tryPlace('O 7. miejsce', 7, 8)
tryPlace('O 9. miejsce', 9, 10); tryPlace('O 11. miejsce', 11, 12); tryPlace('O 13. miejsce', 13, 14); tryPlace('O 15. miejsce', 15, 16)
const places = Object.keys(placeOf).map(Number).sort((x, y) => x - y)
check('13. Klasyfikacja z pucharu: miejsca 1–16 bez dziur i powtórzeń', !FULL || places.length === 16 && places.every((x, i) => x === i + 1) && new Set(Object.values(placeOf)).size === 16, places.join(','))
await openFan('#drabinka')
await overflow(fan, 'Drabinka po pucharze'); await fan.screenshot({ path: `${S}/hb-30-drabinka-koniec-telefon.png`, fullPage: true })
const placesTxt = await fan.locator('.elim-places').innerText().catch(() => '')
const shown = [...placesTxt.matchAll(/(🏆|🥈|🥉|(\d+)\.)\s+([^\n🏆🥈🥉]+?)(?=\s*(?:🏆|🥈|🥉|\d+\.\s)|\s*$)/g)].map((x) => ({ pl: x[1] === '🏆' ? 1 : x[1] === '🥈' ? 2 : x[1] === '🥉' ? 3 : Number(x[2]), n: x[3].trim() }))
const dispIssues = !FULL ? [] : Object.entries(placeOf).filter(([pl, id]) => !shown.find((x) => x.pl === Number(pl) && x.n === tname[id])).map(([pl, id]) => `${pl}: ${tname[id]}`)
const shownPl = shown.map((x) => x.pl).sort((x, y) => x - y)
check(`13a. Strona kibica: miejsca 1–${Q} bez dziur i powtórzeń, różne drużyny`, shownPl.length === Q && shownPl.every((x, i) => x === i + 1) && new Set(shown.map((x) => x.n)).size === Q && shown.every((x) => Object.values(tname).includes(x.n)), `${shownPl.join(',')}`)
check('13b. Strona kibica pokazuje te same miejsca co mecze o miejsca', !dispIssues.length && shown.length >= Q, `${shown.length} pokazanych; ${dispIssues.slice(0, 4).join('; ')}; tekst: ${placesTxt.replace(/\n/g, ' | ').slice(0, 120)}`)
const gt = await fan.locator('body').innerText()
check('13c. Klasyfikacja końcowa obejmuje wszystkie 46 miejsc (też drużyny, które nie weszły do pucharu)', /klasyfikacj/i.test(gt) && shown.length >= N, `pokazano miejsc: ${shown.length} z ${N}`)

// ============ korekta wyniku po zakończeniu fazy grupowej i pucharu ============
const gA = T.groups.find((g) => !g.teamIds.some((id) => T.teams.find((x) => x.id === id)?.status)) ?? T.groups[0]; const stA = expStand[gA.id]
const pair = ms.find((m) => m.groupId === gA.id && m.status === 'finished' && !m.skipped && [m.teamA, m.teamB].includes(stA[0].id) && [m.teamA, m.teamB].includes(stA[1].id))
await p.evaluate((h) => { location.hash = h }, `korekta-${pair.id}`)
await p.locator('#rf-0-a').waitFor()
const lockTxt = await p.locator('.ref-card').innerText()
await p.screenshot({ path: `${S}/hb-40-korekta-po-fazie.png`, fullPage: true })
check('14. Korekta po zakończeniu fazy: brak przycisku „Cofnij wynik”, jest wyjaśnienie blokady', !/Cofnij wynik/.test(lockTxt) && /nie można cofnąć ani usunąć/.test(lockTxt), lockTxt.slice(lockTxt.indexOf('Następna') >= 0 ? lockTxt.indexOf('Następna') : 0, 160).replace(/\n/g, ' '))
check('14b. Przy korekcie wyniku grupowego jest ostrzeżenie, że puchar już rozegrano i drabinka się nie zmieni', /Uwaga: z tego meczu grano już dalej/.test(lockTxt), 'ostrzeżenie ' + (/Uwaga/.test(lockTxt) ? 'jest' : 'BRAK: na ekranie tylko: ' + lockTxt.replace(/\n/g, ' | ').slice(0, 260)))
// odwróć wynik (wygrywa wcześniej przegrany z dużą różnicą)
const [oa, ob] = [pair.sets[0].a, pair.sets[0].b]
const koBefore = Object.fromEntries(ms.filter((m) => m.ko).map((m) => [m.id, m.teamA + '|' + m.teamB]))
const stBefore = stA.map((r) => r.id)
await p.locator('#rf-0-a').fill(String(Math.min(ob, oa) + 0)); await p.locator('#rf-0-b').fill(String(Math.max(oa, ob) + 15))
const swap = oa > ob // jeśli A wygrywał, teraz wygrywa B
if (!swap) { await p.locator('#rf-0-a').fill(String(Math.max(oa, ob) + 15)); await p.locator('#rf-0-b').fill(String(Math.min(ob, oa))) }
await p.getByRole('button', { name: /Zapisz poprawiony wynik/ }).click(); await p.waitForTimeout(1500)
const afterM = await matches(slug); const pm2 = afterM.find((m) => m.id === pair.id)
check('14c. Poprawiony wynik zapisany', pm2.status === 'finished' && (pm2.sets[0].a !== oa || pm2.sets[0].b !== ob), JSON.stringify(pm2.sets))
const koAfter = Object.fromEntries(afterM.filter((m) => m.ko).map((m) => [m.id, m.teamA + '|' + m.teamB]))
const changedKo = Object.keys(koAfter).filter((k) => koAfter[k] !== koBefore[k])
check('14d. Rozegrane mecze pucharowe nie zmieniają drużyn po korekcie (zapowiedziane w ostrzeżeniu)', !changedKo.length, changedKo.join(','))
const newStA = standingsOf(gA.id, afterM).map((r) => r.id)
console.log('Grupa A po korekcie: kolejność zmieniła się:', JSON.stringify(newStA) !== JSON.stringify(stBefore))
// tabela kibica odświeżona po korekcie
await openFan('#grupy'); await fan.locator('.seg-groups button').first().click(); await fan.waitForTimeout(500)
const rowsA = await fan.locator('.standings li .name').allInnerTexts()
const ptsA = await fan.locator('.standings li .pts').allInnerTexts(); const expPtsA = standingsOf(gA.id, afterM).map((r) => r.pts)
check('14e. Tabela grupy A u kibica przeliczona po korekcie (punkty zgodne)', JSON.stringify(ptsA.map(Number)) === JSON.stringify(expPtsA), rowsA.slice(0, 3).join(',') + ' / oczekiwano ' + newStA.slice(0, 3).map((id) => tname[id]).join(','))
ms = afterM

// ============ strona kibica: terminarz, wyniki, wyszukiwanie, Moje drużyny, telefon 390 px ============
const visible = ms.filter((m) => !m.skipped)
const tLoad = Date.now(); await openFan('#terminarz'); const tTerm = Date.now() - tLoad
await overflow(fan, 'Terminarz'); await fan.screenshot({ path: `${S}/hb-50-terminarz-telefon.png`, fullPage: false })
const cards = await fan.locator('ul.matches > li').count()
check('15. Terminarz kibica: wszystkie mecze (grupy + puchar) na liście', cards === visible.length, `${cards} kart vs ${visible.length} meczów; wczytanie ${tTerm} ms`)
const dom = await fan.evaluate(() => document.querySelectorAll('*').length)
console.log('Terminarz: węzłów DOM', dom, ', czas ładowania strony', tTerm, 'ms')
const probe = T.teams.find((x) => !x.status) ?? T.teams[0]; const probeCnt = visible.filter((m) => m.teamA === probe.id || m.teamB === probe.id).length
await fan.locator('#team-search').fill(probe.name); await fan.waitForTimeout(500)
const found = await fan.locator('ul.matches > li').count()
check(`16. Wyszukanie drużyny „${probe.name}” w terminarzu: jej mecze`, found === probeCnt || found >= probeCnt, `${found} kart, mecze drużyny ${probeCnt} (szukanie po fragmencie nazwy może łapać „${probe.name}0–9”)`)
await fan.locator('#team-search').fill('Zzzz nieistniejąca'); await fan.waitForTimeout(300)
check('16b. Wyszukanie nieistniejącej drużyny: komunikat „Nic nie znaleziono”', /Nic nie znaleziono/.test(await fan.locator('body').innerText()))
await openFan('#wyniki'); await overflow(fan, 'Wyniki')
const resRows = await fan.locator('table.results tbody tr').count()
check('17. Zakładka „Wyniki”: wszystkie zakończone mecze', resRows === visible.filter((m) => m.status === 'finished').length, `${resRows} wierszy vs ${visible.filter((m) => m.status === 'finished').length}`)
await fan.locator('#results-search').fill(probe.name); await fan.waitForTimeout(400)
check('17b. Wyniki: wyszukiwanie drużyny zawęża listę', (await fan.locator('table.results tbody tr').count()) < resRows)
await fan.screenshot({ path: `${S}/hb-51-wyniki-telefon.png` })
// strona drużyny + obserwowanie
await openFan(`#druzyna-${probe.id}`); await overflow(fan, 'Strona drużyny')
const teamCards = await fan.locator('.team-page .mcard, .team-page ul.matches > li').count()
check('18. Strona drużyny: komplet jej meczów', teamCards === probeCnt, `${teamCards} vs ${probeCnt}`)
await fan.locator('button.follow').first().click(); await fan.waitForTimeout(400)
await openFan('')
const home = await fan.locator('body').innerText()
check('19. „Moje drużyny”: obserwowana drużyna widoczna na starcie po przeładowaniu', home.includes(probe.name) && /Moje drużyny/.test(home), home.slice(home.indexOf('Moje'), 200).replace(/\n/g, ' | '))
await overflow(fan, 'Start'); await fan.screenshot({ path: `${S}/hb-52-moje-druzyny-telefon.png`, fullPage: true })
await openFan('#na-zywo'); await overflow(fan, 'Na żywo')
await openFan(`#mecz-${visible.find((m) => m.ko).id}`); await overflow(fan, 'Strona meczu')
// pasek wyboru drużyny (Znajdź swoją drużynę)
await openFan('#grupy')
await fan.locator('select[id^=team-picker]').selectOption(probe.id); await fan.waitForTimeout(800)
check('20. „Znajdź swoją drużynę” otwiera stronę drużyny', /druzyna-/.test(fan.url()), fan.url().split('#')[1])

// ============ Excel ============
await p.setViewportSize({ width: 1200, height: 900 })
await p.goto(base + '#panel-grupy'); await p.reload(); await p.waitForTimeout(2500)
const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 15000 }), p.locator('.export-btn', { hasText: 'Excela' }).click()])
const xl = `${S}/hb-wyniki-${N}.xlsx`; await dl.saveAs(xl)
const { execSync } = await import('child_process')
const py = (code) => execSync(`python3 -c "${code}"`, { encoding: 'utf8' })
const info = JSON.parse(py(`import zipfile,json,re;z=zipfile.ZipFile('${xl}');wb=z.read('xl/workbook.xml').decode();names=re.findall(r'<sheet name=\\"([^\\"]+)\\"',wb);out={'names':names};
for i,n in enumerate(names,1):
  x=z.read('xl/worksheets/sheet%d.xml'%i).decode();out[n]=[len(re.findall(r'<row ',x)),('NaN' in x) or ('undefined' in x)]
print(json.dumps(out))`))
console.log('Excel:', JSON.stringify(info), dl.suggestedFilename())
const mrow = info[info.names.find((n) => /mecz/i.test(n))]?.[0]
check('21. Excel: arkusz meczów ma wszystkie mecze (+ nagłówek)', mrow === visible.length + 1, `${mrow} wierszy vs ${visible.length + 1}; arkusze: ${info.names.join(', ')}`)
check('21b. Excel: brak „NaN”/„undefined” w arkuszach', info.names.every((n) => !info[n][1]))
const strings = py(`import zipfile;z=zipfile.ZipFile('${xl}');print(' '.join(z.read(n).decode() for n in z.namelist() if n.startswith('xl/') and n.endswith('.xml')))`)
check('21c. Excel: zawiera nazwy drużyn i wynik finału', T.teams.slice(0, 5).every((x) => strings.includes(x.name)) && strings.includes(tname[placeOf[1]]))
check('21d. Excel: klasyfikacja końcowa zawiera wszystkie drużyny (46 miejsc) albo sensowny arkusz klasyfikacji', info.names.some((n) => /klasyf|miejsc/i.test(n)), info.names.join(', '))

// ============ wydruk ============
await p.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++ } })
await p.locator('.print-btn').click(); await p.waitForTimeout(300)
check('22. Przycisk „Drukuj / PDF” wywołuje wydruk', (await p.evaluate(() => window.__printed)) === 1)
await p.emulateMedia({ media: 'print' })
const pdfFile = `${S}/hb-wydruk-${N}.pdf`
await p.pdf({ path: pdfFile, format: 'A4', printBackground: true })
const printW = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth])
const pdfTxt = execSync(`python3 -c "import re;d=open('${pdfFile}','rb').read();print(len(re.findall(rb'/Type\\\\s*/Page[^s]',d)))"`, { encoding: 'utf8' }).trim()
console.log('Wydruk: stron PDF', pdfTxt, 'scrollWidth', printW)
const navHidden = await p.locator('.org-head .tabs').evaluate((e) => getComputedStyle(e).display).catch(() => '?')
check('22b. Wydruk: PDF ma strony, treść nie wychodzi poza stronę', Number(pdfTxt) >= 1 && printW[0] <= printW[1] + 2, `${pdfTxt} stron, szerokość ${printW[0]}/${printW[1]}; pasek zakładek w druku: ${navHidden}`)
await p.screenshot({ path: `${S}/hb-60-wydruk.png` })
await p.emulateMedia({ media: 'screen' })

// ============ panel i sędzia na telefonie 390 px ============
await p.setViewportSize({ width: 390, height: 844 })
for (const h of ['#panel', '#panel-grupy', '#panel-sedziowie', '#sedzia', '#boisko-1', '#wynik-2', '#kolejka-1']) {
  await p.goto(base + h); await p.reload(); await p.waitForTimeout(1800)
  await overflow(p, 'admin ' + h)
}
await p.screenshot({ path: `${S}/hb-61-kolejka-telefon.png` })

// ============ błędy konsoli i strony ============
const realErrs = errs.filter(Boolean)
check('23. Brak błędów strony (pageerror)', !realErrs.length, realErrs.slice(0, 3).join(' | '))
const consoleErrs = [...new Set(cons)].filter((x) => !/favicon|Failed to load resource|ERR_CERT/.test(x))
check('23b. Brak błędów w konsoli przeglądarki', !consoleErrs.length, consoleErrs.slice(0, 4).join(' | '))
console.log(`Czas całego testu: ${el()}`)
console.log(`WYNIK: ${res.filter(Boolean).length}/${res.length}`)
writeFileSync(`${S}/hb-wynik-${N}.json`, JSON.stringify({ N, slug, bugs, ok: res.filter(Boolean).length, total: res.length, seconds: (Date.now() - t0) / 1000 }, null, 1))
await b.close()
