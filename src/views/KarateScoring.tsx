import { useState, type ReactNode } from 'react'
import { t } from '../i18n'
import { karateAdd, karateOf, karatePenalty, karateResult, karateStopped, karateWinName, KARATE_LEAD, penaltyName } from '../logic/karate'
import { store } from '../store/store'
import type { Match, Rules, SetScore, State } from '../types'
import { ConfirmDialog, NumberField, useLookups } from '../ui'
import { clearContestClock, ContestClock } from './ContestClock'

/*
 * Karate kumite (WKF) on the referee's phone: the bout clock, and for each athlete (aka / ao)
 * Yuko +1, Waza-ari +2, Ippon +3, penalties, senshu, and a way to take a mistake back.
 */

export function KarateScoring({ state, match, meta, onFinish }: { state: State; match: Match; meta: string; onFinish: () => void }) {
  const { side } = useLookups(state)
  const rules = state.tournament.rules
  const s = match.sets[0] ?? { a: 0, b: 0 }
  const k = karateOf(s)
  const [timeUp, setTimeUp] = useState(false)
  const result = karateResult(s, timeUp)
  const stopped = karateStopped(s)

  const change = (fn: (x: SetScore) => SetScore) => store.updateMatch(match.id, (m) => {
    const cur = m.sets[0] ?? { a: 0, b: 0 }
    const next = fn(cur)
    return next === cur ? m : { ...m, sets: [next] }
  })
  const finish = () => {
    store.updateMatch(match.id, (m) => ({ ...m, status: 'finished' }))
    clearContestClock(match.id, match.court)
    onFinish()
  }

  return (
    <section className="scoring judo karate">
      <p className="muted center">{meta}</p>
      <ContestClock id={match.id} court={match.court} seconds={rules.fightSeconds ?? 180} onTimeUp={setTimeUp} />
      <div className="pads jd-pads">
        {(['a', 'b'] as const).map((sd) => {
          const pen = sd === 'a' ? k.pa : k.pb
          return (
            <div key={sd} className={`pad jd-pad ${sd === 'a' ? 'kr-aka' : 'kr-ao'} ${result?.winner === sd && (stopped || timeUp) ? 'pad-won' : ''}`}>
              <span className="pad-team">{side(match, sd)} <small className="muted">{sd === 'a' ? t('(aka, czerwony)') : t('(ao, niebieski)')}</small></span>
              <span className="pad-score">{s[sd]}</span>
              <span className="kr-flags">
                {k.senshu === sd && <b className="kr-senshu">{t('Senshu')}</b>}
                {pen > 0 && <b className="kr-pen">{penaltyName(pen)}</b>}
              </span>
              <div className="jd-actions">
                <button type="button" className="jd-btn jd-yuko" disabled={stopped} onClick={() => change((x) => karateAdd(x, sd, 1))}>{t('Yuko')} +1</button>
                <button type="button" className="jd-btn jd-waza" disabled={stopped} onClick={() => change((x) => karateAdd(x, sd, 2))}>{t('Waza-ari')} +2</button>
                <button type="button" className="jd-btn jd-ippon" disabled={stopped} onClick={() => change((x) => karateAdd(x, sd, 3))}>{t('Ippon')} +3</button>
                <button type="button" className="jd-btn jd-shido" disabled={stopped} onClick={() => change((x) => karatePenalty(x, sd, 1))}>{t('Kara')}</button>
              </div>
              <div className="jd-undo">
                <span className="muted small">{t('Cofnij:')}</span>
                <button type="button" className="linklike small" disabled={!s[sd]} onClick={() => change((x) => karateAdd(x, sd, -1))}>−1 {t('pkt')}</button>
                <button type="button" className="linklike small" disabled={!pen} onClick={() => change((x) => karatePenalty(x, sd, -1))}>− {t('kara')}</button>
              </div>
            </div>
          )
        })}
      </div>
      <div className="kr-senshu-row">
        <span className="muted small">{t('Senshu (pierwszy punkt bez odpowiedzi):')}</span>
        {(['a', 'b'] as const).map((sd) => (
          <button key={sd} type="button" className={`btn btn-sm ${k.senshu === sd ? 'btn-primary' : ''}`}
            onClick={() => change((x) => ({ ...x, karate: { ...karateOf(x), senshu: karateOf(x).senshu === sd ? undefined : sd } }))}>
            {side(match, sd)}
          </button>
        ))}
      </div>
      {result && (
        <div className="notice">
          <p>{stopped || timeUp ? t('Wygrywa:') : t('Prowadzi:')} <b>{side(match, result.winner)}</b> · {karateWinName(result.by)}</p>
          <button className={`btn btn-lg ${stopped || timeUp ? 'btn-primary' : ''}`} onClick={finish}>{t('Zakończ walkę i wyślij wynik')}</button>
        </div>
      )}
      {!result && s.a !== s.b && !timeUp && (
        <p className="muted center small">{t('Prowadzi: {name}. Walka trwa do końca czasu albo do przewagi {n} punktów.', { name: side(match, s.a > s.b ? 'a' : 'b'), n: KARATE_LEAD })}</p>
      )}
      {timeUp && !result && (
        <div className="notice"><p>{t('Koniec czasu, remis i nikt nie ma senshu: zdecydują sędziowie (hantei). Zaznacz zwycięzcę niżej.')}</p></div>
      )}
      <details className="jd-more" open={timeUp && !result}>
        <summary>{t('Inne rozstrzygnięcie (decyzja sędziów, poddanie, kontuzja)')}</summary>
        <div className="actions">
          {(['a', 'b'] as const).map((sd) => (
            <button key={sd} type="button" className="btn" onClick={() => change((x) => ({ ...x, karate: { ...karateOf(x), decision: karateOf(x).decision === sd ? undefined : sd } }))}>
              {k.decision === sd ? '✓ ' : ''}{t('Wygrywa: {name}', { name: side(match, sd) })}
            </button>
          ))}
        </div>
      </details>
    </section>
  )
}

