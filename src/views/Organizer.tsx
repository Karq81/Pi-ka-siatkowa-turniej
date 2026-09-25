import { useState } from 'react'
import { DEFAULT_SCHEDULE, GROUPS_DEFAULT } from '../logic/demo'
import { clubOf, drawCategory, isDrawn } from '../logic/draw'
import { store, useSession, useStore, useSync } from '../store/store'
import { AdminPinForm, setupTournament } from './Admin'
import type { Category, State } from '../types'
import { PinGate, useLookups } from '../ui'
import { CourtList } from './Court'
import { Groups } from './Groups'

const TABS = [
  { route: 'panel', label: '1. Zespoły i losowanie' },
  { route: 'panel-grupy', label: '2. Grupy' },
  { route: 'panel-sedziowie', label: '3. Sędziowanie' },
  { route: 'panel-wiecej', label: 'Więcej' },
]

/**
 * Organiser panel (#panel). Not linked from the public pages. Leads through the
 * preparation: teams → draw → groups → refereeing; drawing needs the admin PIN.
 */
export function Organizer({ route }: { route: string }) {
  const state = useStore()
  const tab = TABS.some((t) => t.route === route) ? route : 'panel'
  return (
    <div className="page">
      <header className="org-head">
        <div>
          <p className="eyebrow">Panel organizatora</p>
          <h1>{state.tournament.name}</h1>
        </div>
        <nav className="tabs" aria-label="Panel organizatora">
          {TABS.map((t) => (
            <a key={t.route} href={`#${t.route}`} className={tab === t.route ? 'active' : ''}>{t.label}</a>
          ))}
        </nav>
      </header>
      {tab === 'panel' && <TeamsAndDraw state={state} />}
      {tab === 'panel-grupy' && (
        state.groups.length ? <Groups state={state} /> : <Empty />
      )}
      {tab === 'panel-sedziowie' && <CourtList />}
      {tab === 'panel-wiecej' && <More />}
    </div>
  )
}

function Empty() {
  return (
    <p className="notice-inline">
      Grupy nie są jeszcze rozlosowane. Zrób to w zakładce <a href="#panel">1. Zespoły i losowanie</a>.
    </p>
  )
}

/** Step 1: every team by category and club, then one draw button per category. */
function TeamsAndDraw({ state }: { state: State }) {
  const sync = useSync()
  const allDrawn = state.categories.length > 0 && state.categories.every((c) => isDrawn(state, c.id))
  return (
    <>
      <div className="org-intro">
        <p className="muted">
          Zgłoszone zespoły z listy zakwalifikowanych. Pod listą losujesz grupy, osobno dla dwójek i trójek.
          Zasada losowania: drużyny z tego samego klubu nigdy nie trafiają do jednej grupy.
        </p>
        {/* Scrolls instead of a #link: the hash is the page route. */}
        <button className="btn btn-primary" onClick={() => document.getElementById('losowanie')?.scrollIntoView({ behavior: 'smooth' })}>
          {allDrawn ? 'Grupy rozlosowane ↓' : 'Przejdź do losowania ↓'}
        </button>
      </div>
      <div className="org-cats">
        {state.categories.map((c) => <CategoryTeams key={c.id} state={state} category={c} />)}
      </div>
      <section className="panel" id="losowanie">
        <h2>Losowanie grup</h2>
        {sync.empty ? (
          <>
            <p>
              Najpierw ustaw swój <b>PIN sędziego głównego</b> (co najmniej 4 cyfry). Będzie potrzebny do losowania,
              wpisywania i poprawiania wyników. Zapamiętaj go.
            </p>
            <AdminPinForm saveLabel="Ustaw PIN i przejdź do losowania" onSave={setupTournament} />
          </>
        ) : (
          <PinGate label="Losowanie (sędzia główny)">
            <div className="org-draws">
              {state.categories.map((c) => <DrawCategory key={c.id} state={state} category={c} />)}
            </div>
            {allDrawn && (
              <div className="notice org-ready">
                <p><b>Turniej gotowy.</b> {state.groups.length} grup, {state.matches.length} meczów w terminarzu.</p>
                <div className="actions">
                  <a className="btn btn-primary" href="#panel-grupy">Zobacz grupy i terminarz</a>
                  <a className="btn" href="#panel-sedziowie">Sędziowanie</a>
                  <a className="btn" href="#">Strona dla kibiców</a>
                </div>
              </div>
            )}
          </PinGate>
        )}
      </section>
    </>
  )
}

