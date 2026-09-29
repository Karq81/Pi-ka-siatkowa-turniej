import { t } from '../i18n'
import { useState } from 'react'
import { asWalkover, canWalkover, logged, playedAfter, statusLabel, withdrawTeam } from '../logic/special'
import { laterPhaseStarted, refreshedNextPhase } from '../logic/phases'
import { store } from '../store/store'
import type { Match, State } from '../types'
import { ConfirmDialog, formatDay, formatTime, useLookups } from '../ui'

/** "Walkover for A / for B": the discipline's walkover score, one tap and a question. */
export function WalkoverButtons({ state, match, onDone }: { state: State; match: Match; onDone?: () => void }) {
  const { side } = useLookups(state)
  const [asking, setAsking] = useState<'a' | 'b' | null>(null)
  if (!canWalkover(state.tournament.rules) || !match.teamA || !match.teamB) return null
  const winner = asking === 'a' ? side(match, 'a') : side(match, 'b')
  return (
    <div className="walkover">
      <span className="muted small">{t('Rywal nie przyjechał?')}</span>
      <button type="button" className="btn btn-sm" onClick={() => setAsking('a')}>{t('Walkower dla: {team}', { team: side(match, 'a') })}</button>
      <button type="button" className="btn btn-sm" onClick={() => setAsking('b')}>{t('Walkower dla: {team}', { team: side(match, 'b') })}</button>
      {asking && (
        <ConfirmDialog
          question={<>{t('Zapisać walkower dla: {team}?', { team: winner })}</>}
          yes={t('Tak, walkower')}
          onYes={() => {
            const aWins = asking === 'a'
            setAsking(null)
            store.updateMatch(match.id, (m) => asWalkover(state.tournament.rules, m, aWins))
            store.updateTournament({ log: logged(state.tournament, t('Walkower: {a} – {b}, wygrywa {w}', { a: side(match, 'a'), b: side(match, 'b'), w: winner })) })
            onDone?.()
          }}
          onNo={() => setAsking(null)}
        />
      )}
    </div>
  )
}

/**
 * After a result was saved or corrected: when the next phase was declared but has not
 * started, it is made again from the new tables (Albatros CUP second stage).
 */
export function refreshAfterCorrection(matchId: string) {
  const s = store.get()
  const m = s.matches.find((x) => x.id === matchId)
  if (!m) return
  const next = refreshedNextPhase(s, m)
  if (next) void store.replace(next)
}

/** Why a result cannot be set back to "not played": the next phase already started. */
export function PhaseLockNote({ state, match }: { state: State; match: Match }) {
  const later = laterPhaseStarted(state, match)
  if (!later.length || match.status === 'scheduled') return null
  return (
    <p className="notice-inline">
      {t('Następna faza już się zaczęła ({n} mecz. rozegranych lub trwających), więc tego wyniku nie można cofnąć ani usunąć. Można go tylko poprawić.', { n: later.length })}
    </p>
  )
}

/** A result corrected after later rounds were played: they are not changed by themselves. */
export function LaterRoundsWarning({ state, match }: { state: State; match: Match }) {
  const { side } = useLookups(state)
  const later = playedAfter(state, match.id)
  if (!later.length) return null
  return (
    <p className="notice-inline warn">
      <b>{t('Uwaga: z tego meczu grano już dalej.')}</b>{' '}
      {t('Poprawka nie zmieni drużyn w meczach, które się odbyły lub trwają:')}{' '}
      {later.map((m) => `${m.ko?.label ?? ''} (${side(m, 'a')} – ${side(m, 'b')})`).join(', ')}.{' '}
      {t('Jeśli trzeba, zmień je ręcznie w „Mecze i poprawki”.')}
    </p>
  )
}

