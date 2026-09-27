import { useState } from 'react'
import { tournamentUrl } from '../config'
import { clubOf, drawCategory } from '../logic/draw'
import { parseTeamList, scheduleOf } from '../logic/newTournament'
import { SPORTS } from '../logic/sports'
import { store, useSync } from '../store/store'
import type { Category, State } from '../types'
import { formatDay, formatTime, PinGate } from '../ui'
import { AdminPinForm, setupTournament } from './Admin'
import { CategoryGroups } from './Organizer'

/**
 * Step 1 of the organiser panel for a tournament created on "Załóż turniej":
 * save the PIN, enter each category's teams and draw them into groups. The draw
 * keeps teams of one club apart and builds the whole group-stage timetable.
 */
export function Setup({ state }: { state: State }) {
  const sync = useSync()
  if (sync.empty) {
    return (
      <section className="panel">
        <h2>Ostatni krok: PIN sędziego głównego</h2>
        <p>
          Ustaw PIN (co najmniej 4 cyfry) i <b>zapisz go</b>. Tylko nim można wpisywać zespoły, losować grupy i
          poprawiać wyniki. Klucze dla sędziów boisk wygenerują się same.
        </p>
        <AdminPinForm saveLabel="Utwórz turniej" onSave={setupTournament} />
      </section>
    )
  }
  const last = state.matches.map((m) => m.start).sort().at(-1)
  return (
    <>
      <TournamentLinks />
      <div className="org-intro">
        <p className="muted">
          Wpisz zespoły każdej kategorii i rozlosuj je do grup. Losowanie rozdziela zespoły z tego samego klubu i od
          razu układa terminarz: start {formatDay(scheduleOf(state.tournament).start)}{' '}
          {formatTime(scheduleOf(state.tournament).start)}, {state.tournament.courts} boisk, mecz co{' '}
          {scheduleOf(state.tournament).slotMinutes} min.
          {last && <> Ostatni mecz grupowy: <b>{formatDay(last)} {formatTime(last)}</b>.</>}
        </p>
      </div>
      <PinGate label="Zespoły i losowanie (sędzia główny)">
        <div className="setup-cats">
          {state.categories.map((c) => <CategorySetup key={c.id} state={state} category={c} />)}
        </div>
      </PinGate>
      {state.groups.length > 0 && (
        <section className="panel">
          <h2>Grupy</h2>
          <div className="org-draws">
            {state.categories.map((c) => <CategoryGroups key={c.id} state={state} category={c} />)}
          </div>
          <div className="actions">
            <a className="btn btn-primary" href="#panel-grupy">Zobacz grupy i terminarz</a>
            <a className="btn" href="#panel-sedziowie">Na żywo</a>
          </div>
        </section>
      )}
    </>
  )
}

/** "Zespoły", "Zawodnicy", "Pary"… for the tournament's discipline. */
function entrantsLabel(state: State): string {
  const e = SPORTS.find((s) => s.label === state.tournament.rules.sport)?.entrants ?? 'drużyny'
  return { 'drużyny': 'Zespoły', zawodnicy: 'Zawodnicy', pary: 'Pary', 'zawodnicy lub pary': 'Zawodnicy lub pary' }[e]
}

/** One category: its team list and the draw into groups. */
function CategorySetup({ state, category }: { state: State; category: Category }) {
  const current = state.teams.filter((t) => t.categoryId === category.id)
  const [text, setText] = useState(() =>
    // "Klub: Drużyna" only where the club is not already part of the team's name.
    current.map((t) => (t.name.startsWith(clubOf(t)) ? t.name : `${clubOf(t)}: ${t.name}`)).join('\n'))
  const teams = parseTeamList(text, category.id)
  const drawn = state.groups.filter((g) => g.categoryId === category.id).length
  const [groups, setGroups] = useState(drawn || Math.max(1, Math.round(teams.length / 5)))
  const [msg, setMsg] = useState('')
  const played = state.matches.some((m) => m.status !== 'scheduled')

  const draw = async () => {
    if (played && !confirm('Są już wpisane wyniki. Nowe losowanie ułoży terminarz od nowa i usunie wszystkie wyniki. Losować?')) return
    // At least two teams per group.
    const count = Math.max(1, Math.min(groups, Math.floor(teams.length / 2)))
    const others = state.teams.filter((t) => t.categoryId !== category.id)
    const next = drawCategory({ ...state, teams: [...others, ...teams] }, category.id, count, scheduleOf(state.tournament))
    setGroups(count)
    setMsg('Zapisuję…')
    await store.replace(next)
    setMsg(`Rozlosowano ${teams.length} zespołów do ${count} ${count === 1 ? 'grupy' : 'grup'}. Terminarz gotowy.`)
  }

  return (
    <section className="panel setup-cat">
      <h3>{category.name}</h3>
      <label>
        {entrantsLabel(state)}: jedna pozycja w linii. Klub przed dwukropkiem, np. <i>UKS Orzeł: Orzeł 1</i>
        <textarea rows={Math.max(6, Math.min(16, teams.length + 2))} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="form-row">
        <span className="muted">Na liście: {teams.length}</span>
        <label>Liczba grup
          <input type="number" min={1} max={12} value={groups}
            onChange={(e) => setGroups(Math.max(1, Math.min(12, Number(e.target.value) || 1)))} />
        </label>
      </div>
      <button className="btn btn-primary" disabled={teams.length < 2} onClick={() => void draw()}>
        {drawn ? 'Zapisz zespoły i losuj grupy od nowa' : 'Zapisz zespoły i losuj grupy'}
      </button>
      {msg && <p className="ok">{msg}</p>}
    </section>
  )
}

/** The tournament's own links: for fans, and this panel. */
function TournamentLinks() {
  const base = tournamentUrl()
  const [copied, setCopied] = useState('')
  const copy = (url: string) =>
    navigator.clipboard?.writeText(url).then(() => { setCopied(url); setTimeout(() => setCopied(''), 2000) }, () => {})
  const links = [
    { label: 'Strona dla kibiców', url: base },
    { label: 'Panel organizatora (zapisz go!)', url: `${base}#panel` },
  ]
  return (
    <section className="panel setup-links">
      <h2>Adresy Twojego turnieju</h2>
      <ul className="plain">
        {links.map((l) => (
          <li key={l.url}>
            <span className="muted small">{l.label}</span>
            <a href={l.url}>{l.url}</a>
            <button className="btn" onClick={() => copy(l.url)}>{copied === l.url ? 'Skopiowano ✓' : 'Kopiuj'}</button>
          </li>
        ))}
      </ul>
    </section>
  )
}
