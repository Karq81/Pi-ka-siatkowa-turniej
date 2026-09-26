import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { DEFAULT_SCHEDULE, initialState } from '../logic/demo'
import { clubOf, drawTournament, resetResults } from '../logic/draw'
import { buildGroupSchedule } from '../logic/schedule'
import { tally } from '../logic/scoring'
import { store, useStore, useSync } from '../store/store'
import { parseTeams } from '../logic/importTeams'
import { bracketPlan, createKnockout, hasKnockout, openGroupMatches } from '../logic/knockout'
import { courtKeys } from '../logic/pins'
import type { Match, MatchStatus, Pins, SetScore, State } from '../types'
import { BackBar, formatDay, formatTime, PinGate, useLookups } from '../ui'
import { CourtCard, MatchList } from './Public'
import { ResultForm } from './ResultForm'

const TABS = [
  { id: 'boiska', label: 'Boiska' },
  { id: 'wynik', label: 'Podaj wynik' },
  { id: 'mecze', label: 'Mecze i poprawki' },
  { id: 'klucze', label: 'Klucze boisk' },
  { id: 'dane', label: 'Drużyny i terminarz' },
  { id: 'ustawienia', label: 'Ustawienia' },
]

export function Admin() {
  const state = useStore()
  const sync = useSync()
  const [tab, setTab] = useState('boiska')
  if (sync.empty) {
    return (
      <div className="page">
        <BackBar fallback="panel" />
        <header className="bar">
          <h1>Pierwsze uruchomienie</h1>
        </header>
        <FirstSetup />
      </div>
    )
  }
  return (
    <div className="page">
      <BackBar fallback="panel" />
      <header className="bar">
        <h1>Sędzia główny</h1>
      </header>
      <PinGate label="Panel sędziego głównego">
        <nav className="tabs tabs-admin" aria-label="Panel">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </nav>
        {tab === 'boiska' && <Courts state={state} />}
        {tab === 'wynik' && <QuickResults state={state} />}
        {tab === 'mecze' && <Matches state={state} />}
        {tab === 'klucze' && <CourtKeys state={state} />}
        {tab === 'dane' && <Data state={state} />}
        {tab === 'ustawienia' && <Settings state={state} />}
      </PinGate>
    </div>
  )
}

function Courts({ state }: { state: State }) {
  const live = state.matches.filter((m) => m.status === 'live').length
  const done = state.matches.filter((m) => m.status === 'finished').length
  return (
    <>
      <div className="stats">
        <span><b>{live}</b> na żywo</span>
        <span><b>{done}</b> / {state.matches.length} zakończonych</span>
        <span><b>{state.teams.length}</b> drużyn</span>
      </div>
      <section className="courts">
        {Array.from({ length: state.tournament.courts }, (_, i) => (
          <CourtCard key={i} state={state} court={i + 1} referee />
        ))}
      </section>
    </>
  )
}

