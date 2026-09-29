import { t } from '../i18n'
import { useState } from 'react'
import {
  challengeProblem, currentRound, kingNext, kingTable, ladderChallenge, ladderOrder, nextPadelRound,
  openRec, padelTable, recGroupId, recreationalOf, type PlayerRow,
} from '../logic/recreational'
import { store, useSession } from '../store/store'
import type { State } from '../types'
import { MatchCard } from './Competition'

/**
 * Americano, Mexicano, king of the court and the ladder: the table (players' own points,
 * crowns, ladder places), the chief referee's button for the next round or match, and the
 * matches, the newest first.
 */
export function RecView({ state, categoryId }: { state: State; categoryId: string }) {
  const session = useSession()
  const admin = session?.role === 'admin'
  const sys = recreationalOf(state.tournament)!
  const name = (id: string) => state.teams.find((x) => x.id === id)?.name ?? ''
  const open = openRec(state, categoryId)
  const round = currentRound(state, categoryId)
  const matches = state.matches.filter((m) => m.groupId === recGroupId(categoryId) && !m.skipped)
    .sort((a, b) => (b.swissRound ?? 0) - (a.swissRound ?? 0) || a.court - b.court)
  const rows: PlayerRow[] = sys === 'king' ? kingTable(state, categoryId)
    : sys === 'ladder' ? ladderOrder(state, categoryId).map((id, i) => ({ teamId: id, played: 0, won: 0, points: 0, diff: 0, place: i + 1 }))
      : padelTable(state, categoryId)
  const next = () => {
    if (sys === 'king') {
      const m = kingNext(state, categoryId)
      if (m) void store.replace({ ...state, matches: [...state.matches, m] })
    } else {
      void store.replace({ ...state, matches: [...state.matches, ...nextPadelRound(state, categoryId)] })
    }
  }
  const legend = sys === 'king' ? t('Zwycięzca zostaje na korcie, przegrany idzie na koniec kolejki. Liczą się wygrane, potem najdłuższa seria.')
    : sys === 'ladder' ? t('Zawodnik wyzywa kogoś najwyżej 3 miejsca wyżej. Gdy wygra, zajmuje jego miejsce, a reszta schodzi o jedno niżej.')
      : sys === 'mexicano' ? t('Każdy zbiera punkty zdobyte przez swoją parę. Od 2. rundy pary według tabeli: 1. i 4. przeciw 2. i 3.')
        : t('Co rundę inny partner. Każdy zbiera punkty zdobyte przez swoją parę.')
  return (
    <div className="rec">
      <section className="standings perf-table">
        <header>
          <h3>{sys === 'ladder' ? t('Drabinka rankingowa') : t('Tabela')}</h3>
          {sys !== 'ladder' && <span className="muted small">{sys === 'king' ? t('Mecze: {n}', { n: round }) : t('Runda {n}', { n: round })}</span>}
        </header>
        <ol>
          {rows.map((r) => (
            <li key={r.teamId} className={r.place <= 3 ? 'top' : ''}>
              <span className="pos">{r.place}</span>
              <span className="name">{name(r.teamId)}{r.king && ' 👑'}</span>
              {sys === 'king' && <span className="perf-att muted small">{t('wygrane {w} · najdłuższa seria {s} · mecze {p}', { w: r.won, s: r.streak ?? 0, p: r.played })}</span>}
              {(sys === 'americano' || sys === 'mexicano') && <span className="perf-att muted small">{t('mecze {p} · wygrane {w} · różnica {d}', { p: r.played, w: r.won, d: r.diff > 0 ? `+${r.diff}` : r.diff })}</span>}
              {sys !== 'ladder' && <b className="pts">{sys === 'king' ? r.won : r.points}</b>}
            </li>
          ))}
        </ol>
        <p className="legend muted small">{legend}</p>
      </section>
      {admin && sys !== 'ladder' && (
        <div className="actions">
          <button className={`btn btn-primary ${open.length ? '' : 'btn-pulse'}`} disabled={open.length > 0} onClick={next}>
            {sys === 'king' ? t('Następny mecz') : t('Losuj rundę {r}', { r: round + 1 })}
          </button>
          {open.length > 0 && <span className="muted small">{t('Najpierw wpisz wyniki trwającej rundy ({n}).', { n: open.length })}</span>}
        </div>
      )}
      {admin && sys === 'ladder' && <ChallengeForm state={state} categoryId={categoryId} />}
      <h3 className="list-title">{t('Mecze')}</h3>
      <div className="cards">
        {matches.map((m) => <MatchCard key={m.id} state={state} match={m} label={sys === 'king' ? t('Mecz {n}', { n: m.swissRound ?? 0 }) : sys === 'ladder' ? t('Wyzwanie') : t('Runda {r}', { r: m.swissRound ?? 0 })} />)}
      </div>
    </div>
  )
}

function ChallengeForm({ state, categoryId }: { state: State; categoryId: string }) {
  const order = ladderOrder(state, categoryId)
  const name = (id: string) => state.teams.find((x) => x.id === id)?.name ?? ''
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const problem = a && b ? challengeProblem(state, categoryId, a, b) : ''
  return (
    <section className="panel">
      <h3>{t('Nowe wyzwanie')}</h3>
      <div className="form-row">
        <label>{t('Wyzywa')}
          <select value={a} onChange={(e) => { setA(e.target.value); setB('') }}>
            <option value="">—</option>
            {order.map((id, i) => <option key={id} value={id}>{i + 1}. {name(id)}</option>)}
          </select>
        </label>
        <label>{t('Kogo (wyżej na liście)')}
          <select value={b} onChange={(e) => setB(e.target.value)}>
            <option value="">—</option>
            {order.map((id, i) => <option key={id} value={id} disabled={!a || !!challengeProblem(state, categoryId, a, id)}>{i + 1}. {name(id)}</option>)}
          </select>
        </label>
      </div>
      {problem && <p className="error">{problem}</p>}
      <button className="btn btn-primary" disabled={!a || !b || !!problem} onClick={() => {
        void store.replace({ ...state, matches: [...state.matches, ladderChallenge(state, categoryId, a, b)] })
        setA(''); setB('')
      }}>{t('Dodaj wyzwanie')}</button>
    </section>
  )
}
