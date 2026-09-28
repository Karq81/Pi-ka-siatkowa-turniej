import { t, tk } from '../i18n'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { IS_ALBATROS, TOURNAMENT_ID, tournamentUrl } from '../config'
import { addTournamentToAccount, updateTournamentPin } from '../store/accounts'
import { initialState, restoreTimetable } from '../logic/demo'
import { blankState, readDraft, replanTimetable } from '../logic/newTournament'
import { resetResults } from '../logic/draw'
import { setsText, tally, TIEBREAK_NAMES, tiebreakOrder } from '../logic/scoring'
import { playOf } from '../logic/sports'
import { store, useStore, useSync } from '../store/store'
import { courtKeys } from '../logic/pins'
import type { Match, MatchStatus, Pins, Rules, SetScore, State, Tiebreak } from '../types'
import { NumberField, BackBar, courtLabel, formatDay, formatTime, PinGate, useLookups } from '../ui'
import { CourtCard, MatchList } from './Public'
import { ResultForm } from './ResultForm'

const TABS = [
  { id: 'boiska', label: tk('Boiska') },
  { id: 'wynik', label: tk('Podaj wynik') },
  { id: 'mecze', label: tk('Mecze i poprawki') },
  { id: 'klucze', label: tk('Klucze boisk') },
  { id: 'dane', label: tk('Drużyny i terminarz') },
  { id: 'ustawienia', label: tk('Ustawienia') },
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
          <h1>{t('Pierwsze uruchomienie')}</h1>
        </header>
        <FirstSetup />
      </div>
    )
  }
  return (
    <div className="page">
      <BackBar fallback="panel" />
      <header className="bar">
        <h1>{t('Sędzia główny')}</h1>
      </header>
      <PinGate label={t('Panel sędziego głównego')}>
        <nav className="tabs tabs-admin" aria-label={t('Panel')}>
          {TABS.map((x) => (
            <button key={x.id} className={tab === x.id ? 'active' : ''} onClick={() => setTab(x.id)}>{t(x.label)}</button>
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
        <span><b>{live}</b> {t('na żywo')}</span>
        <span><b>{done}</b> / {state.matches.length} {t('zakończonych')}</span>
        <span>{t('Drużyny:')} <b>{state.teams.length}</b></span>
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
    .filter((m) => !query || `${side(m, 'a')} ${side(m, 'b')} ${t('boisko')} ${courtLabel(m.court)}`.toLowerCase().includes(query))
    .sort((a, b) => a.start.localeCompare(b.start) || a.court - b.court)
  const current = editing ? state.matches.find((m) => m.id === editing) : undefined

  if (current) return <MatchEditor state={state} match={current} onClose={() => setEditing(null)} />

  return (
    <>
      <div className="filters">
        <input id="admin-search" type="search" placeholder={t('Szukaj drużyny lub boiska')} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="chips">
          {([['live', tk('Na żywo')], ['scheduled', tk('Zaplanowane')], ['finished', tk('Zakończone')], ['all', tk('Wszystkie')]] as const).map(([id, label]) => (
            <button key={id} className={`chip ${filter === id ? 'active' : ''}`} onClick={() => setFilter(id)}>{t(label)}</button>
          ))}
        </div>
      </div>
      <p className="muted small">{t('Kliknij mecz, żeby wpisać lub poprawić wynik.')}</p>
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
      <button className="back" onClick={onClose}>{t('← Lista meczów')}</button>
      <h2>{side(match, 'a')} – {side(match, 'b')}</h2>
      <p className="muted">{t('Boisko {n}', { n: courtLabel(match.court) })} · {formatDay(match.start)} {formatTime(match.start)}</p>
      <ResultForm state={state} match={match} submitLabel={t('Zapisz jako zakończony')} onSubmit={(sets) => save('finished', sets)}>
        <button type="button" className="btn" onClick={() => save('live', match.status === 'live' ? match.sets : [])}>{t('Oznacz jako trwający')}</button>
        <button type="button" className="btn btn-danger" onClick={() => save('scheduled')}>{t('Wyczyść wynik')}</button>
      </ResultForm>
      <p className="muted small">
        {t('„Oznacz jako trwający”: na stronie pojawi się „Mecz trwa, wynik po meczu”. Przydaje się na boiskach, gdzie nikt nie liczy punktów na telefonie.')}
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
    !query || `${side(m, 'a')} ${side(m, 'b')} ${t('boisko')} ${courtLabel(m.court)} b${courtLabel(m.court)}`.toLowerCase().includes(query))
  const match = current ? state.matches.find((m) => m.id === current) : undefined

  if (match) {
    return (
      <section className="editor">
        <button className="back" onClick={() => setCurrent(null)}>{t('← Wybierz inny mecz')}</button>
        <h2>{side(match, 'a')} – {side(match, 'b')}</h2>
        <p className="muted">{t('Boisko {n}', { n: courtLabel(match.court) })} · {formatTime(match.start)} · {categoryName(match.categoryId)} · {stageName(match)}</p>
        <ResultForm
          key={match.id}
          state={state}
          match={match}
          submitLabel={t('Zapisz i następny mecz')}
          onSubmit={(sets) => {
            store.updateMatch(match.id, (m) => ({ ...m, status: 'finished', sets }))
            const score = sets.map((x) => `${x.a}:${x.b}`).join(', ')
            setSaved(`${t('Zapisano:')} ${side(match, 'a')} – ${side(match, 'b')} (${score})`)
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
          placeholder={t('Wpisz drużynę albo numer boiska, Enter wybiera pierwszy mecz')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && list[0]) setCurrent(list[0].id) }}
        />
      </div>
      {saved && <p className="ok">{saved}</p>}
      <p className="muted small">{t('Mecze czekające na wynik: {n}. Kliknij mecz, wpisz sety z kartki i zapisz.', { n: waiting.length })}</p>
      <MatchList state={state} matches={list.slice(0, 30)} onPick={(m) => setCurrent(m.id)} />
    </>
  )
}


function Data({ state }: { state: State }) {
  const [msg, setMsg] = useState('')
  const csv = exportCsv(state)

  return (
    <div className="data">
      <ResetPanel state={state} />

      <section className="panel">
        <h2>{t('Eksport do Excela')}</h2>
        <p className="muted">{t('Wszystkie mecze z wynikami w pliku CSV, który otwiera się w Excelu.')}</p>
        <div className="actions">
          <button className="btn" onClick={() => download(`${t('wyniki')}.csv`, csv)}>{t('Pobierz CSV')}</button>
          <button className="btn" onClick={() => navigator.clipboard?.writeText(csv).then(() => setMsg(t('Skopiowano wyniki do schowka.')), () => setMsg(t('Nie udało się skopiować.')))}>{t('Kopiuj do schowka')}</button>
        </div>
        {msg && <p className="ok">{msg}</p>}
      </section>

    </div>
  )
}

function exportCsv(state: State): string {
  const team = new Map(state.teams.map((t) => [t.id, t.name]))
  const cat = new Map(state.categories.map((c) => [c.id, c.name]))
  const grp = new Map(state.groups.map((g) => [g.id, g.name]))
  const rows = [[t('Data'), t('Godzina'), t('Boisko'), t('Kategoria'), t('Grupa'), t('Drużyna A'), t('Drużyna B'), t('Sety A'), t('Sety B'), t('Wyniki setów'), t('Status')]]
  const statusName = { scheduled: t('zaplanowany'), live: t('trwa'), finished: t('zakończony') }
  for (const m of [...state.matches].sort((a, b) => a.start.localeCompare(b.start) || a.court - b.court)) {
    const score = tally(state.tournament.rules, m.sets)
    rows.push([
      m.start.slice(0, 10), formatTime(m.start), courtLabel(m.court), cat.get(m.categoryId) ?? '', grp.get(m.groupId) ?? '',
      team.get(m.teamA) ?? '', team.get(m.teamB) ?? '',
      m.status === 'scheduled' ? '' : String(score.setsA), m.status === 'scheduled' ? '' : String(score.setsB),
      setsText(state.tournament.rules, m.sets), statusName[m.status],
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
  const tour = state.tournament
  const r = tour.rules
  const update = (patch: Partial<State['tournament']>) => store.updateTournament(patch)
  const rules = (patch: Partial<typeof r>) => update({ rules: { ...r, ...patch } })
  return (
    <div className="data">
      <section className="panel">
        <h2>{t('Turniej')}</h2>
        <div className="form-grid">
          <label>{t('Nazwa')}<input id="set-name" value={tour.name} onChange={(e) => update({ name: e.target.value })} /></label>
          <label>{t('Podtytuł')}<input id="set-subtitle" value={tour.subtitle} onChange={(e) => update({ subtitle: e.target.value })} /></label>
          <label>{t('Liczba boisk')}<NumberField lazy id="set-courts" min={1} max={40} value={tour.courts} onChange={(v) => update({ courts: v })} /></label>
        </div>
      </section>
      {/* Changing the admin PIN is switched off while the organisers test the app, so nobody locks the others out. */}
      {ALLOW_PIN_CHANGE && <PinSettings />}
      <section className="panel">
        <h2>{t('Zasady meczu')}</h2>
        <div className="form-grid">
          {r.scoring === 'judo' || r.scoring === 'karate' ? (
            <label>{t('Czas walki (minuty)')}
              <NumberField lazy decimals id="set-fight" min={0.5} max={10} value={(r.fightSeconds ?? 240) / 60}
                onChange={(v) => rules({ fightSeconds: Math.round(v * 60) })} />
            </label>
          ) : r.scoring === 'score' ? (<>
            {playOf(r) && (
              <label>{t('Czas gry: części × minuty')}
                <span className="form-inline">
                  <NumberField lazy min={1} max={8} value={playOf(r)!.periods} onChange={(v) => rules({ periods: v })} ariaLabel={t('Liczba części gry')} />
                  ×
                  <NumberField lazy decimals min={1} max={90} value={playOf(r)!.periodMinutes} onChange={(v) => rules({ periodMinutes: v })} ariaLabel={t('Minuty jednej części')} />
                  {t('min')}
                </span>
                <span className="muted small">{t('Dla zegara sędziego. Domyślnie zasady dla seniorów; w turniejach dzieci zwykle krócej.')}</span>
              </label>
            )}
            <label>{t('Remis możliwy')}
              <select id="set-draws" value={r.draws ? 'tak' : 'nie'} onChange={(e) => rules({ draws: e.target.value === 'tak' })}>
                <option value="tak">{t('Tak')}</option>
                <option value="nie">{t('Nie (dogrywka / karne)')}</option>
              </select>
            </label>
          </>) : (<>
          <label>{t('System setów')}
            <select id="set-mode" value={r.setsMode} onChange={(e) => rules({ setsMode: e.target.value as typeof r.setsMode })}>
              <option value="bestOf">{t('Do wygranych setów (np. 2 z 3)')}</option>
              <option value="fixed">{t('Stała liczba setów (możliwy remis)')}</option>
            </select>
          </label>
          <label>{t('Liczba setów')}<NumberField lazy id="set-sets" min={1} max={9} value={r.sets} onChange={(v) => rules({ sets: v })} /></label>
          <label>{t('Set do (pkt)')}<NumberField lazy id="set-points" min={1} max={999} value={r.setPoints} onChange={(v) => rules({ setPoints: v })} /></label>
          <label>{t('Decydujący set do (pkt)')}<NumberField lazy id="set-tiebreak" min={1} max={999} value={r.lastSetPoints} disabled={r.setsMode === 'fixed'} onChange={(v) => rules({ lastSetPoints: v })} /></label>
          <label>{t('Przewaga do wygrania seta')}<NumberField lazy id="set-winby" min={1} max={9} value={r.winBy} onChange={(v) => rules({ winBy: v })} /></label>
          </>)}
          <label>{t('Pkt w tabeli za wygraną')}<NumberField lazy decimals id="set-pwin" min={0} max={99} value={r.pointsWin} onChange={(v) => rules({ pointsWin: v })} /></label>
          <label>{t('Pkt za remis')}<NumberField lazy decimals id="set-pdraw" min={0} max={99} value={r.pointsDraw} onChange={(v) => rules({ pointsDraw: v })} /></label>
          <label>{t('Pkt za przegraną')}<NumberField lazy decimals id="set-ploss" min={0} max={99} value={r.pointsLoss} onChange={(v) => rules({ pointsLoss: v })} /></label>
        </div>
        <TiebreakEditor rules={r} onChange={(tiebreak) => rules({ tiebreak })} />
        <p className="muted small">{t('Zasady do potwierdzenia z organizatorem. Zmiana od razu przelicza wszystkie tabele.')}</p>
      </section>
    </div>
  )
}

/** Order of the tie-breakers after table points: move up and down, add or take away. */
function TiebreakEditor({ rules, onChange }: { rules: Rules; onChange: (order: Tiebreak[]) => void }) {
  const order = tiebreakOrder(rules)
  const unused = (Object.keys(TIEBREAK_NAMES) as Tiebreak[]).filter((k) => !order.includes(k))
  const move = (i: number, d: -1 | 1) => {
    const next = [...order]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    onChange(next)
  }
  return (
    <div className="tiebreak-edit">
      <b>{t('Przy równej liczbie punktów decyduje kolejno:')}</b>
      <ol>
        {order.map((k, i) => (
          <li key={k}>
            <span>{t(TIEBREAK_NAMES[k])}</span>
            <span className="tb-actions">
              <button type="button" className="btn btn-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('Wyżej')}>↑</button>
              <button type="button" className="btn btn-sm" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label={t('Niżej')}>↓</button>
              <button type="button" className="btn btn-sm" disabled={order.length === 1} onClick={() => onChange(order.filter((x) => x !== k))} aria-label={t('Usuń')}>✕</button>
            </span>
          </li>
        ))}
      </ol>
      {unused.length > 0 && (
        <label className="tb-add">{t('Dodaj kryterium')}
          <select value="" onChange={(e) => e.target.value && onChange([...order, e.target.value as Tiebreak])}>
            <option value="">—</option>
            {unused.map((k) => <option key={k} value={k}>{t(TIEBREAK_NAMES[k])}</option>)}
          </select>
        </label>
      )}
      <p className="muted small">{t('Na końcu, gdy wszystko jest równe: kolejność alfabetyczna (albo losowanie przez organizatora).')}</p>
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
        setMsg(t('Zapisuję…'))
        try {
          await onSave(pin)
          setMsg(t('Zapisano.'))
        } catch {
          setMsg(t('Nie udało się zapisać. Sprawdź internet.'))
        }
      }}
    >
      <label>{t('PIN sędziego głównego (co najmniej 4 cyfry)')}
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

/**
 * Changing the chief referee's PIN. Court keys stay. The organiser's account keeps the new
 * PIN, so opening the tournament from "Moje turnieje" still logs in.
 */
export function PinSettings() {
  return (
    <section className="panel">
      <h2>{t('PIN sędziego głównego (panel organizatora)')}</h2>
      <p className="muted">
        {t('Otwiera ten panel i wszystkie boiska. Po zmianie stary PIN przestaje działać na wszystkich telefonach. Klucze sędziów boisk się nie zmieniają. To nie jest hasło do konta.')}
      </p>
      <AdminPinForm
        saveLabel={t('Zmień PIN')}
        onSave={async (adminPin) => {
          const pins = await store.getPins()
          if (!pins) throw new Error('no pins')
          const courts = courtKeys(store.get().tournament.courts, { adminPin, courts: pins.courts })
          await store.setPins({ adminPin, courts })
          await updateTournamentPin(TOURNAMENT_ID, adminPin).catch(() => {})
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
  const pins = { adminPin, courts: courtKeys(Math.max(10, store.get().tournament.courts), { adminPin, courts: {} }) }
  try {
    await store.setPins(pins)
  } catch (e) {
    // Keys already set by an interrupted earlier setup: continue if the admin PIN matches.
    if (!(await store.login(adminPin))) throw e
  }
  // Albatros CUP: its fixed groups and timetable; a new tournament: its settings, no teams yet.
  // (Built from the draft again: the empty database has meanwhile replaced the draft's matches.)
  const draft = IS_ALBATROS ? null : readDraft(TOURNAMENT_ID)
  await store.replace(IS_ALBATROS ? initialState() : draft ? blankState(draft) : store.get())
  // A signed-in organiser keeps the tournament (and its PIN) on their account.
  await addTournamentToAccount({ id: TOURNAMENT_ID, name: store.get().tournament.name, pin: adminPin }).catch(() => {})
}

/** Shown once, when the online database has no tournament yet. */
function FirstSetup() {
  return (
    <section className="panel">
      <h2>{t('Ustaw PIN i utwórz turniej')}</h2>
      <p className="muted">
        {t('Baza jest pusta. Ustaw PIN sędziego głównego. Klucze dla każdego boiska wygenerują się same, znajdziesz je w zakładce „Klucze boisk”. Potem w panelu organizatora rozlosujesz zespoły do grup.')}
      </p>
      <AdminPinForm
        saveLabel={t('Utwórz turniej')}
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
  const base = tournamentUrl()

  if (!loaded) return <p className="muted">{t('Wczytuję klucze…')}</p>
  if (!pins) return <p className="error">{t('Nie udało się wczytać kluczy. Sprawdź internet i zaloguj się ponownie PIN-em.')}</p>
  return (
    <div className="data">
      <section className="panel">
        <h2>{t('Klucze boisk')}</h2>
        <p className="muted">
          {t('Każde boisko ma swój klucz. Podaj go osobie, która liczy punkty na tym boisku. Z kluczem do boiska 3 można prowadzić tylko mecze na boisku 3. Zakończonego meczu nie zmieni nikt poza Tobą.')}
        </p>
        <div className="actions">
          <a className="btn btn-primary" href="#kartki">{t('Kartki z kodami QR do wydruku')}</a>
          {missing && <button className="btn" onClick={() => save([])}>{t('Wygeneruj brakujące klucze')}</button>}
        </div>
      </section>
      <ul className="keys">
        {Array.from({ length: count }, (_, i) => i + 1).map((c) => (
          <li key={c}>
            <span className="keys-court">{t('Boisko {n}', { n: courtLabel(c) })}</span>
            <span className="keys-key">{pins.courts[String(c)] ?? '—'}</span>
            <span className="keys-link muted small">{base}#boisko-{c}</span>
            {renewing === c ? (
              <span className="actions">
                <button className="btn btn-danger" onClick={() => save([c])}>{t('Tak, nowy klucz')}</button>
                <button className="btn" onClick={() => setRenewing(null)}>{t('Anuluj')}</button>
              </span>
            ) : (
              <button className="btn" onClick={() => setRenewing(c)}>{t('Nowy klucz')}</button>
            )}
          </li>
        ))}
      </ul>
      <p className="muted small">{t('„Nowy klucz” wylogowuje telefon, który używał starego klucza do tego boiska.')}</p>
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
        <h1>{t('Kartki dla boisk')}</h1>
      </header>
      <PinGate label={t('Kartki z kluczami')}>
        <Cards count={state.tournament.courts} name={state.tournament.name} />
      </PinGate>
    </div>
  )
}

function Cards({ count, name }: { count: number; name: string }) {
  const [pins, setPins] = useState<Pins | null>(null)
  const [qr, setQr] = useState<Record<number, string>>({})
  const base = tournamentUrl()
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
        <button className="btn btn-primary" onClick={() => window.print()}>{t('Drukuj')}</button>
        <p className="muted small">{t('Wytnij kartki i przyklej przy boiskach. Klucz możesz też zakleić i podać tylko sędziemu.')}</p>
      </div>
      <div className="cards">
        {Array.from({ length: count }, (_, i) => i + 1).map((c) => (
          <article key={c} className="card">
            <p className="card-title">{name}</p>
            <h2>{t('Boisko {n}', { n: courtLabel(c) })}</h2>
            <div className="card-qr" dangerouslySetInnerHTML={{ __html: qr[c] ?? '' }} />
            <p>{t('Zeskanuj telefonem, żeby liczyć punkty')}</p>
            <p className="card-key">{t('Klucz:')} <b>{pins?.courts[String(c)] ?? '····'}</b></p>
          </article>
        ))}
      </div>
    </>
  )
}

/**
 * Admin: clear all results. Groups are fixed (the organiser's list), so there is no
 * redraw here.
 */
export function ResetPanel({ state }: { state: State }) {
  const [confirm, setConfirm] = useState(false)
  const [msg, setMsg] = useState('')
  const played = state.matches.filter((m) => m.status !== 'scheduled').length
  const reset = async () => {
    setConfirm(false)
    const cleared = resetResults(state)
    await store.replace(IS_ALBATROS ? restoreTimetable(cleared) : replanTimetable(cleared))
    setMsg(t('Wyzerowano wszystkie wyniki i przywrócono godziny z terminarza.'))
  }
  return (
    <section className="panel">
      <h2>{t('Grupy i wyniki')}</h2>
      <p className="muted">
        {IS_ALBATROS
          ? t('Grupy są ustalone według listy organizatora (dwójki: 4 grupy po 7, trójki: 5 grup po 6), bez losowania. Tu możesz wyzerować wszystkie wyniki, np. po meczach próbnych. Godziny meczów wrócą do terminarza (piątek od 15:30, sobota od 9:30).')
          : t('Tu możesz wyzerować wszystkie wyniki, np. po meczach próbnych. Grupy zostają, a godziny meczów wrócą do terminarza.')}
      </p>
      {confirm ? (
        <div className="notice">
          <p>{t('Wyzerować wszystkie wyniki (meczów: {n}) i przywrócić godziny z terminarza? Grupy zostaną.', { n: played })}</p>
          <div className="actions">
            <button className="btn btn-danger" onClick={reset}>{t('Tak, wyzeruj')}</button>
            <button className="btn" onClick={() => setConfirm(false)}>{t('Anuluj')}</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-danger" disabled={!played} onClick={() => setConfirm(true)}>{t('Wyzeruj wszystkie wyniki')}</button>
      )}
      {msg && <p className="ok">{msg}</p>}
    </section>
  )
}

