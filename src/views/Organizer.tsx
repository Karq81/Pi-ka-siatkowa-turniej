import { clubOf } from '../logic/draw'
import { store, useSession, useStore, useSync } from '../store/store'
import { AdminPinForm, setupTournament } from './Admin'
import type { Category, State } from '../types'
import { useLookups } from '../ui'
import { CourtList } from './Court'
import { Competition } from './Competition'

const TABS = [
  { route: 'panel', label: '1. Zespoły i grupy' },
  { route: 'panel-grupy', label: '2. Grupy' },
  { route: 'panel-sedziowie', label: '3. Na żywo' },
  { route: 'panel-wiecej', label: 'Więcej' },
]

/**
 * Organiser panel (#panel). Not linked from the public pages: teams and the organiser's
 * fixed groups → groups with the schedule → refereeing. There is no draw: the groups
 * come from the organiser's list.
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
        state.groups.length ? <Competition state={state} route="grupy" /> : <Empty />
      )}
      {tab === 'panel-sedziowie' && <CourtList />}
      {tab === 'panel-wiecej' && <More />}
    </div>
  )
}

function Empty() {
  return (
    <p className="notice-inline">
      Grupy nie są jeszcze zapisane w bazie. Ustaw PIN w zakładce <a href="#panel">1. Zespoły i grupy</a>.
    </p>
  )
}

/** Step 1: every team by category and club, and the organiser's fixed groups. */
function TeamsAndDraw({ state }: { state: State }) {
  const sync = useSync()
  return (
    <>
      <div className="org-intro">
        <p className="muted">
          Zespoły i grupy według listy organizatora. Grupy są ustalone na stałe (bez losowania):
          dwójki w 4 grupach po 7 zespołów, trójki w 5 grupach po 6 zespołów.
        </p>
      </div>
      {sync.empty && (
        <section className="panel">
          <h2>Pierwsze uruchomienie</h2>
          <p>
            Ustaw swój <b>PIN sędziego głównego</b> (co najmniej 4 cyfry). Zapisze on w bazie zespoły, grupy i
            terminarz. Będzie potrzebny do wpisywania i poprawiania wyników.
          </p>
          <AdminPinForm saveLabel="Ustaw PIN i zapisz turniej" onSave={setupTournament} />
        </section>
      )}
      <div className="org-cats">
        {state.categories.map((c) => <CategoryTeams key={c.id} state={state} category={c} />)}
      </div>
      <section className="panel">
        <h2>Grupy</h2>
        <div className="org-draws">
          {state.categories.map((c) => <CategoryGroups key={c.id} state={state} category={c} />)}
        </div>
        {state.groups.length > 0 && (
          <div className="actions">
            <a className="btn btn-primary" href="#panel-grupy">Zobacz grupy i terminarz</a>
            <a className="btn" href="#panel-sedziowie">Na żywo</a>
          </div>
        )}
      </section>
    </>
  )
}

function CategoryTeams({ state, category }: { state: State; category: Category }) {
  const teams = state.teams.filter((t) => t.categoryId === category.id)
  const clubs = [...new Set(teams.map(clubOf))]
  const groups = state.groups.filter((g) => g.categoryId === category.id)
  return (
    <section className="org-cat">
      <header>
        <h2>{category.name}</h2>
        <span className={`pill ${groups.length ? 'pill-done' : ''}`}>{groups.length ? `${groups.length} grup` : 'Bez grup'}</span>
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

/** The fixed groups of one category, read-only. */
function CategoryGroups({ state, category }: { state: State; category: Category }) {
  const { teamName } = useLookups(state)
  const groups = state.groups.filter((g) => g.categoryId === category.id)
  return (
    <div className="org-draw">
      <h3>{category.name}</h3>
      {groups.length ? (
        <div className="org-result">
          {groups.map((g) => (
            <div key={g.id} className="org-group">
              <b>{g.name}</b>
              <ol>{g.teamIds.map((id) => <li key={id}>{teamName(id)}</li>)}</ol>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">Brak grup w bazie.</p>
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
