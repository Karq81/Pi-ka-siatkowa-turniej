import { useState } from 'react'
import { tally } from '../logic/scoring'
import type { Match, State } from '../types'
import { formatDay, formatTime, StatusPill, useLookups } from '../ui'
import { GroupTable, MatchList } from './Public'

/** All teams, split into categories and groups. Each group opens its own page. */
export function Groups({ state }: { state: State }) {
  const { teamName } = useLookups(state)
  const [cat, setCat] = useState('')
  const cats = state.categories.filter((c) => !cat || c.id === cat)
  return (
    <>
      <div className="chips">
        <button className={`chip ${cat === '' ? 'active' : ''}`} onClick={() => setCat('')}>Wszystkie</button>
        {state.categories.map((c) => (
          <button key={c.id} className={`chip ${cat === c.id ? 'active' : ''}`} onClick={() => setCat(c.id)}>{c.name}</button>
        ))}
      </div>
      {cats.map((c) => {
        const groups = state.groups.filter((g) => g.categoryId === c.id)
        const teams = groups.reduce((n, g) => n + g.teamIds.length, 0)
        return (
          <section key={c.id}>
            <h2>{c.name} <span className="muted small">{teams} zespołów · {groups.length} grupy</span></h2>
            <div className="group-cards">
              {groups.map((g) => {
                const ms = state.matches.filter((m) => m.groupId === g.id)
                const done = ms.filter((m) => m.status === 'finished').length
                const live = ms.some((m) => m.status === 'live')
                return (
                  <a key={g.id} href={`#grupa-${g.id}`} className={`group-card ${live ? 'is-live' : ''}`}>
                    <header>
                      <b>{g.name}</b>
                      {live ? <StatusPill status="live" /> : <span className="muted small">{done}/{ms.length} meczów</span>}
                    </header>
                    <ol>
                      {g.teamIds.map((id) => <li key={id}>{teamName(id)}</li>)}
                    </ol>
                    <span className="group-cta">Tabela i mecze →</span>
                  </a>
                )
              })}
            </div>
          </section>
        )
      })}
    </>
  )
}

/** One group: table and every match (who plays whom, when, where, result). */
export function GroupPage({ state, groupId }: { state: State; groupId: string }) {
  const { categoryName } = useLookups(state)
  const group = state.groups.find((g) => g.id === groupId)
  if (!group) return <NotFound />
  const matches = state.matches
    .filter((m) => m.groupId === group.id)
    .sort((a, b) => a.start.localeCompare(b.start) || a.court - b.court)
  const days = [...new Set(matches.map((m) => m.start.slice(0, 10)))]
  return (
    <>
      <p><a href="#grupy" className="back">← Wszystkie grupy</a></p>
      <h2 className="page-title">{categoryName(group.categoryId)} · {group.name}</h2>
      <GroupTable state={state} groupId={group.id} title={false} />
      <h2>Mecze</h2>
      {days.map((d) => (
        <section key={d}>
          <h3 className="day-title">{formatDay(d)}</h3>
          <MatchList state={state} matches={matches.filter((m) => m.start.startsWith(d))} />
        </section>
      ))}
    </>
  )
}

/** One match: a big scoreboard that updates live. */
export function MatchPage({ state, matchId }: { state: State; matchId: string }) {
  const { categoryName, stageName, side } = useLookups(state)
  const m = state.matches.find((x) => x.id === matchId)
  if (!m) return <NotFound />
  const rules = state.tournament.rules
  const t = tally(rules, m.sets)
  const cur = m.sets[m.sets.length - 1]
  const single = rules.sets === 1
  const back = m.groupId ? `#grupa-${m.groupId}` : '#drabinka'
  const scoreA = single ? cur?.a : t.setsA
  const scoreB = single ? cur?.b : t.setsB
  return (
    <>
      <p><a href={back} className="back">← {m.groupId ? stageName(m) : 'Drabinka'}</a></p>
      <article className={`match-page ${m.status === 'live' ? 'is-live' : ''}`}>
        <header>
          <span>{categoryName(m.categoryId)} · {stageName(m)}</span>
          <StatusPill status={m.status} />
        </header>
        <p className="muted">{formatDay(m.start)}, godz. {formatTime(m.start)} · Boisko {m.court}</p>
        <div className="mp-board">
          <MatchSide name={side(m, 'a')} score={m.status === 'scheduled' ? undefined : scoreA} win={isWin(m, t, 'a')} />
          <span className="mp-sep">:</span>
          <MatchSide name={side(m, 'b')} score={m.status === 'scheduled' ? undefined : scoreB} win={isWin(m, t, 'b')} />
        </div>
        {m.status === 'live' && !m.sets.length && <p className="center muted">Mecz trwa. Wynik pojawi się po meczu.</p>}
        {!single && m.sets.length > 0 && (
          <p className="center muted">Sety: {m.sets.map((s) => `${s.a}:${s.b}`).join(', ')}</p>
        )}
        {m.status === 'live' && <p className="center muted small">Wynik zmienia się na bieżąco.</p>}
        {m.status === 'scheduled' && <p className="center muted">Mecz jeszcze się nie zaczął.</p>}
      </article>
    </>
  )
}

function isWin(m: Match, t: ReturnType<typeof tally>, s: 'a' | 'b') {
  if (m.status !== 'finished') return false
  return s === 'a' ? t.setsA > t.setsB : t.setsB > t.setsA
}

function MatchSide({ name, score, win }: { name: string; score?: number; win: boolean }) {
  return (
    <div className={`mp-side ${win ? 'mp-win' : ''}`}>
      <span className="mp-score">{score ?? '–'}</span>
      <span className="mp-name">{name}</span>
    </div>
  )
}

function NotFound() {
  return <p className="muted">Nie znaleziono. <a href="#grupy">Wróć do grup</a>.</p>
}
