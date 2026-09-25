import { useState } from 'react'
import { bracketView, ROUND_NAMES, sourceLabel, type BracketSlot } from '../logic/knockout'
import { tally } from '../logic/scoring'
import type { KoRound, KoSource, State } from '../types'
import { formatDay, formatTime, StatusPill, useLookups } from '../ui'

const COLUMNS: KoRound[] = ['QF', 'SF', 'F']

export function Bracket({ state }: { state: State }) {
  const [cat, setCat] = useState(state.categories[0]?.id ?? '')
  return (
    <>
      <div className="chips" role="tablist" aria-label="Kategoria">
        {state.categories.map((c) => (
          <button key={c.id} role="tab" aria-selected={cat === c.id} className={`chip ${cat === c.id ? 'active' : ''}`} onClick={() => setCat(c.id)}>
            {c.name}
          </button>
        ))}
      </div>
      <BracketBoard state={state} categoryId={cat} />
    </>
  )
}

/** Bracket of one category: quarter-finals → semi-finals → final, plus the 3rd place match. */
export function BracketBoard({ state, categoryId }: { state: State; categoryId: string }) {
  const slots = bracketView(state, categoryId)
  const projected = slots?.some((s) => s.projected)
  return (
    <>
      {!slots && <p className="muted">Dla tej liczby grup drabinka nie jest jeszcze przygotowana.</p>}
      {slots && projected && (
        <p className="notice-inline">
          Podgląd na podstawie aktualnych tabel. Drabinka ustali się po zakończeniu meczów grupowych.
        </p>
      )}
      {slots && (
        <div className="bracket-scroll">
          <div className="bracket">
            {COLUMNS.filter((r) => slots.some((s) => s.match.ko?.round === r)).map((round) => (
              <section key={round} className={`bracket-col round-${round}`}>
                <h3>{ROUND_NAMES[round]}</h3>
                <div className="bracket-matches">
                  {slots.filter((s) => s.match.ko?.round === round).map((s) => (
                    <BracketMatch key={s.match.id} state={state} slot={s} />
                  ))}
                </div>
              </section>
            ))}
          </div>
          {slots.filter((s) => s.match.ko?.round === '3P').map((s) => (
            <div key={s.match.id} className="bracket-third">
              <BracketMatch state={state} slot={s} />
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function BracketMatch({ state, slot }: { state: State; slot: BracketSlot }) {
  const { teamName } = useLookups(state)
  const m = slot.match
  const rules = state.tournament.rules
  const t = tally(rules, m.sets)
  const done = m.status === 'finished'
  const single = rules.sets === 1
  const row = (id: string, src: KoSource, sets: number, won: boolean) => {
    // A team from a group table is provisional until that group has finished.
    const provisional = !!id && src.kind === 'group' && (slot.projected || !groupDone(state, src.groupId))
    return (
      <div className={`b-team ${won ? 'b-won' : ''} ${!id ? 'b-tbd' : ''}`}>
        <span className="b-name">
          {id ? teamName(id) : sourceLabel(state, src)}
          {id && provisional && <small>{sourceLabel(state, src)} (obecnie)</small>}
        </span>
        {m.status !== 'scheduled' && <span className="b-sets">{sets}</span>}
      </div>
    )
  }
  return (
    <article className={`b-match ${m.status === 'live' ? 'b-live' : ''}`}>
      <header>
        <span>{m.ko!.label}</span>
        {m.status === 'live' ? <StatusPill status="live" /> : m.start && <span>{formatDay(m.start)} {formatTime(m.start)} · B{m.court}</span>}
      </header>
      {/* Single-set matches show the points, longer matches the sets won. */}
      {row(m.teamA, m.ko!.srcA, single ? m.sets[0]?.a ?? 0 : t.setsA, done && t.setsA > t.setsB)}
      {row(m.teamB, m.ko!.srcB, single ? m.sets[0]?.b ?? 0 : t.setsB, done && t.setsB > t.setsA)}
    </article>
  )
}

function groupDone(state: State, groupId: string) {
  return state.matches.every((m) => m.groupId !== groupId || m.status === 'finished')
}
