import { useState } from 'react'
import { formatRatio, standings, tally } from '../logic/scoring'
import { useStore } from '../store/store'
import type { Match, State } from '../types'
import { Bracket } from './Bracket'
import { GroupPage, Groups, MatchPage } from './Groups'
import { Info } from './Info'
import { courtMatch, formatDay, formatTime, ScoreLine, StatusPill, useLookups } from '../ui'

const TABS = [
  { route: '', label: 'Start' },
  { route: 'wyniki', label: 'Wyniki' },
  { route: 'grupy', label: 'Grupy' },
  { route: 'na-zywo', label: 'Na żywo' },
  { route: 'tabele', label: 'Tabele' },
  { route: 'drabinka', label: 'Drabinka' },
  { route: 'terminarz', label: 'Terminarz' },
]

export function Public({ route }: { route: string }) {
  const state = useStore()
  // Group and match pages sit under the "Grupy" tab.
  const detail = /^(grupa|mecz)-(.+)$/.exec(route)
  const tab = detail ? 'grupy' : TABS.some((t) => t.route === route) ? route : ''
  const nav = (
    <nav className="tabs" aria-label="Sekcje">
      {TABS.map((t) => (
        <a key={t.route} href={`#${t.route}`} className={tab === t.route ? 'active' : ''}>
          {t.label}
        </a>
      ))}
    </nav>
  )
  return (
    <div className="page">
      {tab === '' ? (
        <Info nav={nav} />
      ) : (
        <header className="hero">
          <div>
            <p className="eyebrow">Wyniki na żywo</p>
            <h1>{state.tournament.name}</h1>
            <p className="muted">{state.tournament.subtitle}</p>
          </div>
          {nav}
        </header>
      )}
      <main>
        {tab === 'wyniki' && <Results state={state} />}
        {tab === 'grupy' && !detail && <Groups state={state} />}
        {detail?.[1] === 'grupa' && <GroupPage state={state} groupId={detail[2]} />}
        {detail?.[1] === 'mecz' && <MatchPage state={state} matchId={detail[2]} />}
        {tab === 'na-zywo' && <LiveCourts state={state} />}
        {tab === 'tabele' && <Tables state={state} />}
        {tab === 'drabinka' && <Bracket state={state} />}
        {tab === 'terminarz' && <Schedule state={state} />}
      </main>
      {/* Public pages are view-only: the organiser panel lives at #panel and is not linked from here. */}
      <footer className="footer muted small">Wyniki odświeżają się same, nie trzeba przeładowywać strony.</footer>
    </div>
  )
}

/** `referee`: show the scoring buttons (organiser panel only, never on public pages). */
export function CourtCard({ state, court, big = false, referee = false }: { state: State; court: number; big?: boolean; referee?: boolean }) {
  const { categoryName, stageName, side } = useLookups(state)
  const { current, next } = courtMatch(state, court)
  const rules = state.tournament.rules
  const refLink = referee && (
    <div className="ref-links">
      <a className="btn btn-ref" href={`#boisko-${court}`}>Sędziuj na żywo</a>
      <a className="btn btn-ref" href={`#wynik-${court}`}>Podaj wynik</a>
    </div>
  )
  if (!current) {
    return (
      <article className="court court-idle">
        <header><span className="court-no">Boisko {court}</span></header>
        <p className="muted">Brak kolejnych meczów</p>
      </article>
    )
  }
  const live = current.status === 'live'
  const t = tally(rules, current.sets)
  // A match can be live without point-by-point scoring (no phone at that court).
  const counting = live && current.sets.length > 0
  const multi = rules.sets > 1
  const cur = counting ? current.sets[current.sets.length - 1] : undefined
  return (
    <article className={`court ${live ? 'court-live' : ''} ${big ? 'court-big' : ''}`}>
      <header>
        <span className="court-no">Boisko {court}</span>
        {live ? <StatusPill status="live" /> : <span className="pill">Start {formatTime(current.start)}</span>}
      </header>
      <p className="court-meta">{categoryName(current.categoryId)} · {stageName(current)}</p>
      <div className="board">
        <TeamRow name={side(current, 'a')} sets={multi ? t.setsA : undefined} points={cur?.a} live={counting} />
        <TeamRow name={side(current, 'b')} sets={multi ? t.setsB : undefined} points={cur?.b} live={counting} />
      </div>
      {live && !counting && <p className="court-sets muted">Mecz trwa. Wynik pojawi się po meczu.</p>}
      {live && current.sets.length > 1 && (
        <p className="court-sets muted">
          Sety: {current.sets.slice(0, -1).map((s) => `${s.a}:${s.b}`).join(', ')}
        </p>
      )}
      {next && (
        <p className="court-next">
          Następnie {formatTime(next.start)}: {side(next, 'a')} – {side(next, 'b')}
        </p>
      )}
      {refLink}
    </article>
  )
}