function CategoryTeams({ state, category }: { state: State; category: Category }) {
  const teams = state.teams.filter((t) => t.categoryId === category.id)
  const clubs = [...new Set(teams.map(clubOf))]
  const drawn = isDrawn(state, category.id)
  const groups = state.groups.filter((g) => g.categoryId === category.id)
  return (
    <section className="org-cat">
      <header>
        <h2>{category.name}</h2>
        <span className={`pill ${drawn ? 'pill-done' : ''}`}>{drawn ? `Rozlosowane: ${groups.length} grupy` : 'Nie rozlosowane'}</span>
      </header>
      <p className="muted small">{teams.length} zespołów z {clubs.length} klubów</p>
      <ul className="org-clubs">
        {clubs.map((club) => {
          const own = teams.filter((t) => clubOf(t) === club)
          return (
            <li key={club}>
              <span>{club}</span>
              <b title="Liczba zespołów">{own.length > 1 ? `${own.length} zespoły` : '1 zespół'}</b>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function DrawCategory({ state, category }: { state: State; category: Category }) {
  const { teamName } = useLookups(state)
  const teams = state.teams.filter((t) => t.categoryId === category.id)
  const maxPerClub = Math.max(1, ...[...new Set(teams.map(clubOf))].map((cl) => teams.filter((t) => clubOf(t) === cl).length))
  const current = state.groups.filter((g) => g.categoryId === category.id)
  const [count, setCount] = useState(current.length || GROUPS_DEFAULT)
  const [confirm, setConfirm] = useState(false)
  const [msg, setMsg] = useState('')
  const drawn = isDrawn(state, category.id)
  const played = state.matches.filter((m) => m.status !== 'scheduled').length
  const per = count > 0 ? `${Math.floor(teams.length / count)}${teams.length % count ? `–${Math.ceil(teams.length / count)}` : ''}` : ''

  const draw = async () => {
    setConfirm(false)
    setMsg('Losuję…')
    const first = state.matches.map((m) => m.start).sort()[0] ?? DEFAULT_SCHEDULE.start
    const next = drawCategory(state, category.id, count, { ...DEFAULT_SCHEDULE, courts: state.tournament.courts, start: first })
    await store.replace(next)
    setMsg(`Rozlosowano ${category.name.toLowerCase()} do ${count} grup.`)
  }

  return (
    <div className="org-draw">
      <h3>{category.name}</h3>
      <label>Liczba grup
        <input
          id={`org-count-${category.id}`}
          type="number"
          min={maxPerClub}
          max={teams.length}
          value={count}
          onChange={(e) => setCount(Math.max(maxPerClub, Number(e.target.value) || maxPerClub))}
        />
      </label>
      <p className="muted small">{teams.length} zespołów → {count} grup po {per}.{count === 4 || count === 2 || count === 1 ? ' Drabinka zadziała.' : ' Drabinka jest gotowa dla 1, 2 lub 4 grup.'}</p>
      {confirm ? (
        <div className="notice">
          <p>{played ? `Uwaga: są już wyniki (${played} meczów). Losowanie od nowa je usunie.` : drawn ? `Rozlosować ${category.name.toLowerCase()} od nowa?` : `Rozlosować ${category.name.toLowerCase()}?`}</p>
          <div className="actions">
            <button className="btn btn-primary" onClick={draw}>Tak, losuj</button>
            <button className="btn" onClick={() => setConfirm(false)}>Anuluj</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-primary btn-lg" onClick={() => setConfirm(true)}>
          {drawn ? `Losuj ponownie: ${category.name}` : `Losuj grupy: ${category.name}`}
        </button>
      )}
      {msg && <p className="ok">{msg}</p>}
      {drawn && (
        <div className="org-result">
          {current.map((g) => (
            <div key={g.id} className="org-group">
              <b>{g.name}</b>
              <ol>{g.teamIds.map((id) => <li key={id}>{teamName(id)}</li>)}</ol>
            </div>
          ))}
          <a href="#panel-grupy" className="small">Zobacz grupy z terminarzem →</a>
        </div>
      )}
    </div>
  )
}

const TILES = [
  { href: '#admin', title: 'Sędzia główny', text: 'Wpisywanie i poprawianie wyników, klucze boisk, terminarz, drabinka, ustawienia punktacji.' },
  { href: '#kartki', title: 'Kartki z kodami QR', text: 'Do wydruku i przyklejenia przy boiskach: kod QR do panelu boiska i klucz.' },
  { href: '#tv', title: 'Tryb TV', text: 'Na telewizor lub rzutnik na hali: boiska, tabele i drabinki zmieniają się same.' },
  { href: '#', title: 'Strona dla kibiców', text: 'To, co widzą rodzice i trenerzy: informacje, wyniki, grupy. Bez możliwości wpisywania.' },
]

function More() {
  const session = useSession()
  return (
    <>
      <ul className="organizer">
        {TILES.map((t) => (
          <li key={t.href}>
            <a href={t.href}>
              <b>{t.title}</b>
              <span className="muted small">{t.text}</span>
            </a>
          </li>
        ))}
      </ul>
      {session && (
        <p className="muted small">
          Ten telefon jest zalogowany jako {session.role === 'admin' ? 'sędzia główny' : `sędzia boiska ${session.court}`}.{' '}
          <button className="linklike" onClick={() => store.logout()}>Wyloguj</button>
        </p>
      )}
    </>
  )
}