/** The organiser changes a scheduled match's teams by hand (the bracket then leaves them). */
export function PairEditor({ state, match }: { state: State; match: Match }) {
  const { side } = useLookups(state)
  const teams = state.teams.filter((x) => x.categoryId === match.categoryId && !x.pair)
  const [a, setA] = useState(match.teamA)
  const [b, setB] = useState(match.teamB)
  const [msg, setMsg] = useState('')
  if (match.status !== 'scheduled') return null
  const name = (id: string) => teams.find((x) => x.id === id)?.name ?? '—'
  return (
    <details className="pair-edit">
      <summary>{t('Zmień drużyny w tym meczu')}</summary>
      <div className="form-row">
        <label>{t('Drużyna A')}
          <select value={a} onChange={(e) => setA(e.target.value)}>
            <option value="">—</option>
            {teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        <label>{t('Drużyna B')}
          <select value={b} onChange={(e) => setB(e.target.value)}>
            <option value="">—</option>
            {teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
      </div>
      <button type="button" className="btn" disabled={!a || !b || a === b} onClick={() => {
        store.updateMatch(match.id, (m) => ({ ...m, teamA: a, teamB: b, ...(m.ko ? { manual: true } : {}) }))
        store.updateTournament({ log: logged(state.tournament, t('Zmiana pary: {before} → {after}', { before: `${side(match, 'a')} – ${side(match, 'b')}`, after: `${name(a)} – ${name(b)}` })) })
        setMsg(t('Zapisano.'))
      }}>{t('Zapisz drużyny')}</button>
      {msg && <p className="ok">{msg}</p>}
    </details>
  )
}

/** A team withdraws or is disqualified during the tournament. */
export function WithdrawPanel({ state }: { state: State }) {
  const [teamId, setTeamId] = useState('')
  const [asking, setAsking] = useState<'withdrawn' | 'disqualified' | null>(null)
  const option = state.tournament.withdrawal ?? 'A'
  const cat = (id: string) => state.categories.find((c) => c.id === id)?.name ?? ''
  const teams = state.teams.filter((x) => !x.pair)
  const team = teams.find((x) => x.id === teamId)
  return (
    <section className="panel">
      <h2>{t('Wycofanie lub dyskwalifikacja')}</h2>
      <label>{t('Gdy drużyna wycofa się w trakcie')}
        <select value={option} onChange={(e) => store.updateTournament({ withdrawal: e.target.value as 'A' | 'B' })}>
          <option value="A">{t('Rozegrała mniej niż połowę meczów: jej wyniki znikają z tabel; więcej: reszta jako walkowery')}</option>
          <option value="B">{t('Zawsze: pozostałe mecze jako walkowery dla rywali')}</option>
        </select>
      </label>
      <label>{t('Drużyna')}
        <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          <option value="">—</option>
          {teams.map((x) => <option key={x.id} value={x.id} disabled={!!x.status && x.status !== 'active'}>{x.name}{state.categories.length > 1 ? ` (${cat(x.categoryId)})` : ''}{statusLabel(x) ? ` · ${statusLabel(x)}` : ''}</option>)}
        </select>
      </label>
      <div className="actions">
        <button className="btn" disabled={!team} onClick={() => setAsking('withdrawn')}>{t('Wycofaj')}</button>
        <button className="btn btn-danger" disabled={!team} onClick={() => setAsking('disqualified')}>{t('Zdyskwalifikuj')}</button>
      </div>
      {asking && team && (
        <ConfirmDialog
          question={<>{asking === 'withdrawn' ? t('Wycofać drużynę „{team}”? Tego nie da się cofnąć jednym kliknięciem.', { team: team.name }) : t('Zdyskwalifikować drużynę „{team}”? Tego nie da się cofnąć jednym kliknięciem.', { team: team.name })}</>}
          yes={asking === 'withdrawn' ? t('Tak, wycofaj') : t('Tak, zdyskwalifikuj')}
          onYes={() => { const s = asking; setAsking(null); setTeamId(''); void store.replace(withdrawTeam(state, team.id, s)) }}
          onNo={() => setAsking(null)}
        />
      )}
    </section>
  )
}

/** What the organiser changed, the newest first. */
export function ChangeLog({ state }: { state: State }) {
  const log = [...(state.tournament.log ?? [])].reverse()
  if (!log.length) return null
  return (
    <section className="panel">
      <h2>{t('Historia zmian')}</h2>
      <ul className="change-log">
        {log.slice(0, 50).map((x, i) => {
          const d = new Date(x.at)
          const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
          return <li key={i}><span className="muted small">{formatDay(iso)} {formatTime(iso)}</span> {x.text}</li>
        })}
      </ul>
    </section>
  )
}
