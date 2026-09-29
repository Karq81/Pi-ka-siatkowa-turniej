import { t } from '../i18n'
import { useState, type ReactNode } from 'react'
import { profileRules } from '../logic/profiles'
import { rulesTablePoints } from '../logic/scoring'
import { logged } from '../logic/special'
import { SPORTS, sportLabelOf } from '../logic/sports'
import { store } from '../store/store'
import type { Match, Rules, State } from '../types'
import { ConfirmDialog, NumberField, useLookups } from '../ui'

/*
 * Table points: the discipline's rules are the default, but the organiser may type any
 * points – for the whole tournament, for one match, or as a penalty or bonus for a team.
 * Nothing is blocked; when the points differ from the discipline's rules, the site asks first.
 */

/** The discipline's own table points (from its rules profile), or null for a discipline of the organiser's own. */
export function rulesPoints(rules: Rules): Partial<Rules> | null {
  const profile = SPORTS.find((s) => s.label === rules.sport)?.profile
  return profile ? profileRules(profile) : null
}

const fmt = (n: number | undefined) => String(n ?? 0).replace('.', ',')

type PointKey = 'pointsWin' | 'pointsDraw' | 'pointsLoss' | 'pointsOvertimeWin' | 'pointsOvertimeLoss' | 'pointsWalkoverLoss' | 'byePoints'

/** A question before a change that does not follow the discipline's rules, then the change. */
function useAsk() {
  const [ask, setAsk] = useState<{ q: ReactNode; go: () => void } | null>(null)
  const dialog = ask && (
    <ConfirmDialog
      question={<>{ask.q}<br />{t('Zapisać mimo to?')}</>}
      yes={t('Tak, zapisz')}
      onYes={() => { const go = ask.go; setAsk(null); go() }}
      onNo={() => setAsk(null)}
    />
  )
  return { ask: (q: ReactNode, go: () => void) => setAsk({ q, go }), dialog }
}