/** `sets` is left out when the match is a single set. */
function TeamRow({ name, sets, points, live }: { name: string; sets?: number; points?: number; live: boolean }) {
  return (
    <div className="team-row">
      <span className="team-name">{name}</span>
      {live && sets !== undefined && <span className="sets" title="Wygrane sety">{sets}</span>}
      {live && <span className="points">{points ?? 0}</span>}
    </div>
  )
}

function LiveCourts({ state }: { state: State }) {
  const courts = Array.from({ length: state.tournament.courts }, (_, i) => i + 1)
  const recent = state.matches
    .filter((m) => m.status === 'finished')
    .sort((a, b) => b.updatedAt - a.updatedAt || b.start.localeCompare(a.start))
    .slice(0, 8)
  return (
    <>
      <section className="courts">
        {courts.map((c) => <CourtCard key={c} state={state} court={c} />)}
      </section>
      <h2>Ostatnie wyniki</h2>
      <MatchList state={state} matches={recent} />
    </>
  )
}

function CategoryChips({ state, value, onChange }: { state: State; value: string; onChange: (id: string) => void }) {
  return (
    <div className="chips" role="tablist" aria-label="Kategoria">
      {state.categories.map((c) => (
        <button
          key={c.id}
          role="tab"
          aria-selected={value === c.id}
          className={`chip ${value === c.id ? 'active' : ''}`}
          onClick={() => onChange(c.id)}
        >
          {c.name}
        </button>
      ))}
    </div>
  )
}