function Matches({ state }: { state: State }) {
  const { side } = useLookups(state)
  const [filter, setFilter] = useState<MatchStatus | 'all'>('live')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const query = q.trim().toLowerCase()
  const list = state.matches
    .filter((m) => filter === 'all' || m.status === filter)
    .filter((m) => !query || `${side(m, 'a')} ${side(m, 'b')} boisko ${m.court}`.toLowerCase().includes(query))
    .sort((a, b) => a.start.localeCompare(b.start) || a.court - b.court)
  const current = editing ? state.matches.find((m) => m.id === editing) : undefined

  if (current) return <MatchEditor state={state} match={current} onClose={() => setEditing(null)} />

  return (
    <>
      <div className="filters">
        <input id="admin-search" type="search" placeholder="Szukaj drużyny lub boiska" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="chips">
          {([['live', 'Na żywo'], ['scheduled', 'Zaplanowane'], ['finished', 'Zakończone'], ['all', 'Wszystkie']] as const).map(([id, label]) => (
            <button key={id} className={`chip ${filter === id ? 'active' : ''}`} onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>
      </div>
      <p className="muted small">Kliknij mecz, żeby wpisać lub poprawić wynik.</p>
      <MatchList state={state} matches={list} onPick={(m) => setEditing(m.id)} />
    </>
  )
}

function MatchEditor({ state, match, onClose }: { state: State; match: Match; onClose: () => void }) {
  const { side } = useLookups(state)
  const save = (status: MatchStatus, sets: SetScore[] = []) => {
    store.updateMatch(match.id, (m) => ({ ...m, status, sets }))
    onClose()
  }
  return (
    <section className="editor">
      <button className="back" onClick={onClose}>← Lista meczów</button>
      <h2>{side(match, 'a')} – {side(match, 'b')}</h2>
      <p className="muted">Boisko {match.court} · {formatDay(match.start)} {formatTime(match.start)}</p>
      <ResultForm state={state} match={match} submitLabel="Zapisz jako zakończony" onSubmit={(sets) => save('finished', sets)}>
        <button type="button" className="btn" onClick={() => save('live', match.status === 'live' ? match.sets : [])}>Oznacz jako trwający</button>
        <button type="button" className="btn btn-danger" onClick={() => save('scheduled')}>Wyczyść wynik</button>
      </ResultForm>
      <p className="muted small">
        „Oznacz jako trwający”: na stronie pojawi się „Mecz trwa, wynik po meczu”. Przydaje się na boiskach,
        gdzie nikt nie liczy punktów na telefonie.
      </p>
    </section>
  )
}

/** Fast entry of results from score sheets: pick a match, type the sets, save, next. */
function QuickResults({ state }: { state: State }) {
  const { side, categoryName, stageName } = useLookups(state)
  const [q, setQ] = useState('')
  const [current, setCurrent] = useState<string | null>(null)
  const [saved, setSaved] = useState('')
  const query = q.trim().toLowerCase()
  // Waiting for a result: live first, then scheduled, in time order.
  const waiting = state.matches
    .filter((m) => m.status !== 'finished' && m.teamA && m.teamB)
    .sort((a, b) => (a.status === 'live' ? 0 : 1) - (b.status === 'live' ? 0 : 1) || a.start.localeCompare(b.start) || a.court - b.court)
  const list = waiting.filter((m) =>
    !query || `${side(m, 'a')} ${side(m, 'b')} boisko ${m.court} b${m.court}`.toLowerCase().includes(query))
  const match = current ? state.matches.find((m) => m.id === current) : undefined

  if (match) {
    return (
      <section className="editor">
        <button className="back" onClick={() => setCurrent(null)}>← Wybierz inny mecz</button>
        <h2>{side(match, 'a')} – {side(match, 'b')}</h2>
        <p className="muted">Boisko {match.court} · {formatTime(match.start)} · {categoryName(match.categoryId)} · {stageName(match)}</p>
        <ResultForm
          key={match.id}
          state={state}
          match={match}
          submitLabel="Zapisz i następny mecz"
          onSubmit={(sets) => {
            store.updateMatch(match.id, (m) => ({ ...m, status: 'finished', sets }))
            const t = sets.map((x) => `${x.a}:${x.b}`).join(', ')
            setSaved(`Zapisano: ${side(match, 'a')} – ${side(match, 'b')} (${t})`)
            const next = list.filter((m) => m.id !== match.id)[0]
            setCurrent(next?.id ?? null)
          }}
        />
        {saved && <p className="ok">{saved}</p>}
      </section>
    )
  }

  return (
    <>
      <div className="filters">
        <input
          id="quick-search"
          type="search"
          autoFocus
          placeholder="Wpisz drużynę albo numer boiska, Enter wybiera pierwszy mecz"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && list[0]) setCurrent(list[0].id) }}
        />
      </div>
      {saved && <p className="ok">{saved}</p>}
      <p className="muted small">Mecze czekające na wynik: {waiting.length}. Kliknij mecz, wpisz sety z kartki i zapisz.</p>
      <MatchList state={state} matches={list.slice(0, 30)} onPick={(m) => setCurrent(m.id)} />
    </>
  )
}

