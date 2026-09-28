import { t } from '../i18n'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { isMatchDecided, isScore, resultProblem, scoreUnit, setCap, setProblem, setTarget, tally } from '../logic/scoring'
import { describeSets } from '../logic/sports'
import { isTwoLegged, needsPenalties } from '../logic/legs'
import type { Match, SetScore, State } from '../types'
import { ConfirmDialog, useLookups } from '../ui'
import { JudoResultForm } from './JudoScoring'
import { KarateResultForm } from './KarateScoring'
import { ChessResultForm } from './ChessScoring'

type Field = { a: string; b: string }

const toFields = (sets: SetScore[], count: number): Field[] =>
  Array.from({ length: count }, (_, i) => (sets[i] ? { a: String(sets[i].a), b: String(sets[i].b) } : { a: '', b: '' }))

/** Sets that have any points typed in, in order. */
export function parseFields(fields: Field[]): SetScore[] {
  return fields
    .filter((f) => f.a !== '' || f.b !== '')
    .map((f) => ({ a: Number(f.a) || 0, b: Number(f.b) || 0 }))
}

/**
 * Typing a whole result from the score sheet, keyboard first: two digits jump to the
 * next box, Enter jumps too, and Enter in the last filled box saves.
 */
type DecidedBy = NonNullable<Match['decidedBy']>

/** What the form asked besides the score: how the match was decided, penalties. */
export interface MatchExtra {
  decidedBy?: DecidedBy
  penalties?: SetScore
}

/** The match with the form's extras (decided by, penalties); penalties no longer needed go away. */
export function withDecided(m: Match, extra?: MatchExtra): Match {
  if (!extra) return m
  const { penalties: _old, ...rest } = m
  void _old
  return { ...rest, ...(extra.decidedBy ? { decidedBy: extra.decidedBy } : {}), ...(extra.penalties ? { penalties: extra.penalties } : {}) }
}

export function ResultForm({ state, match, submitLabel, onSubmit, children }: {
  state: State
  match: Match
  submitLabel: string
  onSubmit: (sets: SetScore[], extra?: MatchExtra) => void
  children?: ReactNode
}) {
  if (state.tournament.rules.scoring === 'judo') {
    return <JudoResultForm state={state} match={match} submitLabel={submitLabel} onSubmit={onSubmit}>{children}</JudoResultForm>
  }
  if (state.tournament.rules.scoring === 'karate') {
    return <KarateResultForm state={state} match={match} submitLabel={submitLabel} onSubmit={onSubmit}>{children}</KarateResultForm>
  }
  if (state.tournament.rules.scoring === 'chess') {
    return <ChessResultForm state={state} match={match} submitLabel={submitLabel} onSubmit={onSubmit}>{children}</ChessResultForm>
  }
  return <SetsResultForm state={state} match={match} submitLabel={submitLabel} onSubmit={onSubmit}>{children}</SetsResultForm>
}

