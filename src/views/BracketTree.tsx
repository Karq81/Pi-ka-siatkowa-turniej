import { useFavorites } from '../favorites'
import type { BracketSlot } from '../logic/knockout'
import { tally } from '../logic/scoring'
import type { Match, State } from '../types'
import { courtLabel, formatDay, formatTime, StatusPill, useLookups } from '../ui'
import { TeamBadge } from './Competition'

/**
 * Knockout tier drawn like a tennis draw: rounds side by side, joined by lines.
 * 8 teams: quarter-finals → semi-finals → final, the 3rd place match, and a small
 * draw for places 5–8. 4 teams: semi-finals → final and 3rd place. 2 teams: one match.
 */
export function BracketTree({ state, slots }: { state: State; slots: BracketSlot[] }) {
  const from = slots[0]?.match.ko!.tierFrom ?? 1
  const top = from === 1
  // Keys look like "ko-c1-T9-Q1"; the part after the tier is the position in the draw.
  const byKey = new Map(slots.map((s) => [s.match.id.replace(/^.*-T\d+-/, ''), s.match]))
  const get = (k: string) => byKey.get(k)
  const P = (n: number) => get(`P${n}`)

  if (get('Q1')) {
    return (
      <div className="draw">
        <Tree
          state={state}
          titles={top ? ['Ćwierćfinały', 'Półfinały', 'Finał'] : ['1. runda', '2. runda', `O ${from}. miejsce`]}
          rounds={[['Q1', 'Q2', 'Q3', 'Q4'].map(get), ['W1', 'W2'].map(get), [P(from)]]}
          winnerPlace={from}
        />
        <Extra state={state} title={`Mecz o ${from + 2}. miejsce`} match={P(from + 2)} />
        <h4 className="draw-sub">O miejsca {from + 4}–{from + 7}</h4>
        <Tree
          state={state}
          titles={['Półfinały', `O ${from + 4}. miejsce`]}
          rounds={[['L1', 'L2'].map(get), [P(from + 4)]]}
          winnerPlace={from + 4}
        />
        <Extra state={state} title={`Mecz o ${from + 6}. miejsce`} match={P(from + 6)} />
      </div>
    )
  }
  if (get('S1')) {
    return (
      <div className="draw">
        <Tree
          state={state}
          titles={[top ? 'Półfinały' : '1. runda', top ? 'Finał' : `O ${from}. miejsce`]}
          rounds={[['S1', 'S2'].map(get), [P(from)]]}
          winnerPlace={from}
        />
        <Extra state={state} title={`Mecz o ${from + 2}. miejsce`} match={P(from + 2)} />
      </div>
    )
  }
  return <div className="draw"><Extra state={state} title={top ? 'Finał' : `O ${from}. miejsce`} match={P(from)} /></div>
}

/** Rounds as columns; each pair of matches is joined by a line to the match they feed. */
function Tree({ state, titles, rounds, winnerPlace }: {
  state: State; titles: string[]; rounds: (Match | undefined)[][]; winnerPlace: number
}) {
  const last = rounds[rounds.length - 1][0]
  return (
    <>
    <p className="tree-hint">Przesuń drabinkę w bok, żeby zobaczyć dalsze rundy →</p>
    <div className="tree-scroll">
      <div className="tree" style={{ ['--rounds' as string]: rounds.length }}>
        {rounds.map((round, r) => (
          <div key={r} className={`tree-round ${r === rounds.length - 1 ? 'is-last' : ''}`}>
            <h4>{titles[r]}</h4>
            <div className="tree-body">
              {r === rounds.length - 1 ? (
                <div className="tree-slot"><BMatch state={state} match={round[0]} /></div>
              ) : (
                pairs(round).map((pair, i) => (
                  <div key={i} className="tree-pair">
                    {pair.map((m, j) => <div key={j} className="tree-slot"><BMatch state={state} match={m} /></div>)}
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
        <div className="tree-round tree-winner">
          <h4>&nbsp;</h4>
          <div className="tree-body"><div className="tree-slot"><Champion state={state} match={last} place={winnerPlace} /></div></div>
        </div>
      </div>
    </div>
    </>
  )
}

function pairs<T>(items: T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += 2) out.push(items.slice(i, i + 2))
  return out
}

/** A single placement match shown on its own under a draw. */
function Extra({ state, title, match }: { state: State; title: string; match?: Match }) {
  if (!match) return null
  return (
    <div className="draw-extra">
      <h4>{title}</h4>
      <BMatch state={state} match={match} />
    </div>
  )
}

/** The place won at the end of a draw (e.g. the tournament winner). */
function Champion({ state, match, place }: { state: State; match?: Match; place: number }) {
  const { teamName } = useLookups(state)
  let id = ''
  if (match?.status === 'finished') {
    const t = tally(state.tournament.rules, match.sets)
    id = t.setsA > t.setsB ? match.teamA : t.setsB > t.setsA ? match.teamB : ''
  }
  return (
    <div className={`champ ${id ? 'has' : ''}`}>
      <span className="champ-place">{place === 1 ? '🏆' : `${place}.`}</span>
      <span>{id ? teamName(id) : place === 1 ? 'Zwycięzca' : `${place}. miejsce`}</span>
    </div>
  )
}

/** Compact match box used inside the draw. */
function BMatch({ state, match: m }: { state: State; match?: Match }) {
  const { side } = useLookups(state)
  const mine = useFavorites()
  if (!m) return <div className="bm bm-empty" />
  const rules = state.tournament.rules
  const t = tally(rules, m.sets)
  const cur = m.sets[m.sets.length - 1]
  const single = rules.sets === 1
  const played = m.status !== 'scheduled' && m.sets.length > 0
  const done = m.status === 'finished'
  const team = (id: string) => (id ? state.teams.find((x) => x.id === id) : undefined)
  const row = (s: 'a' | 'b') => {
    const id = s === 'a' ? m.teamA : m.teamB
    const score = single ? (s === 'a' ? cur?.a : cur?.b) : (s === 'a' ? t.setsA : t.setsB)
    const won = done && (s === 'a' ? t.setsA > t.setsB : t.setsB > t.setsA)
    return (
      <div className={`bm-row ${won ? 'won' : ''} ${done && !won ? 'lost' : ''} ${mine.includes(id) ? 'mine' : ''}`}>
        {id ? <TeamBadge team={team(id)} size="sm" /> : <span className="bm-dot" aria-hidden="true" />}
        <span className={`bm-name ${id ? '' : 'tbd'}`}>{side(m, s)}</span>
        <b className="bm-score">{played ? score : ''}</b>
      </div>
    )
  }
  const body = (
    <>
      <header>
        <span>{m.ko!.label}</span>
        {m.status === 'live' ? <StatusPill status="live" /> : m.start && <span>{formatDay(m.start)} {formatTime(m.start)} · B{courtLabel(m.court)}</span>}
      </header>
      {row('a')}
      {row('b')}
    </>
  )
  const cls = `bm ${m.status === 'live' ? 'is-live' : ''}`
  return m.start ? <a className={cls} href={`#mecz-${m.id}`}>{body}</a> : <div className={cls}>{body}</div>
}
