import { StreamPlayer } from './Stream'
import { LangPicker } from './LangPicker'
import { t, tk } from '../i18n'
import { useState } from 'react'
import { BRAND, IS_PLATFORM_HOST } from '../config'
import { formatRatio, isScore, scoreUnit, standings, tally } from '../logic/scoring'
import { useFavorites } from '../favorites'
import { courtBoard, upcomingMatches } from '../logic/courtBoard'
import { useStore } from '../store/store'
import type { Match, State } from '../types'
import { Competition, NextMatch, TeamBadge, TeamPage } from './Competition'
import { MatchPage } from './Groups'
import { CourtQueue } from './CourtQueue'
import { Info, InfoHero } from './Info'
import { BackBar, courtLabel, formatDay, formatTime, ScoreLine, StatusPill, useLookups, useNow } from '../ui'

/**
 * What visitors see: the invitation, groups (each with its table and schedule), live
 * courts and results. The bracket tab appears once the organiser creates it.
 * Tables and the full schedule stay reachable (#tabele, #terminarz) but are not in the menu.
 */
const TABS = [
  { route: '', label: tk('Start') },
  { route: 'grupy', label: tk('Grupy i terminarz') },
  { route: 'na-zywo', label: tk('Na żywo') },
  { route: 'wyniki', label: tk('Wyniki') },
]
const HIDDEN_ROUTES = ['tabele', 'terminarz', 'drabinka']

