import { useEffect, useRef, useState, type ReactNode } from 'react'
import { isMatchDecided, setTarget, setWinner, tally } from '../logic/scoring'
import type { Match, SetScore, State } from '../types'
import { useLookups } from '../ui'

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
export function ResultForm({ state, match, submitLabel, onSubmit, children }: {
  state: State
  match: Match
  submitLabel: string
  onSubmit: (sets: SetScore[]) => void
  children?: ReactNode
}) {
  const { side } = useLookups(state)
  const rules = state.tournament.rules
  const [fields, setFields] = useState<Field[]>(() => toFields(match.sets, rules.sets))
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const sets = parseFields(fields)
  const t = tally(rules, sets)
  const decided = isMatchDecided(rules, sets)

  useEffect(() => {
    inputs.current[0]?.focus()
  }, [])

  // Order of boxes: set 1 A, set 1 B, set 2 A, ...
  const focus = (i: number) => {
    const el = inputs.current[i]
    if (el) { el.focus(); el.select() }
  }
  const change = (setIdx: number, s: 'a' | 'b', raw: string, index: number) => {
    const v = raw.replace(/\D/g, '').slice(0, 2)
    setFields((f) => f.map((x, j) => (j === setIdx ? { ...x, [s]: v } : x)))
    if (v.length === 2) focus(index + 1)
  }
  const restEmpty = (index: number) =>
    fields.flatMap((f) => [f.a, f.b]).slice(index + 1).every((v) => v === '')
  const submit = () => {
    if (sets.length) onSubmit(sets)
  }

  return (
    <form
      className="result-form"
      onSubmit={(e) => { e.preventDefault(); submit() }}
    >
      <div className="rf-grid" role="group" aria-label="Wynik setów">
        <span />
        <span className="rf-team">{side(match, 'a')}</span>
        <span className="rf-team">{side(match, 'b')}</span>
        <span />
        {fields.map((f, i) => {
          const s = sets[i]
          const w = s && f.a !== '' && f.b !== '' ? setWinner(rules, i, s) : null
          const filled = f.a !== '' && f.b !== ''
          return [
            <span key={`l${i}`} className="rf-label">Set {i + 1}<small>do {setTarget(rules, i)}</small></span>,
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
                  aria-label={`Set ${i + 1}, ${side(match, sd)}`}
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
            <span key={`c${i}`} className={`rf-check ${w ? 'ok' : filled ? 'warn' : ''}`}>
              {w ? '✓' : filled ? 'set niedokończony' : ''}
            </span>,
          ]
        })}
      </div>
      <p className="rf-total">
        Wynik: <b>{t.setsA}:{t.setsB}</b>
        {sets.length > 0 && !decided && <span className="muted small"> · mecz jeszcze nierozstrzygnięty</span>}
      </p>
      <div className="actions">
        <button className="btn btn-primary btn-lg" type="submit" disabled={!sets.length}>{submitLabel}</button>
        {children}
      </div>
      <p className="muted small">Dwie cyfry przeskakują do następnego pola. Enter przechodzi dalej, a na końcu zapisuje.</p>
    </form>
  )
}
