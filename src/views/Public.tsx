import { useState } from 'react'
import { formatRatio, standings, tally } from '../logic/scoring'
import { useFavorites } from '../favorites'
import { courtBoard, upcomingMatches } from '../logic/courtBoard'
import { useStore } from '../store/store'
import type { Match, State } from '../types'
import { Competition, TeamBadge, TeamPage } from './Competition'
import { MatchPage } from './Groups'
import { Info } from './Info'
import { BackBar, formatDay, formatTime, ScoreLine, StatusPill, useLookups, useNow } from '../ui'

/**
 * What visitors see: the invitation, groups (each with its table and schedule), live
 * courts and results. The bracket tab appears once the organiser creates it.
 * Tables and the full schedule stay reachable (#tabele, #terminarz) but are not in the menu.
 */
const TABS = [
  { route: '', label: 'Start' },
  { route: 'grupy', label: 'Rozgrywki' },
  { route: 'na-zywo', label: 'Na żywo' },
  { route: 'wyniki', label: 'Wyniki' },
]
const HIDDEN_ROUTES = ['tabele', 'terminarz', 'drabinka']

export function Public({ route }: { route: string }) {
  const state = useStore()
  // Group links, match pages and the bracket all sit under "Rozgrywki".
  const detail = /^(grupa|mecz|druzyna)-(.+)$/.exec(route)
  const known = TABS.some((t) => t.route === route) || HIDDEN_ROUTES.includes(route)
  const tab = detail || route === 'drabinka' ? 'grupy' : known ? route : ''
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
        {/* Every screen except the start page gets a back button; team and match pages have their own. */}
        {tab !== '' && !detail && <BackBar fallback="" />}
        {tab === 'wyniki' && <Results state={state} />}
        {tab === 'grupy' && detail?.[1] !== 'mecz' && detail?.[1] !== 'druzyna' && <Competition state={state} route={route} />}
        {detail?.[1] === 'druzyna' && <TeamPage state={state} teamId={detail[2]} />}
        {detail?.[1] === 'mecz' && <MatchPage state={state} matchId={detail[2]} />}
        {tab === 'na-zywo' && <LiveCourts state={state} />}
        {tab === 'tabele' && <Tables state={state} />}
        {tab === 'terminarz' && <Schedule state={state} />}
      </main>
      {/* Public pages are view-only: the organiser panel lives at #panel and is not linked from here. */}
      <footer className="footer muted small">Wyniki odświeżają się same, nie trzeba przeładowywać strony.</footer>
    </div>
  )
}

/** `referee`: show the scoring buttons (organiser panel only, never on public pages). */
/**
 * One court's board. The match being played says "Trwa" (from its start time on);
 * after the result it shows "Koniec meczu" with the score until 5 minutes before the
 * next match on that court, which then appears as "Następne spotkanie".
 * `referee`: show the scoring buttons (organiser panel only, never on public pages).
 */
export function CourtCard({ state, court, big = false, referee = false }: { state: State; court: number; big?: boolean; referee?: boolean }) {
  const mine = useFavorites()
  const now = useNow(15000)
  const { categoryName, stageName, side } = useLookups(state)
  const board = courtBoard(state, court, now)
  const rules = state.tournament.rules
  const refLink = referee && (
    <div className="ref-links">
      <a className="btn btn-ref" href={`#boisko-${court}`}>Sędziuj na żywo</a>
      <a className="btn btn-ref" href={`#wynik-${court}`}>Podaj wynik</a>
    </div>
  )
  const current = board.match
  if (!current) {
    return (
      <article className="court court-idle">
        <header><span className="court-no">Boisko {court}</span></header>
        <p className="muted">Brak kolejnych meczów</p>
      </article>
    )
  }
  const live = board.mode === 'live'
  const finished = board.mode === 'finished'
  const t = tally(rules, current.sets)
  const multi = rules.sets > 1
  // Points: the set in progress while playing, the final score once finished.
  const shown = current.sets.length > 0 && (live || finished)
  const cur = shown ? current.sets[current.sets.length - 1] : undefined
  const winA = finished && t.setsA > t.setsB
  const winB = finished && t.setsB > t.setsA
  return (
    <article className={`court mode-${board.mode} ${big ? 'court-big' : ''} ${mine.includes(current.teamA) || mine.includes(current.teamB) ? 'mine' : ''}`}>
      <header>
        <span className="court-no">Boisko {court}</span>
        {live && <StatusPill status="live" />}
        {finished && <StatusPill status="finished" />}
        {board.mode === 'next' && <span className="pill pill-next">Następne<span className="pill-long"> spotkanie</span> · {formatTime(current.start)}</span>}
      </header>
      <p className="court-meta">{categoryName(current.categoryId)} · {stageName(current)} · {formatTime(current.start)}</p>
      <a className="board" href={`#mecz-${current.id}`}>
        <TeamRow name={side(current, 'a')} sets={multi ? t.setsA : undefined} points={cur?.a} live={shown} win={winA} mine={mine.includes(current.teamA)} />
        <TeamRow name={side(current, 'b')} sets={multi ? t.setsB : undefined} points={cur?.b} live={shown} win={winB} mine={mine.includes(current.teamB)} />
      </a>
      {live && !current.sets.length && <p className="court-sets muted">Mecz trwa. Wynik pojawi się po meczu.</p>}
      {multi && current.sets.length > 1 && (live || finished) && (
        <p className="court-sets muted">Sety: {current.sets.map((s) => `${s.a}:${s.b}`).join(', ')}</p>
      )}
      {refLink}
    </article>
  )
}