export function Public({ route }: { route: string }) {
  const state = useStore()
  // Group links, match pages and the bracket all sit under "Grupy i terminarz".
  const detail = /^(grupa|mecz|druzyna)-(.+)$/.exec(route)
  // One court's page (its board and queue) sits under "Na żywo".
  const courtPage = /^kolejka-(\d+)$/.exec(route)
  const known = TABS.some((x) => x.route === route) || HIDDEN_ROUTES.includes(route)
  const tab = courtPage ? 'na-zywo' : detail || route === 'drabinka' ? 'grupy' : known ? route : ''
  const nav = (
    <nav className="tabs" aria-label={t('Sekcje')}>
      {TABS.map((x) => (
        <a key={x.route} href={`#${x.route}`} className={tab === x.route ? 'active' : ''}>
          {t(x.label)}
        </a>
      ))}
    </nav>
  )
  return (
    <div className="page">
      <InfoHero nav={nav} />
      <main>
        {tab === '' && <Info />}
        {/* Every screen except the start page gets a back button; team and match pages have their own. */}
        {tab !== '' && !detail && <BackBar fallback="" />}
        {tab === 'wyniki' && <Results state={state} />}
        {tab === 'grupy' && detail?.[1] !== 'mecz' && detail?.[1] !== 'druzyna' && <Competition state={state} route={route} />}
        {detail?.[1] === 'druzyna' && <TeamPage state={state} teamId={detail[2]} />}
        {detail?.[1] === 'mecz' && <MatchPage state={state} matchId={detail[2]} />}
        {tab === 'na-zywo' && (courtPage ? <CourtPage state={state} court={Number(courtPage[1])} /> : <LiveCourts state={state} />)}
        {tab === 'tabele' && <Tables state={state} />}
        {tab === 'terminarz' && <Schedule state={state} />}
      </main>
      {/* Public pages are view-only: the organiser panel lives at #panel and is not linked from here. */}
      <footer className="footer muted small">
        {t('Wyniki odświeżają się same, nie trzeba przeładowywać strony.')} · <a href={IS_PLATFORM_HOST ? '/' : '#o-systemie'}>{t('O systemie {brand}', { brand: BRAND })}</a>
        {' '}· <LangPicker />
      </footer>
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
      <a className="btn btn-ref" href={`#boisko-${court}`}>{t('Sędziuj na żywo')}</a>
      <a className="btn btn-ref" href={`#wynik-${court}`}>{t('Podaj wynik')}</a>
    </div>
  )
  const current = board.match
  if (!current) {
    return (
      <article className="court court-idle">
        <header><span className="court-no">{t('Boisko {n}', { n: courtLabel(court) })}</span></header>
        <p className="muted">{t('Brak kolejnych meczów')}</p>
      </article>
    )
  }
  const live = board.mode === 'live'
  const finished = board.mode === 'finished'
  const tl = tally(rules, current.sets)
  const multi = rules.sets > 1
  // Points: the set in progress while playing, the final score once finished.
  const shown = current.sets.length > 0 && (live || finished)
  const cur = shown ? current.sets[current.sets.length - 1] : undefined
  const winA = finished && tl.setsA > tl.setsB
  const winB = finished && tl.setsB > tl.setsA
  return (
    <article className={`court mode-${board.mode} ${big ? 'court-big' : ''} ${mine.includes(current.teamA) || mine.includes(current.teamB) ? 'mine' : ''}`}>
      <header>
        {referee || big
          ? <span className="court-no">{t('Boisko {n}', { n: courtLabel(court) })}</span>
          : <a className="court-no court-link" href={`#kolejka-${court}`}>{t('Boisko {n}', { n: courtLabel(court) })}{state.tournament.courtStreams?.[String(court)] && <span title={t('Transmisja na żywo')}> 📺</span>} ›</a>}
        {live && <StatusPill status="live" />}
        {finished && <StatusPill status="finished" />}
        {board.mode === 'next' && <span className="pill pill-next">{t('Następne')}<span className="pill-long"> {t('spotkanie')}</span> · {formatTime(current.start)}</span>}
      </header>
      <p className="court-meta">{categoryName(current.categoryId)} · {stageName(current)} · {formatTime(current.start)}</p>
      <a className="board" href={`#mecz-${current.id}`}>
        <TeamRow name={side(current, 'a')} sets={multi ? tl.setsA : undefined} points={cur?.a} live={shown} win={winA} mine={mine.includes(current.teamA)} />
        <TeamRow name={side(current, 'b')} sets={multi ? tl.setsB : undefined} points={cur?.b} live={shown} win={winB} mine={mine.includes(current.teamB)} />
      </a>
      {live && !current.sets.length && <p className="court-sets muted">{t('Mecz trwa. Wynik pojawi się po meczu.')}</p>}
      {board.mode === 'next' && current.start && (() => {
        const mins = Math.ceil((new Date(current.start).getTime() - now) / 60000)
        return mins > 0 && mins <= 15 ? <p className="court-soon">{t('Zaczyna się za {n} min', { n: mins })}</p> : null
      })()}
      {board.previous && (() => {
        const p = board.previous
        const last = p.sets[p.sets.length - 1]
        return (
          <p className="court-prev muted">
            {t('Poprzedni:')} {side(p, 'a')} <b>{multi ? `${tally(rules, p.sets).setsA}:${tally(rules, p.sets).setsB}` : `${last?.a ?? 0}:${last?.b ?? 0}`}</b> {side(p, 'b')}
          </p>
        )
      })()}
      {multi && current.sets.length > 1 && (live || finished) && (
        <p className="court-sets muted">{t('Sety:')} {current.sets.map((s) => `${s.a}:${s.b}`).join(', ')}</p>
      )}
      {!referee && !big && <a className="court-queue-link" href={`#kolejka-${court}`}>{t('Kolejne mecze na boisku ›')}</a>}
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
      <span className="team-name">{mine && <span className="mine-star" aria-label={t('Obserwowana')}>★ </span>}{name}</span>
      {live && sets !== undefined && <span className="sets" title={t('Wygrane sety')}>{sets}</span>}
      {live && <span className="points">{points ?? 0}</span>}
    </div>
  )
}

/**
 * One court (each group plays on its own court): its board, then every match still to
 * come there in order with its approximate time, then the matches already played.
 */