const SAMPLE_CSV = `Drużyna;Kategoria;Grupa
UKS Orlik Kraków;Dwójki;A
MKS Iskra Tarnów;Dwójki;A
UKS Sokół Bochnia;Dwójki;A
SP 5 Wieliczka;Dwójki;A
UKS Tęcza Skawina;Dwójki;B
UKS Grom Myślenice;Dwójki;B
UKS Żak Brzesko;Dwójki;B
UKS Delfin Niepołomice;Dwójki;B`

function Data({ state }: { state: State }) {
  // Starts with the current teams, so the organiser can edit the list rather than type it again.
  const [text, setText] = useState(() => currentTeamsCsv(state) || SAMPLE_CSV)
  const [start, setStart] = useState('2026-10-23T09:00')
  const [slot, setSlot] = useState(25)
  const [dayEnd, setDayEnd] = useState('18:00')
  const [confirm, setConfirm] = useState<'import' | 'demo' | null>(null)
  const [msg, setMsg] = useState('')
  const parsed = parseTeams(text)
  const csv = exportCsv(state)

  const doImport = () => {
    const matches = buildGroupSchedule(parsed.groups, { courts: state.tournament.courts, start, slotMinutes: slot, dayEnd })
    setConfirm(null)
    setMsg('Zapisuję…')
    store.replace({ ...state, ...parsed, matches }).then(() =>
      setMsg(`Wczytano ${parsed.teams.length} drużyn i ułożono ${matches.length} meczów.`))
  }

  return (
    <div className="data">
      <DrawPanel state={state} />

      <section className="panel">
        <h2>Wczytaj drużyny z Excela</h2>
        <p className="muted">
          Skopiuj z Excela trzy kolumny: <b>Drużyna</b>, <b>Kategoria</b>, <b>Grupa</b> i wklej poniżej.
          Terminarz grup ułoży się sam na {state.tournament.courts} boiskach.
        </p>
        <textarea id="import-text" rows={8} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="form-row">
          <label>Start pierwszego meczu<input id="import-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label>Mecz + przerwa (min)<input id="import-slot" type="number" min={5} value={slot} onChange={(e) => setSlot(Number(e.target.value) || 25)} /></label>
          <label>Ostatni mecz dnia najpóźniej o<input id="import-end" type="time" value={dayEnd} onChange={(e) => setDayEnd(e.target.value)} /></label>
        </div>
        <p className="muted small">
          Rozpoznano: {parsed.teams.length} drużyn, {parsed.categories.length} kategorii, {parsed.groups.length} grup.
        </p>
        {confirm === 'import' ? (
          <div className="notice">
            <p>To zastąpi obecne drużyny, mecze i wyniki. Na pewno?</p>
            <div className="actions">
              <button className="btn btn-danger" onClick={doImport}>Tak, wczytaj</button>
              <button className="btn" onClick={() => setConfirm(null)}>Anuluj</button>
            </div>
          </div>
        ) : (
          <button className="btn btn-primary" disabled={!parsed.teams.length} onClick={() => setConfirm('import')}>Wczytaj i ułóż terminarz</button>
        )}
        {msg && <p className="ok">{msg}</p>}
      </section>

      <KnockoutPanel state={state} />

      <section className="panel">
        <h2>Eksport do Excela</h2>
        <p className="muted">Wszystkie mecze z wynikami w pliku CSV, który otwiera się w Excelu.</p>
        <div className="actions">
          <button className="btn" onClick={() => download('wyniki.csv', csv)}>Pobierz CSV</button>
          <button className="btn" onClick={() => navigator.clipboard?.writeText(csv).then(() => setMsg('Skopiowano wyniki do schowka.'), () => setMsg('Nie udało się skopiować.'))}>Kopiuj do schowka</button>
        </div>
      </section>

    </div>
  )
}

