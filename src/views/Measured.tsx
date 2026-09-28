import { t } from '../i18n'
import { useState } from 'react'
import {
  addRound, editValue, finalId, formatValue, heatsDone, heatsOf, makeFinal, measuredPlaces, measureOf,
  parseValue, qualifiers, rankGroup, seriesStandings, withPerf,
} from '../logic/measured'
import { store, useSession } from '../store/store'
import type { Group, Perf, State } from '../types'
import { ConfirmDialog } from '../ui'

/**
 * A measured event (runs, jumps, golf, races…): tabs for the heats or rounds, the final and
 * the classification. The chief referee types the results straight into the tables.
 */
export function MeasuredView({ state, categoryId }: { state: State; categoryId: string }) {
  const session = useSession()
  const admin = session?.role === 'admin'
  const groups = state.groups.filter((g) => g.categoryId === categoryId)
  const rounds = state.tournament.measured?.mode === 'rounds'
  const [tab, setTab] = useState<string>('')
  const current = groups.find((g) => g.id === tab)
  const showing = current ?? (tab === 'klas' ? null : groups.find((g) => g.id === finalId(categoryId)) ?? groups[0])
  const [asking, setAsking] = useState(false)
  const hasFinal = groups.some((g) => g.id === finalId(categoryId))
  if (!groups.length) return <p className="notice-inline">{t('Serie pojawią się tutaj po losowaniu.')}</p>
  return (
    <div className="measured">
      <div className="seg seg-groups" role="tablist" aria-label={t('Serie')}>
        {groups.map((g) => (
          <button key={g.id} role="tab" aria-selected={showing?.id === g.id} className={showing?.id === g.id ? 'on' : ''} onClick={() => setTab(g.id)}>{g.name}</button>
        ))}
        <button role="tab" aria-selected={!showing} className={!showing ? 'on' : ''} onClick={() => setTab('klas')}>{t('Klasyfikacja')}</button>
      </div>
      {showing ? <PerfTable state={state} group={showing} admin={admin} /> : <Classification state={state} categoryId={categoryId} />}
      {admin && !rounds && !hasFinal && (state.tournament.measured?.Q || state.tournament.measured?.q) ? (
        <div className="actions">
          <button className={`btn btn-primary ${heatsDone(state, categoryId) ? 'btn-pulse' : ''}`} onClick={() => setAsking(true)}>
            {t('Utwórz finał ({n} zawodników)', { n: qualifiers(state, categoryId).size })}
          </button>
        </div>
      ) : null}
      {admin && rounds && (
        <div className="actions">
          <button className="btn" onClick={() => void store.replace(addRound(state, categoryId))}>{t('Dodaj kolejną rundę')}</button>
        </div>
      )}
      {asking && (
        <ConfirmDialog
          question={<>{heatsDone(state, categoryId) ? t('Utworzyć finał z zawodników z awansem (Q i q)?') : t('Nie wszystkie wyniki serii są wpisane. Utworzyć finał mimo to?')}</>}
          yes={t('Tak, utwórz finał')}
          onYes={() => { setAsking(false); void store.replace(makeFinal(state, categoryId)); setTab(finalId(categoryId)) }}
          onNo={() => setAsking(false)}
        />
      )}
    </div>
  )
}

function PerfTable({ state, group, admin }: { state: State; group: Group; admin: boolean }) {
  const m = measureOf(state.tournament)
  const ranked = rankGroup(state.tournament, group)
  // The chief referee types in the start order, so rows do not jump while results come in.
  const rows = admin ? group.teamIds.map((id) => ranked.find((r) => r.teamId === id)!).filter(Boolean) : ranked
  const heat = state.tournament.measured?.mode !== 'rounds' && group.id !== finalId(group.categoryId)
  const through = heat ? qualifiers(state, group.categoryId) : new Map()
  const name = (id: string) => state.teams.find((x) => x.id === id)?.name ?? ''
  const places = state.tournament.rules.measure && state.tournament.measured?.mode === 'rounds' && m.unit === 'points' && m.lowerIsBetter
  const unitLabel = places ? t('Miejsce') : m.unit === 'time' ? t('Czas') : m.unit === 'distance' ? t('Odległość (m)') : m.unit === 'strokes' ? t('Uderzenia') : t('Punkty')
  const done = ranked.filter((r) => r.value !== null || r.perf?.mark).length
  return (
    <section className="standings perf-table">
      <header>
        <h3>{group.name}</h3>
        <span className="muted small">{t('Wyniki: {done}/{all}', { done, all: rows.length })}</span>
      </header>
      <ol>
        {rows.map((r) => (
          <li key={r.teamId} className={through.has(r.teamId) ? 'top' : ''}>
            <span className="pos">{r.value !== null ? r.place : '–'}</span>
            <span className="name">{name(r.teamId)}</span>
            {m.attempts > 1 && <span className="perf-att muted small">{(r.perf?.v ?? []).map((v) => (v === null ? '×' : formatValue(v, m.unit))).join(' · ')}</span>}
            <b className="pts">{r.perf?.mark ?? formatValue(r.value, m.unit)}</b>
            {through.get(r.teamId) && <span className="qual">{through.get(r.teamId)}</span>}
            {admin && <PerfEdit state={state} group={group} teamId={r.teamId} perf={r.perf} />}
          </li>
        ))}
      </ol>
      <p className="legend muted small">
        {unitLabel}
        {m.attempts > 1 ? ` · ${m.aggregate === 'sum' ? t('suma z {n}', { n: m.attempts }) : t('najlepsza z {n} prób', { n: m.attempts })}` : ''}
        {heat && (state.tournament.measured?.Q || state.tournament.measured?.q) ? ` · ${t('Q – awans z miejsca w serii, q – awans z wyniku')}` : ''}
        {' · '}{t('DNF – nie ukończył, DNS – nie wystartował, DQ – dyskwalifikacja')}
      </p>
    </section>
  )
}