function CourtPage({ state, court }: { state: State; court: number }) {
  const now = useNow(15000)
  const { categoryName, stageName } = useLookups(state)
  const onCourt = state.matches.filter((m) => m.court === court).sort((a, b) => a.start.localeCompare(b.start))
  if (!onCourt.length) return <p className="muted">{t('Na tym boisku nie ma meczów.')}</p>
  const board = courtBoard(state, court, now)
  const played = onCourt.filter((m) => m.status === 'finished').reverse()
  const first = onCourt[0]
  return (
    <div className="court-page">
      <h2>{t('Boisko {n}', { n: courtLabel(court) })} <span className="muted">· {categoryName(first.categoryId)} · {stageName(first)}</span></h2>
      <StreamPlayer link={state.tournament.courtStreams?.[String(court)]} title={t('Transmisja z boiska {n}', { n: courtLabel(court) })} />
      <CourtCard state={state} court={court} big />
      <CourtQueue state={state} court={court} skip={board.match?.id} />
      {played.length > 0 && (
        <section>
          <h3 className="list-title">{t('Rozegrane na tym boisku')}</h3>
          <MatchList state={state} matches={played} />
        </section>
      )}
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
      <StreamPlayer link={state.tournament.stream} title={t('Transmisja na żywo')} />
      <NextMatch state={state} />
      <h2>{t('Boiska')}</h2>
      <section className="courts">
        {courts.map((c) => <CourtCard key={c} state={state} court={c} />)}
      </section>
      <p className="court-rule">
        ⏱️ {t('Każda grupa gra na swoim boisku, mecz za meczem.')}{' '}
        <b>{t('Następny mecz zaczyna się 2 minuty po zakończeniu meczu, który trwa')}</b>
        {t(': godzina ustawia się sama, gdy sędzia poda wynik. Godziny dalszych meczów są orientacyjne.')}
      </p>
      <Upcoming state={state} />
      <h2>{t('Ostatnie wyniki')}</h2>
      <MatchList state={state} matches={recent} />
    </>
  )
}

/**
 * Every court's next match (after the one on its board), in court order, each with its
 * current time. Kept apart from the boards.
 */