/** `title`: show the group name linking to its page (off on the group page itself). */
export function GroupTable({ state, groupId, title = true }: { state: State; groupId: string; title?: boolean }) {
  const { teamName } = useLookups(state)
  const group = state.groups.find((g) => g.id === groupId)!
  const multi = state.tournament.rules.sets > 1
  const rows = standings(state.tournament.rules, group, state.matches, state.teams)
  return (
    <div className="table-card">
      {title && <h3><a href={`#grupa-${group.id}`} className="plain-link">{group.name} →</a></h3>}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>#</th><th className="left">Drużyna</th><th title="Mecze">M</th><th title="Wygrane">W</th>
              <th title="Przegrane">P</th><th title="Punkty">Pkt</th>{multi && <th title="Sety">Sety</th>}
              <th title="Stosunek małych punktów">Małe pkt</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.teamId}>
                <td className="pos">{i + 1}</td>
                <td className="left">{teamName(r.teamId)}</td>
                <td>{r.played}</td><td>{r.won}</td><td>{r.lost}</td>
                <td className="pts">{r.tablePoints}</td>
                {multi && <td>{r.setsWon}:{r.setsLost}</td>}
                <td title={formatRatio(r.pointsWon, r.pointsLost)}>{r.pointsWon}:{r.pointsLost}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Tables({ state }: { state: State }) {
  const [cat, setCat] = useState(state.categories[0]?.id ?? '')
  return (
    <>
      <CategoryChips state={state} value={cat} onChange={setCat} />
      <section className="tables">
        {state.groups.filter((g) => g.categoryId === cat).map((g) => (
          <GroupTable key={g.id} state={state} groupId={g.id} />
        ))}
      </section>
      <p className="muted small">
        Kolejność: punkty, stosunek setów, stosunek małych punktów, bezpośredni mecz.
      </p>
    </>
  )
}

export function MatchList({ state, matches, onPick }: { state: State; matches: Match[]; onPick?: (m: Match) => void }) {
  const { categoryName, stageName, side } = useLookups(state)
  if (!matches.length) return <p className="muted">Brak meczów.</p>
  return (
    <ul className="matches">
      {matches.map((m) => {
        const t = tally(state.tournament.rules, m.sets)
        const winA = m.status === 'finished' && t.setsA > t.setsB
        const winB = m.status === 'finished' && t.setsB > t.setsA
        const body = (
          <>
            <span className="m-when">
              <b>{formatTime(m.start)}</b>
              <span className="muted">Boisko {m.court}</span>
            </span>
            <span className="m-teams">
              <span className={winA ? 'win' : ''}>{side(m, 'a')}</span>
              <span className={winB ? 'win' : ''}>{side(m, 'b')}</span>
              <span className="muted small">{categoryName(m.categoryId)} · {stageName(m)}</span>
            </span>
            <span className="m-score">
              {m.status === 'scheduled' ? <StatusPill status="scheduled" /> : <ScoreLine match={m} rules={state.tournament.rules} />}
              {m.status === 'live' && <StatusPill status="live" />}
            </span>
          </>
        )
        return (
          <li key={m.id} className={m.status === 'live' ? 'is-live' : ''}>
            {onPick
              ? <button className="m-row" onClick={() => onPick(m)}>{body}</button>
              : <a className="m-row" href={`#mecz-${m.id}`}>{body}</a>}
          </li>
        )
      })}
    </ul>
  )
}

function Schedule({ state }: { state: State }) {
  const [cat, setCat] = useState('')
  const [q, setQ] = useState('')
  const { side } = useLookups(state)
  const query = q.trim().toLowerCase()
  const list = state.matches
    .filter((m) => !cat || m.categoryId === cat)
    .filter((m) => !query || `${side(m, 'a')} ${side(m, 'b')}`.toLowerCase().includes(query))
    .sort((a, b) => a.start.localeCompare(b.start) || a.court - b.court)
  const days = [...new Set(list.map((m) => m.start.slice(0, 10)))]
  return (
    <>
      <div className="filters">
        <input
          id="team-search"
          type="search"
          placeholder="Szukaj drużyny, np. Orlik"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="chips">
          <button className={`chip ${cat === '' ? 'active' : ''}`} onClick={() => setCat('')}>Wszystkie</button>
          {state.categories.map((c) => (
            <button key={c.id} className={`chip ${cat === c.id ? 'active' : ''}`} onClick={() => setCat(c.id)}>{c.name}</button>
          ))}
        </div>
      </div>
      {days.map((d) => (
        <section key={d}>
          <h2>{formatDay(d)}</h2>
          <MatchList state={state} matches={list.filter((m) => m.start.startsWith(d))} />
        </section>
      ))}
      {!days.length && <p className="muted">Nic nie znaleziono.</p>}
    </>
  )
}

/** Finished matches as a results table, newest first, for parents and coaches. */
function Results({ state }: { state: State }) {
  const { side, stageName } = useLookups(state)
  const [cat, setCat] = useState('')
  const [q, setQ] = useState('')
  const rules = state.tournament.rules
  const query = q.trim().toLowerCase()
  const list = state.matches
    .filter((m) => m.status === 'finished')
    .filter((m) => !cat || m.categoryId === cat)
    .filter((m) => !query || `${side(m, 'a')} ${side(m, 'b')}`.toLowerCase().includes(query))
    .sort((a, b) => b.start.localeCompare(a.start) || b.updatedAt - a.updatedAt || a.court - b.court)
  return (
    <>
      <div className="filters">
        <input id="results-search" type="search" placeholder="Szukaj drużyny" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="chips">
          <button className={`chip ${cat === '' ? 'active' : ''}`} onClick={() => setCat('')}>Wszystkie</button>
          {state.categories.map((c) => (
            <button key={c.id} className={`chip ${cat === c.id ? 'active' : ''}`} onClick={() => setCat(c.id)}>{c.name}</button>
          ))}
        </div>
      </div>
      {!list.length && <p className="muted">Jeszcze nie ma zakończonych meczów. Wyniki pojawią się tu zaraz po każdym meczu.</p>}
      {!!list.length && (
        <div className="table-card">
          <div className="table-scroll">
            <table className="results">
              <thead>
                <tr>
                  <th className="left">Godz.</th>
                  <th className="left">Mecz</th>
                  <th>Wynik</th>
                  <th className="left hide-narrow">Faza</th>
                </tr>
              </thead>
              <tbody>
                {list.map((m) => {
                  const t = tally(rules, m.sets)
                  const single = m.sets.length === 1
                  return (
                    <tr key={m.id}>
                      <td className="left when">
                        <b>{formatTime(m.start)}</b>
                        <span className="muted small">{formatDay(m.start)} · B{m.court}</span>
                      </td>
                      <td className="left teams">
                        <a href={`#mecz-${m.id}`} className="plain-link">
                          <span className={t.setsA > t.setsB ? 'win' : ''}>{side(m, 'a')}</span>
                          <span className={t.setsB > t.setsA ? 'win' : ''}>{side(m, 'b')}</span>
                        </a>
                      </td>
                      <td className="score">
                        {single ? (
                          <b>{m.sets[0].a}:{m.sets[0].b}</b>
                        ) : (
                          <>
                            <b>{t.setsA}:{t.setsB}</b>
                            <span className="muted small">{m.sets.map((s) => `${s.a}:${s.b}`).join(', ')}</span>
                          </>
                        )}
                      </td>
                      <td className="left hide-narrow muted small">{stageName(m)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
