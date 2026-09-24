import { useState } from 'react'
import { demoState } from '../logic/demo'
import { buildGroupSchedule } from '../logic/schedule'
import { tally } from '../logic/scoring'
import { store, useStore } from '../store/store'
import { parseTeams } from '../logic/importTeams'
import type { Match, MatchStatus, SetScore, State } from '../types'
import { formatDay, formatTime, PinGate, useLookups } from '../ui'
import { CourtCard, MatchList } from './Public'

const TABS = [
  { id: 'boiska', label: 'Boiska' },
  { id: 'mecze', label: 'Mecze i poprawki' },
  { id: 'dane', label: 'Drużyny i terminarz' },
  { id: 'ustawienia', label: 'Ustawienia' },
]

export function Admin() {
  const state = useStore()
  const [tab, setTab] = useState('boiska')
  return (
    <div className="page">
      <header className="bar">
        <a href="#" className="back">← Wyniki</a>
        <h1>Sędzia główny</h1>
      </header>
      <PinGate pin={state.tournament.adminPin} label="Panel sędziego głównego">
        <nav className="tabs tabs-admin" aria-label="Panel">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </nav>
        {tab === 'boiska' && <Courts state={state} />}
        {tab === 'mecze' && <Matches state={state} />}
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
          <CourtCard key={i} state={state} court={i + 1} />
        ))}
      </section>
    </>
  )
}

function Matches({ state }: { state: State }) {
  const { teamName } = useLookups(state)
  const [filter, setFilter] = useState<MatchStatus | 'all'>('live')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const query = q.trim().toLowerCase()
  const list = state.matches
    .filter((m) => filter === 'all' || m.status === filter)
    .filter((m) => !query || `${teamName(m.teamA)} ${teamName(m.teamB)} boisko ${m.court}`.toLowerCase().includes(query))
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
  const { teamName } = useLookups(state)
  const rules = state.tournament.rules
  const initial = Array.from({ length: rules.sets }, (_, i) => match.sets[i] ?? { a: 0, b: 0 })
  const [sets, setSets] = useState<SetScore[]>(initial)
  const played = sets.filter((s) => s.a > 0 || s.b > 0)
  const t = tally(rules, played)

  const save = (status: MatchStatus) => {
    store.updateMatch(match.id, (m) => ({ ...m, status, sets: status === 'scheduled' ? [] : played }))
    onClose()
  }
  const set = (i: number, side: 'a' | 'b', v: string) =>
    setSets((s) => s.map((x, j) => (j === i ? { ...x, [side]: Math.max(0, Number(v) || 0) } : x)))

  return (
    <section className="editor">
      <button className="back" onClick={onClose}>← Lista meczów</button>
      <h2>{teamName(match.teamA)} – {teamName(match.teamB)}</h2>
      <p className="muted">Boisko {match.court} · {formatDay(match.start)} {formatTime(match.start)}</p>
      <table className="set-inputs">
        <thead>
          <tr><th className="left">Set</th><th className="left">{teamName(match.teamA)}</th><th className="left">{teamName(match.teamB)}</th></tr>
        </thead>
        <tbody>
          {sets.map((s, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td><input id={`set-${i}-a`} inputMode="numeric" value={s.a || ''} placeholder="0" onChange={(e) => set(i, 'a', e.target.value)} /></td>
              <td><input id={`set-${i}-b`} inputMode="numeric" value={s.b || ''} placeholder="0" onChange={(e) => set(i, 'b', e.target.value)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>Wynik w setach: <b>{t.setsA}:{t.setsB}</b></p>
      <div className="actions">
        <button className="btn btn-primary" onClick={() => save('finished')}>Zapisz jako zakończony</button>
        <button className="btn" onClick={() => save('live')}>Zapisz jako trwający</button>
        <button className="btn btn-danger" onClick={() => save('scheduled')}>Wyczyść wynik</button>
      </div>
    </section>
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
  const [text, setText] = useState(SAMPLE_CSV)
  const [start, setStart] = useState('2026-10-23T09:00')
  const [slot, setSlot] = useState(25)
  const [dayEnd, setDayEnd] = useState('18:00')
  const [confirm, setConfirm] = useState<'import' | 'demo' | null>(null)
  const [msg, setMsg] = useState('')
  const parsed = parseTeams(text)
  const csv = exportCsv(state)

  const doImport = () => {
    const matches = buildGroupSchedule(parsed.groups, { courts: state.tournament.courts, start, slotMinutes: slot, dayEnd })
    store.replace({ ...state, ...parsed, matches })
    setConfirm(null)
    setMsg(`Wczytano ${parsed.teams.length} drużyn i ułożono ${matches.length} meczów.`)
  }

  return (
    <div className="data">
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

      <section className="panel">
        <h2>Eksport do Excela</h2>
        <p className="muted">Wszystkie mecze z wynikami w pliku CSV, który otwiera się w Excelu.</p>
        <div className="actions">
          <button className="btn" onClick={() => download('wyniki.csv', csv)}>Pobierz CSV</button>
          <button className="btn" onClick={() => navigator.clipboard?.writeText(csv).then(() => setMsg('Skopiowano wyniki do schowka.'), () => setMsg('Nie udało się skopiować.'))}>Kopiuj do schowka</button>
        </div>
      </section>

      <section className="panel">
        <h2>Dane przykładowe</h2>
        <p className="muted">Przywraca przykładowy turniej: 60 drużyn, 3 kategorie, 10 boisk.</p>
        {confirm === 'demo' ? (
          <div className="actions">
            <button className="btn btn-danger" onClick={() => { store.replace(demoState()); setConfirm(null) }}>Tak, przywróć</button>
            <button className="btn" onClick={() => setConfirm(null)}>Anuluj</button>
          </div>
        ) : (
          <button className="btn" onClick={() => setConfirm('demo')}>Przywróć dane przykładowe</button>
        )}
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
  const update = (patch: Partial<State['tournament']>) => store.replace({ ...state, tournament: { ...t, ...patch } })
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
          <label>PIN sędziego głównego<input id="set-admin-pin" value={t.adminPin} onChange={(e) => update({ adminPin: e.target.value })} /></label>
          <label>PIN sędziów boisk<input id="set-court-pin" value={t.courtPin} onChange={(e) => update({ courtPin: e.target.value })} /></label>
        </div>
      </section>
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
          <label>Tie-break do (pkt)<input id="set-tiebreak" type="number" min={1} value={r.lastSetPoints} disabled={r.setsMode === 'fixed'} onChange={(e) => rules({ lastSetPoints: num(e.target.value, 1) })} /></label>
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