export function Upcoming({ state }: { state: State }) {
  const now = useNow(15000)
  const mine = useFavorites()
  const { categoryName, stageName, side } = useLookups(state)
  const matches = upcomingMatches(state, now)
  const team = (id: string) => (id ? state.teams.find((x) => x.id === id) : undefined)
  return (
    <section className="upcoming">
      <h2>{t('Nadchodzące mecze')}</h2>
      <p className="muted small">{t('Kolejny mecz na każdym boisku. Godzina zmienia się sama: 2 minuty po zakończeniu meczu, który trwa.')}</p>
      {!matches.length && <p className="muted">{t('Brak kolejnych meczów.')}</p>}
      <div className="up-grid">
        {matches.map((m) => (
          <a key={m.id} href={`#mecz-${m.id}`} className={`up-card ${mine.includes(m.teamA) || mine.includes(m.teamB) ? 'mine' : ''}`}>
            <header>
              <span className="up-court">{t('Boisko {n}', { n: courtLabel(m.court) })}</span>
              <b className="up-at">{formatTime(m.start)}</b>
            </header>
            <span className="up-cat">{categoryName(m.categoryId)} · {stageName(m)}</span>
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
    </section>
  )
}

function CategoryChips({ state, value, onChange }: { state: State; value: string; onChange: (id: string) => void }) {
  return (
    <div className="chips" role="tablist" aria-label={t('Kategoria')}>
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
  const rules = state.tournament.rules
  const multi = rules.sets > 1
  const score = isScore(rules)
  const draws = score && !!rules.draws
  const unit = scoreUnit(rules)
  const rows = standings(state.tournament.rules, group, state.matches, state.teams)
  return (
    <div className="table-card">
      {title && <h3><a href={`#grupa-${group.id}`} className="plain-link">{group.name} →</a></h3>}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>#</th><th className="left">{t('Drużyna')}</th><th title={t('Mecze')}>{t('M')}</th><th title={t('Wygrane')}>{t('W')}</th>
              {draws && <th title={t('Remisy')}>{t('R')}</th>}<th title={t('Przegrane')}>{t('P')}</th><th title={t('Punkty')}>{t('Pkt')}</th>{multi && <th title={t('Sety')}>{t('Sety')}</th>}
              <th title={score ? t('Zdobyte i stracone') : t('Stosunek: {unit}', { unit })}>{!score && rules.unit !== 'gemy' ? t('Małe pkt') : unit[0].toUpperCase() + unit.slice(1)}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.teamId}>
                <td className="pos">{i + 1}</td>
                <td className="left">{teamName(r.teamId)}</td>
                <td>{r.played}</td><td>{r.won}</td>{draws && <td>{r.drawn}</td>}<td>{r.lost}</td>
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
        {isScore(state.tournament.rules)
          ? t('Kolejność: punkty, różnica ({unit}), więcej zdobytych, bezpośredni mecz.', { unit: scoreUnit(state.tournament.rules) })
          : t('Kolejność: punkty, stosunek setów, stosunek małych punktów, bezpośredni mecz.')}
      </p>
    </>
  )
}

export function MatchList({ state, matches, onPick }: { state: State; matches: Match[]; onPick?: (m: Match) => void }) {
  const { categoryName, stageName, side } = useLookups(state)
  const mine = useFavorites()
  if (!matches.length) return <p className="muted">{t('Brak meczów.')}</p>
  return (
    <ul className="matches">
      {matches.map((m) => {
        const tl = tally(state.tournament.rules, m.sets)
        const winA = m.status === 'finished' && tl.setsA > tl.setsB
        const winB = m.status === 'finished' && tl.setsB > tl.setsA
        const body = (
          <>
            <span className="m-when">
              <b>{formatTime(m.start)}</b>
              <span className="muted">{t('Boisko {n}', { n: courtLabel(m.court) })}</span>
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
          placeholder={t('Szukaj drużyny, np. Orlik')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="chips">
          <button className={`chip ${cat === '' ? 'active' : ''}`} onClick={() => setCat('')}>{t('Wszystkie')}</button>
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
      {!days.length && <p className="muted">{t('Nic nie znaleziono.')}</p>}
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
        <input id="results-search" type="search" placeholder={t('Szukaj drużyny')} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="chips">
          <button className={`chip ${cat === '' ? 'active' : ''}`} onClick={() => setCat('')}>{t('Wszystkie')}</button>
          {state.categories.map((c) => (
            <button key={c.id} className={`chip ${cat === c.id ? 'active' : ''}`} onClick={() => setCat(c.id)}>{c.name}</button>
          ))}
        </div>
      </div>
      {!list.length && <p className="muted">{t('Jeszcze nie ma zakończonych meczów. Wyniki pojawią się tu zaraz po każdym meczu.')}</p>}
      {!!list.length && (
        <div className="table-card">
          <div className="table-scroll">
            <table className="results">
              <thead>
                <tr>
                  <th className="left">{t('Godz.')}</th>
                  <th className="left">{t('Mecz')}</th>
                  <th>{t('Wynik')}</th>
                  <th className="left hide-narrow">{t('Faza')}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((m) => {
                  const tl = tally(rules, m.sets)
                  const single = m.sets.length === 1
                  return (
                    <tr key={m.id} className={mine.includes(m.teamA) || mine.includes(m.teamB) ? 'mine' : ''}>
                      <td className="left when">
                        <b>{formatTime(m.start)}</b>
                        <span className="muted small">{formatDay(m.start)} · B{courtLabel(m.court)}</span>
                      </td>
                      <td className="left teams">
                        <a href={`#mecz-${m.id}`} className="plain-link">
                          <span className={tl.setsA > tl.setsB ? 'win' : ''}>{side(m, 'a')}</span>
                          <span className={tl.setsB > tl.setsA ? 'win' : ''}>{side(m, 'b')}</span>
                        </a>
                      </td>
                      <td className="score">
                        {single ? (
                          <b>{m.sets[0].a}:{m.sets[0].b}</b>
                        ) : (
                          <>
                            <b>{tl.setsA}:{tl.setsB}</b>
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