/** The chief referee's boxes for one participant: every attempt, and DNF / DNS / DQ. */
function PerfEdit({ state, group, teamId, perf }: { state: State; group: Group; teamId: string; perf?: Perf }) {
  const m = measureOf(state.tournament)
  const [texts, setTexts] = useState<string[]>(() => Array.from({ length: m.attempts }, (_, i) => editValue(perf?.v[i], m.unit)))
  const [mark, setMark] = useState<Perf['mark'] | ''>(perf?.mark ?? '')
  const [bad, setBad] = useState(false)
  const save = (nextTexts = texts, nextMark = mark) => {
    const v = nextTexts.map((x) => parseValue(x, m.unit))
    if (nextTexts.some((x, i) => x.trim() && v[i] === null)) { setBad(true); return }
    setBad(false)
    const empty = v.every((x) => x === null) && !nextMark
    const next: Perf | null = empty ? null : { v, ...(nextMark ? { mark: nextMark } : {}) }
    store.updateTournament({ perf: withPerf(state.tournament, group.id, teamId, next) })
  }
  const hint = m.unit === 'time' ? '1:02,35' : m.unit === 'distance' ? '5,23' : '0'
  return (
    <span className="perf-edit">
      {texts.map((x, i) => (
        <input key={i} className={bad ? 'field-bad' : ''} inputMode="decimal" placeholder={hint} value={x}
          aria-label={t('Wynik, próba {n}', { n: i + 1 })}
          onChange={(e) => setTexts((a) => a.map((y, k) => (k === i ? e.target.value : y)))}
          onBlur={() => save()}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
      ))}
      <select value={mark} aria-label={t('Status')} onChange={(e) => { const v = e.target.value as Perf['mark'] | ''; setMark(v); save(texts, v) }}>
        <option value="">—</option>
        <option value="DNF">DNF</option>
        <option value="DNS">DNS</option>
        <option value="DQ">DQ</option>
      </select>
    </span>
  )
}

function Classification({ state, categoryId }: { state: State; categoryId: string }) {
  const name = (id: string) => state.teams.find((x) => x.id === id)?.name ?? ''
  if (state.tournament.measured?.mode === 'rounds') {
    const rows = seriesStandings(state, categoryId)
    const rounds = heatsOf(state, categoryId)
    const low = state.tournament.measured?.points === 'low'
    return (
      <section className="standings perf-table">
        <header><h3>{t('Klasyfikacja')}</h3><span className="muted small">{t('Rund: {n}', { n: rounds.length })}</span></header>
        <ol>
          {rows.map((r) => (
            <li key={r.teamId} className={r.place <= 3 ? 'top' : ''}>
              <span className="pos">{r.place}</span>
              <span className="name">{name(r.teamId)}</span>
              <span className="perf-att muted small">{r.rounds.map((p, i) => (r.dropped.includes(i) ? `(${p ?? '–'})` : p ?? '–')).join(' · ')}</span>
              <b className="pts">{r.total}</b>
            </li>
          ))}
        </ol>
        <p className="legend muted small">{low ? t('Punkty za miejsca: 1. miejsce = 1 pkt, wygrywa najmniej.') : t('Punkty za miejsca w każdej rundzie, wygrywa najwięcej.')} {t('W nawiasie rundy, które się nie liczą.')}</p>
      </section>
    )
  }
  const rows = measuredPlaces(state, categoryId)
  return (
    <section className="standings perf-table">
      <header><h3>{t('Klasyfikacja')}</h3></header>
      <ol>
        {rows.map((r) => (
          <li key={r.teamId} className={r.place <= 3 ? 'top' : ''}>
            <span className="pos">{r.place}</span>
            <span className="name">{name(r.teamId)}</span>
          </li>
        ))}
      </ol>
      <p className="legend muted small">{t('Najpierw finał, potem pozostali według wyników z serii.')}</p>
    </section>
  )
}