/** Under a karate bout for fans: senshu and penalties. */
export function KarateNote({ rules, set }: { rules: Rules; set: SetScore }) {
  if (rules.scoring !== 'karate') return null
  const k = karateOf(set)
  const bits = [k.senshu ? `${t('Senshu')}: ${k.senshu === 'a' ? '◀' : '▶'}` : '', k.pa ? `◀ ${penaltyName(k.pa)}` : '', k.pb ? `${penaltyName(k.pb)} ▶` : ''].filter(Boolean)
  return bits.length ? <p className="jd-note">{bits.join(' · ')}</p> : null
}

/** Typing a bout from the score sheet. */
export function KarateResultForm({ state, match, submitLabel, onSubmit, children }: {
  state: State; match: Match; submitLabel: string; onSubmit: (sets: SetScore[]) => void; children?: ReactNode
}) {
  const { side } = useLookups(state)
  const [s, setS] = useState<SetScore>(() => match.sets[0] ?? { a: 0, b: 0 })
  const [asking, setAsking] = useState(false)
  const k = karateOf(s)
  const result = karateResult(s, true)
  const setK = (patch: Partial<typeof k>) => setS({ ...s, karate: { ...k, ...patch } })
  return (
    <form className="result-form jd-form" onSubmit={(e) => { e.preventDefault(); if (result) onSubmit([s]); else setAsking(true) }}>
      <table className="jd-form-table">
        <thead><tr><th /><th>{t('Punkty')}</th><th>{t('Kary (0–5)')}</th></tr></thead>
        <tbody>
          {(['a', 'b'] as const).map((sd) => (
            <tr key={sd}>
              <th className="rf-team">{side(match, sd)}</th>
              <td><NumberField min={0} max={99} value={s[sd]} ariaLabel={`${t('Punkty')}, ${side(match, sd)}`} onChange={(v) => setS({ ...s, [sd]: v })} /></td>
              <td><NumberField min={0} max={5} value={sd === 'a' ? k.pa : k.pb} ariaLabel={`${t('Kary (0–5)')}, ${side(match, sd)}`} onChange={(v) => setK(sd === 'a' ? { pa: v } : { pb: v })} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <label>{t('Senshu')}
        <select value={k.senshu ?? ''} onChange={(e) => setK({ senshu: (e.target.value || undefined) as 'a' | 'b' | undefined })}>
          <option value="">{t('brak')}</option>
          <option value="a">{side(match, 'a')}</option>
          <option value="b">{side(match, 'b')}</option>
        </select>
      </label>
      <label>{t('Decyzja sędziów / poddanie (tylko gdy nie rozstrzygnęły punkty)')}
        <select value={k.decision ?? ''} onChange={(e) => setK({ decision: (e.target.value || undefined) as 'a' | 'b' | undefined })}>
          <option value="">{t('brak')}</option>
          <option value="a">{t('Wygrywa: {name}', { name: side(match, 'a') })}</option>
          <option value="b">{t('Wygrywa: {name}', { name: side(match, 'b') })}</option>
        </select>
      </label>
      <p className="rf-total">
        {result ? <>{t('Wygrywa:')} <b>{side(match, result.winner)}</b> · {karateWinName(result.by)}</> : <span className="muted">{t('Walka jeszcze nierozstrzygnięta.')}</span>}
      </p>
      {asking && (
        <ConfirmDialog
          question={<><b>{t('Ten wynik jest niezgodny z zasadami turnieju.')}</b><br />{t('Walka nie jest rozstrzygnięta: równy wynik bez senshu. Zaznacz decyzję sędziów (hantei).')}<br />{t('Zapisać go mimo to?')}</>}
          yes={t('Tak, zapisz tak jak jest')}
          onYes={() => { setAsking(false); onSubmit([s]) }}
          onNo={() => setAsking(false)}
        />
      )}
      <div className="actions">
        <button className="btn btn-primary btn-lg" type="submit">{submitLabel}</button>
        {children}
      </div>
    </form>
  )
}