/** Settings: table points for every kind of result, with the discipline's rules shown next to them. */
export function PointsSettings({ state }: { state: State }) {
  const r = state.tournament.rules
  const law = rulesPoints(r)
  const sport = sportLabelOf(r)
  const { ask, dialog } = useAsk()
  const save = (patch: Partial<Rules>) => store.updateTournament({ rules: { ...state.tournament.rules, ...patch } })
  // The value the rules give for a field (overtime and walkover points fall back to win / loss).
  const lawOf = (k: PointKey): number | undefined => {
    if (!law) return undefined
    if (k === 'pointsOvertimeWin') return law.pointsOvertimeWin ?? law.pointsWin
    if (k === 'pointsOvertimeLoss') return law.pointsOvertimeLoss ?? law.pointsLoss
    if (k === 'pointsWalkoverLoss') return law.pointsWalkoverLoss ?? law.pointsLoss
    if (k === 'byePoints') return law.byePoints ?? law.pointsWin
    return law[k]
  }
  const current = (k: PointKey): number => {
    if (k === 'pointsOvertimeWin') return r.pointsOvertimeWin ?? r.pointsWin
    if (k === 'pointsOvertimeLoss') return r.pointsOvertimeLoss ?? r.pointsLoss
    if (k === 'pointsWalkoverLoss') return r.pointsWalkoverLoss ?? r.pointsLoss
    if (k === 'byePoints') return r.byePoints ?? r.pointsWin
    return r[k]
  }
  const change = (k: PointKey, label: string, v: number) => {
    const expected = lawOf(k)
    if (expected !== undefined && v !== expected) {
      ask(<>{t('Według przepisów ({sport}) {what}: {law} pkt, a wpisujesz {value} pkt.', { sport, what: label.toLowerCase(), law: fmt(expected), value: fmt(v) })}</>, () => save({ [k]: v }))
    } else save({ [k]: v })
  }
  const field = (k: PointKey, label: string) => (
    <label key={k}>{label}
      <NumberField lazy decimals min={-99} max={99} value={current(k)} onChange={(v) => change(k, label, v)} />
      {lawOf(k) !== undefined && lawOf(k) !== current(k) && <span className="muted small">{t('w przepisach: {n}', { n: fmt(lawOf(k)) })}</span>}
    </label>
  )
  const score = r.scoring === 'score'
  const volley = r.scoring === 'sets' || r.scoring === undefined
  const differs = !!law && (['pointsWin', 'pointsDraw', 'pointsLoss', 'pointsOvertimeWin', 'pointsOvertimeLoss', 'pointsWalkoverLoss', 'byePoints'] as PointKey[]).some((k) => lawOf(k) !== current(k))
    || (!!law && !!law.tieBreakSplit !== !!r.tieBreakSplit)
  return (
    <div className="points-settings">
      <div className="form-grid">
        {field('pointsWin', t('Pkt w tabeli za wygraną'))}
        {field('pointsDraw', t('Pkt za remis'))}
        {field('pointsLoss', t('Pkt za przegraną'))}
        {score && field('pointsOvertimeWin', t('Wygrana po dogrywce lub karnych'))}
        {score && field('pointsOvertimeLoss', t('Przegrana po dogrywce lub karnych'))}
        {field('pointsWalkoverLoss', t('Przegrana walkowerem'))}
        {field('byePoints', t('Wolny los'))}
      </div>
      {volley && (
        <label className="check">
          <input type="checkbox" checked={!!r.tieBreakSplit} onChange={(e) => {
            const on = e.target.checked
            if (law && !!law.tieBreakSplit !== on) ask(<>{on ? t('W przepisach ({sport}) wygrana w decydującym secie daje tyle samo punktów co każda inna.', { sport }) : t('W przepisach ({sport}) wygrana w decydującym secie (3:2) daje 2 pkt, a przegrana 1 pkt.', { sport })}</>, () => save({ tieBreakSplit: on }))
            else save({ tieBreakSplit: on })
          }} />
          {t('Wygrana w decydującym secie (np. 3:2): zwycięzca 1 pkt mniej, przegrany 1 pkt więcej')}
        </label>
      )}
      {differs && law && (
        <button type="button" className="btn btn-sm" onClick={() => save({
          pointsWin: law.pointsWin, pointsDraw: law.pointsDraw, pointsLoss: law.pointsLoss, tieBreakSplit: !!law.tieBreakSplit,
          pointsOvertimeWin: law.pointsOvertimeWin ?? law.pointsWin, pointsOvertimeLoss: law.pointsOvertimeLoss ?? law.pointsLoss,
          pointsWalkoverLoss: law.pointsWalkoverLoss ?? law.pointsLoss, byePoints: law.byePoints ?? law.pointsWin,
        } as Partial<Rules>)}>{t('Przywróć punktację z przepisów ({sport})', { sport })}</button>
      )}
      {dialog}
    </div>
  )
}

/** One match: the organiser gives the table points by hand (and can go back to the rules'). */
export function ManualPoints({ state, match }: { state: State; match: Match }) {
  const { side } = useLookups(state)
  const rules = state.tournament.rules
  const [a, b] = rulesTablePoints(rules, match)
  const [pa, setPa] = useState(match.manualPoints?.[0] ?? a)
  const [pb, setPb] = useState(match.manualPoints?.[1] ?? b)
  const { ask, dialog } = useAsk()
  if (match.status !== 'finished' || match.ko || !match.teamA || !match.teamB || match.bye) return null
  const store2 = (v: [number, number] | null) => {
    store.updateMatch(match.id, (m) => {
      const { manualPoints: _old, ...rest } = m
      void _old
      return v ? { ...rest, manualPoints: v } : rest
    })
    store.updateTournament({ log: logged(state.tournament, v
      ? t('Punkty ręcznie: {a} – {b}, {pa}:{pb} pkt', { a: side(match, 'a'), b: side(match, 'b'), pa: fmt(v[0]), pb: fmt(v[1]) })
      : t('Punkty z przepisów: {a} – {b}', { a: side(match, 'a'), b: side(match, 'b') })) })
  }
  return (
    <details className="pair-edit manual-points" open={!!match.manualPoints}>
      <summary>{t('Punkty do tabeli ręcznie')}{match.manualPoints ? ` · ${fmt(match.manualPoints[0])}:${fmt(match.manualPoints[1])}` : ''}</summary>
      <p className="muted small">{t('Z wyniku według zasad turnieju: {a}:{b} pkt.', { a: fmt(a), b: fmt(b) })}</p>
      <div className="form-row">
        <label>{side(match, 'a')}<NumberField decimals min={-99} max={99} value={pa} onChange={setPa} /></label>
        <label>{side(match, 'b')}<NumberField decimals min={-99} max={99} value={pb} onChange={setPb} /></label>
      </div>
      <div className="actions">
        <button type="button" className="btn" onClick={() => {
          if (pa !== a || pb !== b) ask(<>{t('Według zasad turnieju ten wynik daje {a}:{b} pkt, a wpisujesz {pa}:{pb} pkt.', { a: fmt(a), b: fmt(b), pa: fmt(pa), pb: fmt(pb) })}</>, () => store2([pa, pb]))
          else store2(null)
        }}>{t('Zapisz punkty')}</button>
        {match.manualPoints && <button type="button" className="btn" onClick={() => { setPa(a); setPb(b); store2(null) }}>{t('Wróć do punktów z przepisów')}</button>}
      </div>
      {dialog}
    </details>
  )
}