/** `sets` is left out when the match is a single set. */
function TeamRow({ name, sets, points, live, win = false, mine = false }: {
  name: string; sets?: number; points?: number; live: boolean; win?: boolean; mine?: boolean
}) {
  return (
    <div className={`team-row ${win ? 'win' : ''} ${mine ? 'mine' : ''}`}>
      <span className="team-name">{mine && <span className="mine-star" aria-label="Obserwowana">★ </span>}{name}</span>
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
      <h2>Boiska</h2>
      <section className="courts">
        {courts.map((c) => <CourtCard key={c} state={state} court={c} />)}
      </section>
      <Upcoming state={state} />
      <h2>Ostatnie wyniki</h2>
      <MatchList state={state} matches={recent} />
    </>
  )
}

/**
 * Matches to come that are not on a court board yet, kept apart from the boards:
 * grouped by start time, one card per match with the court, the group and both teams.
 */
export function Upcoming({ state }: { state: State }) {
  const now = useNow(15000)
  const mine = useFavorites()
  const { categoryName, stageName, side } = useLookups(state)
  const matches = upcomingMatches(state, now)
  const team = (id: string) => (id ? state.teams.find((x) => x.id === id) : undefined)
  const slots: { start: string; matches: Match[] }[] = []
  for (const m of matches) {
    const last = slots[slots.length - 1]
    if (last && last.start === m.start) last.matches.push(m)
    else slots.push({ start: m.start, matches: [m] })
  }
  return (
    <section className="upcoming">
      <h2>Nadchodzące mecze</h2>
      {!slots.length && <p className="muted">Brak kolejnych meczów.</p>}
      {slots.map((slot) => (
        <div key={slot.start} className="up-slot">
          <h3 className="up-time">
            <span>{formatTime(slot.start)}</span>
            <span className="muted">{formatDay(slot.start)}</span>
          </h3>
          <div className="up-grid">
            {slot.matches.map((m) => (
              <a key={m.id} href={`#mecz-${m.id}`} className={`up-card ${mine.includes(m.teamA) || mine.includes(m.teamB) ? 'mine' : ''}`}>
                <header>
                  <span className="up-court">Boisko {m.court}</span>
                  <span className="up-cat">{categoryName(m.categoryId)} · {stageName(m)}</span>
                </header>
                <span className={`up-team ${mine.includes(m.teamA) ? 'mine' : ''}`}>
                  <TeamBadge team={team(m.teamA)} />
                  <b className={m.teamA ? '' : 'tbd'}>{mine.includes(m.teamA) && '★ '}{side(m, 'a')}</b>
                </span>
                <span className="up-vs">vs</span>
                <span className={`up-team ${mine.includes(m.teamB) ? 'mine' : ''}`}>
                  <TeamBadge team={team(m.teamB)} />
                  <b className={m.teamB ? '' : 'tbd'}>{mine.includes(m.teamB) && '★ '}{side(m, 'b')}</b>
                </span>
              </a>
            ))}
          </div>
        </div>
      ))}
    </section>
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
  const mine = useFavorites()
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
              <span className={`${winA ? 'win' : ''} ${mine.includes(m.teamA) ? 'mine' : ''}`}>{mine.includes(m.teamA) && '★ '}{side(m, 'a')}</span>
              <span className={`${winB ? 'win' : ''} ${mine.includes(m.teamB) ? 'mine' : ''}`}>{mine.includes(m.teamB) && '★ '}{side(m, 'b')}</span>
              <span className="muted small">{categoryName(m.categoryId)} · {stageName(m)}</span>
            </span>
            <span className="m-score">
              {m.status === 'scheduled' ? <StatusPill status="scheduled" /> : <ScoreLine match={m} rules={state.tournament.rules} />}
              {m.status === 'live' && <StatusPill status="live" />}
            </span>
          </>
        )
        return (
          <li key={m.id} className={`${m.status === 'live' ? 'is-live' : ''} ${mine.includes(m.teamA) || mine.includes(m.teamB) ? 'mine' : ''}`}>
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
  const mine = useFavorites()
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
                    <tr key={m.id} className={mine.includes(m.teamA) || mine.includes(m.teamB) ? 'mine' : ''}>
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
