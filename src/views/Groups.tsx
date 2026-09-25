import { tally } from '../logic/scoring'
import type { Match, State } from '../types'
import { CorrectButton } from './Correction'
import { BackBar, formatDay, formatTime, StatusPill, useLookups } from '../ui'

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
      <BackBar fallback={back.slice(1)} label={m.groupId ? stageName(m) : 'Faza pucharowa'} />
      <article className={`match-page ${m.status === 'live' ? 'is-live' : ''}`}>
        <header>
          <span>{categoryName(m.categoryId)} · {stageName(m)}</span>
          <StatusPill status={m.status} />
        </header>
        <p className="muted">{formatDay(m.start)}, godz. {formatTime(m.start)} · Boisko {m.court}</p>
        <div className="mp-board">
          <MatchSide teamId={m.teamA} name={side(m, 'a')} score={m.status === 'scheduled' ? undefined : scoreA} win={isWin(m, t, 'a')} />
          <span className="mp-sep">:</span>
          <MatchSide teamId={m.teamB} name={side(m, 'b')} score={m.status === 'scheduled' ? undefined : scoreB} win={isWin(m, t, 'b')} />
        </div>
        <div className="center"><CorrectButton match={m} /></div>
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

/** Team names lead to the team's page (its other matches), once the team is known. */
function MatchSide({ teamId, name, score, win }: { teamId: string; name: string; score?: number; win: boolean }) {
  return (
    <div className={`mp-side ${win ? 'mp-win' : ''}`}>
      <span className="mp-score">{score ?? '–'}</span>
      {teamId
        ? <a className="mp-name" href={`#druzyna-${teamId}`}>{name} ›</a>
        : <span className="mp-name">{name}</span>}
    </div>
  )
}

function NotFound() {
  return <p className="muted">Nie znaleziono. <a href="#grupy">Wróć do rozgrywek</a>.</p>
}