/** Penalties and bonuses: points added to or taken from a team's table total, with the reason. */
export function PointsAdjustPanel({ state }: { state: State }) {
  const teams = state.teams.filter((x) => !x.pair)
  const [teamId, setTeamId] = useState('')
  const [points, setPoints] = useState(-3)
  const [reason, setReason] = useState('')
  const { ask, dialog } = useAsk()
  const cat = (id: string) => state.categories.find((c) => c.id === id)?.name ?? ''
  const set = (id: string, adjust: { points: number; reason: string } | null) => {
    const team = teams.find((x) => x.id === id)
    if (!team) return
    void store.replace({
      ...state,
      teams: state.teams.map((x) => {
        if (x.id !== id) return x
        const { adjust: _old, ...rest } = x
        void _old
        return adjust ? { ...rest, adjust } : rest
      }),
      tournament: { ...state.tournament, log: logged(state.tournament, adjust
        ? t('Korekta punktów: {team} {points} pkt ({reason})', { team: team.name, points: adjust.points > 0 ? `+${fmt(adjust.points)}` : fmt(adjust.points), reason: adjust.reason })
        : t('Korekta punktów usunięta: {team}', { team: team.name })) },
    })
  }
  const withAdjust = teams.filter((x) => x.adjust)
  return (
    <section className="panel">
      <h2>{t('Kary i bonusy w tabeli')}</h2>
      <p className="muted small">{t('Punkty dodane albo odjęte drużynie niezależnie od wyników (np. −3 za oddany mecz, +1 za fair play).')}</p>
      <div className="form-row">
        <label>{t('Drużyna')}
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">—</option>
            {teams.map((x) => <option key={x.id} value={x.id}>{x.name}{state.categories.length > 1 ? ` (${cat(x.categoryId)})` : ''}</option>)}
          </select>
        </label>
        <label>{t('Punkty (+ lub −)')}<NumberField decimals min={-99} max={99} value={points} onChange={setPoints} /></label>
        <label>{t('Powód')}<input value={reason} maxLength={60} onChange={(e) => setReason(e.target.value)} placeholder={t('np. walkower, niesportowe zachowanie')} /></label>
      </div>
      <button className="btn" disabled={!teamId || !points} onClick={() => {
        const go = () => { set(teamId, { points, reason: reason.trim() || t('decyzja organizatora') }); setTeamId(''); setReason('') }
        // Not in any discipline's rules, so always one question first.
        ask(<>{t('Drużyna „{team}” dostanie {points} pkt w tabeli, poza wynikami meczów.', { team: teams.find((x) => x.id === teamId)?.name ?? '', points: points > 0 ? `+${fmt(points)}` : fmt(points) })}</>, go)
      }}>{t('Zapisz korektę')}</button>
      {withAdjust.length > 0 && (
        <ul className="change-log">
          {withAdjust.map((x) => (
            <li key={x.id}>
              <b>{x.name}</b> {x.adjust!.points > 0 ? `+${fmt(x.adjust!.points)}` : fmt(x.adjust!.points)} {t('pkt')} · {x.adjust!.reason}{' '}
              <button type="button" className="linklike" onClick={() => set(x.id, null)}>{t('Usuń')}</button>
            </li>
          ))}
        </ul>
      )}
      {dialog}
    </section>
  )
}