function SetsResultForm({ state, match, submitLabel, onSubmit: save, children }: {
  state: State
  match: Match
  submitLabel: string
  onSubmit: (sets: SetScore[], extra?: MatchExtra) => void
  children?: ReactNode
}) {
  const { side } = useLookups(state)
  const rules = state.tournament.rules
  const score = isScore(rules)
  // Disciplines whose table points depend on how the match was decided (rules profile).
  const ways: [DecidedBy, string][] = [
    ...(rules.pointsOvertimeWin !== undefined || rules.pointsWalkoverLoss !== undefined ? [['regulation', t('w regulaminowym czasie')] as [DecidedBy, string]] : []),
    ...(rules.pointsOvertimeWin !== undefined ? [['overtime', t('po dogrywce')], ['shootout', t('po rzutach karnych')]] as [DecidedBy, string][] : []),
    ...(rules.pointsWalkoverLoss !== undefined ? [['walkover', t('walkower')]] as [DecidedBy, string][] : []),
  ]
  const [decidedBy, setDecidedBy] = useState<DecidedBy>(match.decidedBy ?? 'regulation')
  const [pens, setPens] = useState({ a: match.penalties ? String(match.penalties.a) : '', b: match.penalties ? String(match.penalties.b) : '' })
  const onSubmit = (sets: SetScore[]) => {
    const penalties = needsPenalties(state, match, sets) && pens.a !== '' && pens.b !== '' ? { a: Number(pens.a), b: Number(pens.b) } : undefined
    save(sets, { ...(ways.length ? { decidedBy } : {}), ...(penalties ? { penalties } : {}) })
  }
  // Goals and points can have three digits (basketball); set points two; games in tennis one.
  const digitsFor = (i: number) => (score ? 3 : Math.max(setTarget(rules, i), setCap(rules, i) ?? 0) < 10 ? 1 : 2)
  const [fields, setFields] = useState<Field[]>(() => toFields(match.sets, rules.sets))
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const sets = parseFields(fields)
  const tl = tally(rules, sets)
  // A leg of a two-legged tie may end level; so may a match that goes to penalties.
  const formRules = isTwoLegged(state, match) ? { ...rules, draws: true } : match.ko ? { ...rules, draws: false } : rules
  const penaltiesNeeded = needsPenalties(state, match, sets)
  const penaltiesOk = pens.a !== '' && pens.b !== '' && pens.a !== pens.b
  const decided = isMatchDecided(formRules, sets) || (penaltiesNeeded && penaltiesOk)
  const problem = penaltiesNeeded
    ? (penaltiesOk ? null : t('Remis: wpisz wynik rzutów karnych (nie liczą się do bramek).'))
    : resultProblem(formRules, sets)

  useEffect(() => {
    inputs.current[0]?.focus()
  }, [])

  // Order of boxes: set 1 A, set 1 B, set 2 A, ...
  const focus = (i: number) => {
    const el = inputs.current[i]
    if (el) { el.focus(); el.select() }
  }
  const change = (setIdx: number, s: 'a' | 'b', raw: string, index: number) => {
    const digits = digitsFor(setIdx)
    const v = raw.replace(/\D/g, '').slice(0, digits)
    setFields((f) => f.map((x, j) => (j === setIdx ? { ...x, [s]: v } : x)))
    if (v.length === digits) focus(index + 1)
  }
  const restEmpty = (index: number) =>
    fields.flatMap((f) => [f.a, f.b]).slice(index + 1).every((v) => v === '')
  const [tried, setTried] = useState(false)
  const [asking, setAsking] = useState(false)
  const submit = () => {
    setTried(true)
    if (!sets.length) return
    // A result against the rules (a typo, or a special case) is saved only after a question.
    if (problem) setAsking(true)
    else onSubmit(sets)
  }

  return (
    <form
      className="result-form"
      onSubmit={(e) => { e.preventDefault(); submit() }}
    >
      <div className="rf-grid" role="group" aria-label={t('Wynik setów')}>
        <span />
        <span className="rf-team">{side(match, 'a')}</span>
        <span className="rf-team">{side(match, 'b')}</span>
        <span />
        {fields.map((f, i) => {
          const filled = f.a !== '' && f.b !== ''
          const p = filled ? setProblem(rules, i, { a: Number(f.a), b: Number(f.b) }) : null
          return [
            score
              ? <span key={`l${i}`} className="rf-label">{t('Wynik')}<small>{scoreUnit(rules)}</small></span>
              : <span key={`l${i}`} className="rf-label">{t('Set {n}', { n: i + 1 })}<small>{t('do {n}', { n: setTarget(rules, i) })}</small></span>,
            ...(['a', 'b'] as const).map((sd, k) => {
              const index = i * 2 + k
              return (
                <input
                  key={`${i}${sd}`}
                  id={`rf-${i}-${sd}`}
                  ref={(el) => { inputs.current[index] = el }}
                  className="rf-input"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  aria-label={score ? `${t('Wynik')}, ${side(match, sd)}` : `${t('Set {n}', { n: i + 1 })}, ${side(match, sd)}`}
                  value={f[sd]}
                  onChange={(e) => change(i, sd, e.target.value, index)}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      // Enter moves on; once the match is decided and nothing follows, it saves.
                      const last = fields.length * 2 - 1
                      if ((decided && restEmpty(index)) || index === last) submit()
                      else focus(index + 1)
                    } else if (e.key === 'Backspace' && f[sd] === '' && index > 0) {
                      focus(index - 1)
                    }
                  }}
                />
              )
            }),
            <span key={`c${i}`} className={`rf-check ${!filled ? '' : p ? 'warn' : 'ok'}`}>
              {!filled ? '' : p === 'impossible' ? t('niemożliwy wynik') : p === 'unfinished' ? t('set niedokończony') : score && !formRules.draws && f.a === f.b && !penaltiesNeeded ? t('remis niemożliwy') : '✓'}
            </span>,
          ]
        })}
      </div>
      <p className="rf-total">
        {t('Wynik:')} <b>{score ? `${sets[0]?.a ?? 0}:${sets[0]?.b ?? 0}` : `${tl.setsA}:${tl.setsB}`}</b>
        {penaltiesNeeded && penaltiesOk && <> {t('karne {a}:{b}', { a: pens.a, b: pens.b })}</>}
        {sets.length > 0 && !decided && <span className="muted small"> {t('· mecz jeszcze nierozstrzygnięty')}</span>}
      </p>
      {penaltiesNeeded && (
        <div className="rf-grid rf-pens" role="group" aria-label={t('Rzuty karne')}>
          <span className="rf-label">{t('Rzuty karne')}<small>{t('nie liczą się do bramek')}</small></span>
          {(['a', 'b'] as const).map((sd) => (
            <input key={sd} className="rf-input" inputMode="numeric" pattern="[0-9]*" autoComplete="off"
              aria-label={`${t('Rzuty karne')}, ${side(match, sd)}`} value={pens[sd]}
              onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 2); setPens((x) => ({ ...x, [sd]: v })) }} />
          ))}
          <span className={`rf-check ${penaltiesOk ? 'ok' : 'warn'}`}>{penaltiesOk ? '✓' : ''}</span>
        </div>
      )}
      {ways.length > 0 && (
        <div className="chips rf-decided" role="group" aria-label={t('Jak rozstrzygnięto mecz')}>
          {ways.map(([id, label]) => (
            <button key={id} type="button" className={`chip ${decidedBy === id ? 'active' : ''}`} aria-pressed={decidedBy === id} onClick={() => setDecidedBy(id)}>{label}</button>
          ))}
        </div>
      )}
      {tried && problem && <p className="error" role="alert">{problem}</p>}
      <div className="actions">
        <button className="btn btn-primary btn-lg" type="submit" disabled={!sets.length}>{submitLabel}</button>
        {children}
      </div>
      {!tried && problem && sets.length > 0 && <p className="muted small">{problem}</p>}
      {asking && problem && (
        <ConfirmDialog
          question={<><b>{t('Ten wynik jest niezgodny z zasadami turnieju.')}</b><br />{problem}<br />{t('Zapisać go mimo to?')}</>}
          yes={t('Tak, zapisz tak jak jest')}
          onYes={() => { setAsking(false); onSubmit(sets) }}
          onNo={() => setAsking(false)}
        />
      )}
      <p className="muted small">
        {score
          ? <>{t('Enter przechodzi dalej, a na końcu zapisuje.')} {rules.draws ? t('Remis jest możliwy.') : t('Remisów nie ma: wpisz wynik po dogrywce lub karnych.')}</>
          : <>{t('Pełny wynik seta przeskakuje do następnego pola. Enter przechodzi dalej, a na końcu zapisuje.')}{' '}
            {t('Zasady:')} {describeSets(rules)}.</>}
      </p>
    </form>
  )
}