function exportCsv(state: State): string {
  const team = new Map(state.teams.map((t) => [t.id, t.name]))
  const cat = new Map(state.categories.map((c) => [c.id, c.name]))
  const grp = new Map(state.groups.map((g) => [g.id, g.name]))
  const rows = [['Data', 'Godzina', 'Boisko', 'Kategoria', 'Grupa', 'Drużyna A', 'Drużyna B', 'Sety A', 'Sety B', 'Wyniki setów', 'Status']]
  const statusName = { scheduled: 'zaplanowany', live: 'trwa', finished: 'zakończony' }
  for (const m of [...state.matches].sort((a, b) => a.start.localeCompare(b.start) || a.court - b.court)) {
    const t = tally(state.tournament.rules, m.sets)
    rows.push([
      m.start.slice(0, 10), formatTime(m.start), String(m.court), cat.get(m.categoryId) ?? '', grp.get(m.groupId) ?? '',
      team.get(m.teamA) ?? '', team.get(m.teamB) ?? '',
      m.status === 'scheduled' ? '' : String(t.setsA), m.status === 'scheduled' ? '' : String(t.setsB),
      m.sets.map((s) => `${s.a}:${s.b}`).join(' '), statusName[m.status],
    ])
  }
  return rows.map((r) => r.map((c) => (/[;"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(';')).join('\n')
}

function download(name: string, content: string) {
  // BOM so Excel reads Polish characters correctly.
  const url = URL.createObjectURL(new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function Settings({ state }: { state: State }) {
  const t = state.tournament
  const r = t.rules
  const update = (patch: Partial<State['tournament']>) => store.updateTournament(patch)
  const rules = (patch: Partial<typeof r>) => update({ rules: { ...r, ...patch } })
  const num = (v: string, min = 0) => Math.max(min, Number(v) || 0)
  return (
    <div className="data">
      <section className="panel">
        <h2>Turniej</h2>
        <div className="form-grid">
          <label>Nazwa<input id="set-name" value={t.name} onChange={(e) => update({ name: e.target.value })} /></label>
          <label>Podtytuł<input id="set-subtitle" value={t.subtitle} onChange={(e) => update({ subtitle: e.target.value })} /></label>
          <label>Liczba boisk<input id="set-courts" type="number" min={1} value={t.courts} onChange={(e) => update({ courts: num(e.target.value, 1) })} /></label>
        </div>
      </section>
      {/* Changing the admin PIN is switched off while the organisers test the app, so nobody locks the others out. */}
      {ALLOW_PIN_CHANGE && <PinSettings />}
      <section className="panel">
        <h2>Zasady meczu</h2>
        <div className="form-grid">
          <label>System setów
            <select id="set-mode" value={r.setsMode} onChange={(e) => rules({ setsMode: e.target.value as typeof r.setsMode })}>
              <option value="bestOf">Do wygranych setów (np. 2 z 3)</option>
              <option value="fixed">Stała liczba setów (możliwy remis)</option>
            </select>
          </label>
          <label>Liczba setów<input id="set-sets" type="number" min={1} value={r.sets} onChange={(e) => rules({ sets: num(e.target.value, 1) })} /></label>
          <label>Set do (pkt)<input id="set-points" type="number" min={1} value={r.setPoints} onChange={(e) => rules({ setPoints: num(e.target.value, 1) })} /></label>
          <label>Decydujący set do (pkt)<input id="set-tiebreak" type="number" min={1} value={r.lastSetPoints} disabled={r.setsMode === 'fixed'} onChange={(e) => rules({ lastSetPoints: num(e.target.value, 1) })} /></label>
          <label>Przewaga do wygrania seta<input id="set-winby" type="number" min={1} value={r.winBy} onChange={(e) => rules({ winBy: num(e.target.value, 1) })} /></label>
          <label>Pkt w tabeli za wygraną<input id="set-pwin" type="number" value={r.pointsWin} onChange={(e) => rules({ pointsWin: num(e.target.value) })} /></label>
          <label>Pkt za remis<input id="set-pdraw" type="number" value={r.pointsDraw} onChange={(e) => rules({ pointsDraw: num(e.target.value) })} /></label>
          <label>Pkt za przegraną<input id="set-ploss" type="number" value={r.pointsLoss} onChange={(e) => rules({ pointsLoss: num(e.target.value) })} /></label>
        </div>
        <p className="muted small">Zasady do potwierdzenia z organizatorem. Zmiana od razu przelicza wszystkie tabele.</p>
      </section>
    </div>
  )
}

export function AdminPinForm({ onSave, saveLabel }: { onSave: (pin: string) => Promise<void>; saveLabel: string }) {
  const [pin, setPin] = useState('')
  const [msg, setMsg] = useState('')
  const valid = /^\d{4,}$/.test(pin)
  return (
    <form
      className="data"
      onSubmit={async (e) => {
        e.preventDefault()
        setMsg('Zapisuję…')
        try {
          await onSave(pin)
          setMsg('Zapisano.')
        } catch {
          setMsg('Nie udało się zapisać. Sprawdź internet.')
        }
      }}
    >
      <label>PIN sędziego głównego (co najmniej 4 cyfry)
        <input id="pin-admin" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value)} />
      </label>
      <div className="actions">
        <button className="btn btn-primary" type="submit" disabled={!valid}>{saveLabel}</button>
      </div>
      {msg && <p className="muted">{msg}</p>}
    </form>
  )
}

const ALLOW_PIN_CHANGE = false

function PinSettings() {
  return (
    <section className="panel">
      <h2>PIN sędziego głównego</h2>
      <p className="muted">Otwiera ten panel i wszystkie boiska. Klucze boisk są w zakładce „Klucze boisk”.</p>
      <AdminPinForm
        saveLabel="Zmień PIN"
        onSave={async (adminPin) => {
          const pins = await store.getPins()
          if (!pins) throw new Error('no pins')
          const courts = courtKeys(store.get().tournament.courts, { adminPin, courts: pins.courts })
          await store.setPins({ adminPin, courts })
        }}
      />
    </section>
  )
}

/**
 * First setup of an empty online database: sets the admin PIN, generates the court
 * keys and saves the qualified teams (not drawn yet).
 */
export async function setupTournament(adminPin: string) {
  const pins = { adminPin, courts: courtKeys(10, { adminPin, courts: {} }) }
  try {
    await store.setPins(pins)
  } catch (e) {
    // Keys already set by an interrupted earlier setup: continue if the admin PIN matches.
    if (!(await store.login(adminPin))) throw e
  }
  await store.replace(initialState())
}

/** Shown once, when the online database has no tournament yet. */
function FirstSetup() {
  return (
    <section className="panel">
      <h2>Ustaw PIN i utwórz turniej</h2>
      <p className="muted">
        Baza jest pusta. Ustaw PIN sędziego głównego. Klucze dla każdego boiska wygenerują się same, znajdziesz je
        w zakładce „Klucze boisk”. Potem w panelu organizatora rozlosujesz zespoły do grup.
      </p>
      <AdminPinForm
        saveLabel="Utwórz turniej"
        onSave={async (adminPin) => {
          await setupTournament(adminPin)
          location.hash = 'panel'
        }}
      />
    </section>
  )
}

/** Admin: one key per court, to hand to the person scoring at that court. */
function CourtKeys({ state }: { state: State }) {
  const [pins, setPins] = useState<Pins | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [renewing, setRenewing] = useState<number | null>(null)
  useEffect(() => {
    store.getPins().then((p) => { setPins(p); setLoaded(true) })
  }, [])
  const count = state.tournament.courts
  const missing = !!pins && Array.from({ length: count }, (_, i) => i + 1).some((c) => !pins.courts[String(c)])
  const save = async (renew: number[]) => {
    if (!pins) return
    const next = { adminPin: pins.adminPin, courts: courtKeys(count, pins, renew) }
    await store.setPins(next)
    setPins(next)
    setRenewing(null)
  }
  const base = `${location.origin}${location.pathname}`

  if (!loaded) return <p className="muted">Wczytuję klucze…</p>
  if (!pins) return <p className="error">Nie udało się wczytać kluczy. Sprawdź internet i zaloguj się ponownie PIN-em.</p>
  return (
    <div className="data">
      <section className="panel">
        <h2>Klucze boisk</h2>
        <p className="muted">
          Każde boisko ma swój klucz. Podaj go osobie, która liczy punkty na tym boisku. Z kluczem do boiska 3 można
          prowadzić tylko mecze na boisku 3. Zakończonego meczu nie zmieni nikt poza Tobą.
        </p>
        <div className="actions">
          <a className="btn btn-primary" href="#kartki">Kartki z kodami QR do wydruku</a>
          {missing && <button className="btn" onClick={() => save([])}>Wygeneruj brakujące klucze</button>}
        </div>
      </section>
      <ul className="keys">
        {Array.from({ length: count }, (_, i) => i + 1).map((c) => (
          <li key={c}>
            <span className="keys-court">Boisko {c}</span>
            <span className="keys-key">{pins.courts[String(c)] ?? '—'}</span>
            <span className="keys-link muted small">{base}#boisko-{c}</span>
            {renewing === c ? (
              <span className="actions">
                <button className="btn btn-danger" onClick={() => save([c])}>Tak, nowy klucz</button>
                <button className="btn" onClick={() => setRenewing(null)}>Anuluj</button>
              </span>
            ) : (
              <button className="btn" onClick={() => setRenewing(c)}>Nowy klucz</button>
            )}
          </li>
        ))}
      </ul>
      <p className="muted small">„Nowy klucz” wylogowuje telefon, który używał starego klucza do tego boiska.</p>
    </div>
  )
}

/** Printable cards: one per court, with a QR code to the court panel and its key. */
export function PrintCards() {
  const state = useStore()
  return (
    <div className="page">
      <BackBar fallback="panel-wiecej" />
      <header className="bar no-print">
        <h1>Kartki dla boisk</h1>
      </header>
      <PinGate label="Kartki z kluczami">
        <Cards count={state.tournament.courts} name={state.tournament.name} />
      </PinGate>
    </div>
  )
}

function Cards({ count, name }: { count: number; name: string }) {
  const [pins, setPins] = useState<Pins | null>(null)
  const [qr, setQr] = useState<Record<number, string>>({})
  const base = `${location.origin}${location.pathname}`
  useEffect(() => {
    store.getPins().then(setPins)
    Promise.all(
      Array.from({ length: count }, (_, i) => i + 1).map(async (c) =>
        [c, await QRCode.toString(`${base}#boisko-${c}`, { type: 'svg', margin: 0 })] as const),
    ).then((list) => setQr(Object.fromEntries(list)))
  }, [count, base])
  return (
    <>
      <div className="actions no-print">
        <button className="btn btn-primary" onClick={() => window.print()}>Drukuj</button>
        <p className="muted small">Wytnij kartki i przyklej przy boiskach. Klucz możesz też zakleić i podać tylko sędziemu.</p>
      </div>
      <div className="cards">
        {Array.from({ length: count }, (_, i) => i + 1).map((c) => (
          <article key={c} className="card">
            <p className="card-title">{name}</p>
            <h2>Boisko {c}</h2>
            <div className="card-qr" dangerouslySetInnerHTML={{ __html: qr[c] ?? '' }} />
            <p>Zeskanuj telefonem, żeby liczyć punkty</p>
            <p className="card-key">Klucz: <b>{pins?.courts[String(c)] ?? '····'}</b></p>
          </article>
        ))}
      </div>
    </>
  )
}

function KnockoutPanel({ state }: { state: State }) {
  const [cat, setCat] = useState(state.categories[0]?.id ?? '')
  const lastGroupMatch = state.matches.filter((m) => !m.ko && m.categoryId === cat).map((m) => m.start).sort().at(-1)
  const [start, setStart] = useState(lastGroupMatch ?? '2026-10-25T12:00')
  const [slot, setSlot] = useState(30)
  const [firstCourt, setFirstCourt] = useState(1)
  const [confirm, setConfirm] = useState(false)
  const [msg, setMsg] = useState('')
  const groups = state.groups.filter((g) => g.categoryId === cat)
  const supported = !!bracketPlan(cat, groups)
  const open = openGroupMatches(state, cat)
  const exists = hasKnockout(state, cat)
  // All courts from the chosen one up: the classification has many matches per round.
  const courts = Array.from({ length: state.tournament.courts - firstCourt + 1 }, (_, i) => firstCourt + i)

  const create = async () => {
    const ko = createKnockout(state, cat, { start, slotMinutes: slot, courts })
    const matches = [...state.matches.filter((m) => !(m.ko && m.categoryId === cat)), ...ko]
    setConfirm(false)
    setMsg('Zapisuję…')
    await store.replace({ ...state, matches })
    setMsg(`Utworzono drabinkę: ${ko.length} meczów. Zobacz zakładkę „Drabinka” na stronie wyników.`)
  }

  return (
    <section className="panel">
      <h2>Faza pucharowa (drabinka)</h2>
      <p className="muted">
        Pełna klasyfikacja: każda drużyna gra o konkretne miejsce. Przy 4 grupach miejsca 1–2 grają o 1–8
        (1A–2B, 1C–2D, 1B–2A, 1D–2C), 3–4 o 9–16, 5–6 o 17–24, a 7. miejsca o 25–28.
        2 grupy: od razu półfinały. Kolejne rundy uzupełniają się same po każdym wyniku.
      </p>
      <div className="chips">
        {state.categories.map((c) => (
          <button key={c.id} className={`chip ${cat === c.id ? 'active' : ''}`} onClick={() => { setCat(c.id); setConfirm(false); setMsg('') }}>{c.name}</button>
        ))}
      </div>
      {!supported && <p className="error">Drabinka jest przygotowana dla 1, 2 lub 4 grup w kategorii. Ta kategoria ma {groups.length}.</p>}
      {supported && (
        <>
          <div className="form-row">
            <label>Start pierwszej rundy<input id="ko-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <label>Mecz + przerwa (min)<input id="ko-slot" type="number" min={5} value={slot} onChange={(e) => setSlot(Number(e.target.value) || 30)} /></label>
            <label>Boiska od numeru<input id="ko-court" type="number" min={1} max={state.tournament.courts} value={firstCourt} onChange={(e) => setFirstCourt(Math.max(1, Number(e.target.value) || 1))} /></label>
          </div>
          <p className="muted small">
            Mecze na boiskach {courts.join(', ')}.
            {open > 0 ? ` Uwaga: ${open} meczów grupowych jeszcze się nie skończyło. Pary będą się aktualizować, dopóki mecz drabinki się nie zacznie.` : ' Wszystkie mecze grupowe zakończone.'}
          </p>
          {confirm ? (
            <div className="notice">
              <p>{exists ? 'Drabinka tej kategorii już istnieje. Utworzenie nowej usunie jej mecze i wyniki.' : 'Utworzyć drabinkę?'}</p>
              <div className="actions">
                <button className="btn btn-primary" onClick={create}>Tak, utwórz</button>
                <button className="btn" onClick={() => setConfirm(false)}>Anuluj</button>
              </div>
            </div>
          ) : (
            <button className="btn btn-primary" onClick={() => setConfirm(true)}>{exists ? 'Utwórz drabinkę od nowa' : 'Utwórz drabinkę'}</button>
          )}
        </>
      )}
      {msg && <p className="ok">{msg}</p>}
    </section>
  )
}

/** Admin: redraw the groups (clubs kept apart) with a new schedule, or clear all results. */
function DrawPanel({ state }: { state: State }) {
  const firstStart = state.matches.map((m) => m.start).sort()[0]
  const [counts, setCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(state.categories.map((c) => [c.id, state.groups.filter((g) => g.categoryId === c.id).length || 4])))
  const [start, setStart] = useState(firstStart ?? DEFAULT_SCHEDULE.start)
  const [slot, setSlot] = useState(DEFAULT_SCHEDULE.slotMinutes)
  const [dayStart, setDayStart] = useState(DEFAULT_SCHEDULE.dayStart)
  const [dayEnd, setDayEnd] = useState(DEFAULT_SCHEDULE.dayEnd)
  const [confirm, setConfirm] = useState<'draw' | 'reset' | null>(null)
  const [msg, setMsg] = useState('')
  const played = state.matches.filter((m) => m.status !== 'scheduled').length

  const draw = async () => {
    setConfirm(null)
    setMsg('Losuję…')
    const next = drawTournament(state, {
      groups: counts,
      schedule: { courts: state.tournament.courts, start, slotMinutes: slot, dayStart, dayEnd },
    })
    await store.replace(next)
    setMsg(`Rozlosowano ${next.groups.length} grup i ułożono ${next.matches.length} meczów. Zobacz zakładkę „Grupy” na stronie.`)
  }
  const reset = async () => {
    setConfirm(null)
    await store.replace(resetResults(state))
    setMsg('Wyzerowano wszystkie wyniki. Grupy i terminarz zostały bez zmian.')
  }

  return (
    <section className="panel">
      <h2>Losowanie grup</h2>
      <p className="muted">
        Losuje zespoły do grup od nowa i układa terminarz. Zasada: drużyny z tego samego klubu nigdy nie trafiają
        do jednej grupy. Grupy wychodzą równe (różnica najwyżej 1 zespół).
      </p>
      <div className="form-row">
        {state.categories.map((c) => {
          const teams = state.teams.filter((t) => t.categoryId === c.id)
          const maxPerClub = Math.max(0, ...[...new Set(teams.map(clubOf))].map((cl) => teams.filter((t) => clubOf(t) === cl).length))
          return (
            <label key={c.id}>{c.name}: liczba grup ({teams.length} zespołów)
              <input
                id={`draw-${c.id}`}
                type="number"
                min={Math.max(1, maxPerClub)}
                max={teams.length}
                value={counts[c.id] ?? 4}
                onChange={(e) => setCounts((x) => ({ ...x, [c.id]: Math.max(1, Number(e.target.value) || 1) }))}
              />
            </label>
          )
        })}
      </div>
      <div className="form-row">
        <label>Pierwszy mecz<input id="draw-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label>Mecz + przerwa (min)<input id="draw-slot" type="number" min={5} value={slot} onChange={(e) => setSlot(Number(e.target.value) || 20)} /></label>
        <label>Kolejne dni od<input id="draw-daystart" type="time" value={dayStart} onChange={(e) => setDayStart(e.target.value)} /></label>
        <label>Ostatni mecz dnia najpóźniej<input id="draw-dayend" type="time" value={dayEnd} onChange={(e) => setDayEnd(e.target.value)} /></label>
      </div>
      <p className="muted small">Drabinka (1, 2 lub 4 grupy) tworzy się osobno, w panelu „Faza pucharowa” poniżej.</p>
      {confirm === 'draw' ? (
        <div className="notice">
          <p>{played ? `Uwaga: ${played} meczów ma już wynik. Nowe losowanie usunie wszystkie wyniki i drabinkę.` : 'Rozlosować grupy od nowa?'}</p>
          <div className="actions">
            <button className="btn btn-primary" onClick={draw}>Tak, losuj</button>
            <button className="btn" onClick={() => setConfirm(null)}>Anuluj</button>
          </div>
        </div>
      ) : confirm === 'reset' ? (
        <div className="notice">
          <p>Wyzerować wszystkie wyniki ({played} meczów)? Grupy i terminarz zostaną.</p>
          <div className="actions">
            <button className="btn btn-danger" onClick={reset}>Tak, wyzeruj</button>
            <button className="btn" onClick={() => setConfirm(null)}>Anuluj</button>
          </div>
        </div>
      ) : (
        <div className="actions">
          <button className="btn btn-primary" onClick={() => setConfirm('draw')}>Losuj grupy i ułóż terminarz</button>
          <button className="btn btn-danger" disabled={!played} onClick={() => setConfirm('reset')}>Wyzeruj wszystkie wyniki</button>
        </div>
      )}
      {msg && <p className="ok">{msg}</p>}
    </section>
  )
}

function currentTeamsCsv(state: State): string {
  const cat = new Map(state.categories.map((c) => [c.id, c.name]))
  const grp = new Map(state.groups.flatMap((g) => g.teamIds.map((id) => [id, g.name.replace(/^Grupa\s*/, '')] as const)))
  const rows = state.teams.map((t) => `${t.name};${cat.get(t.categoryId) ?? ''};${grp.get(t.id) ?? ''}`)
  return rows.length ? ['Drużyna;Kategoria;Grupa', ...rows].join('\n') : ''
}
