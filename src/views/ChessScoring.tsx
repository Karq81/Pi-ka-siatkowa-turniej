import { useState, type ReactNode } from 'react'
import { t } from '../i18n'
import { CHESS_ENDS, chessEndName, chessSet, chessText } from '../logic/chess'
import { store } from '../store/store'
import type { ChessEnd, Match, Rules, SetScore, State } from '../types'
import { useLookups } from '../ui'

/*
 * Chess: the players keep their own chess clock, so the referee only records the result
 * (1–0, ½–½, 0–1) and how the game ended.
 */

function ChessPicker({ state, match, initial, submitLabel, onSubmit, children }: {
  state: State; match: Match; initial?: SetScore; submitLabel: string; onSubmit: (s: SetScore) => void; children?: ReactNode
}) {
  const { side } = useLookups(state)
  const start: 'a' | 'b' | 'remis' | '' = !initial ? '' : initial.a === 1 ? 'a' : initial.b === 1 ? 'b' : initial.a === 0.5 ? 'remis' : ''
  const [result, setResult] = useState<'a' | 'b' | 'remis' | ''>(start)
  const [end, setEnd] = useState<ChessEnd | ''>(initial?.chess ?? '')
  const ends = CHESS_ENDS.filter((e) => !result || (result === 'remis') === e.draw)
  return (
    <div className="chess-pick">
      <div className="chess-results">
        <button type="button" className={`btn btn-lg ${result === 'a' ? 'btn-primary' : ''}`} onClick={() => { setResult('a'); setEnd('') }}>
          1–0 <small>{t('wygrywa: {name}', { name: side(match, 'a') })}</small>
        </button>
        <button type="button" className={`btn btn-lg ${result === 'remis' ? 'btn-primary' : ''}`} onClick={() => { setResult('remis'); setEnd('') }}>
          ½–½ <small>{t('remis')}</small>
        </button>
        <button type="button" className={`btn btn-lg ${result === 'b' ? 'btn-primary' : ''}`} onClick={() => { setResult('b'); setEnd('') }}>
          0–1 <small>{t('wygrywa: {name}', { name: side(match, 'b') })}</small>
        </button>
      </div>
      {result && (
        <label>{t('Jak zakończyła się partia (nieobowiązkowo)')}
          <select value={end} onChange={(e) => setEnd(e.target.value as ChessEnd | '')}>
            <option value="">—</option>
            {ends.map((e) => <option key={e.id} value={e.id}>{t(e.label)}</option>)}
          </select>
        </label>
      )}
      <div className="actions">
        <button type="button" className="btn btn-primary btn-lg" disabled={!result} onClick={() => result && onSubmit(chessSet(result, end || undefined))}>{submitLabel}</button>
        {children}
      </div>
    </div>
  )
}

export function ChessScoring({ state, match, meta, onFinish }: { state: State; match: Match; meta: string; onFinish: () => void }) {
  const { side } = useLookups(state)
  return (
    <section className="scoring chess">
      <p className="muted center">{meta}</p>
      <h2 className="vs"><span>♔ {side(match, 'a')}</span><span className="muted">{t('vs')}</span><span>♚ {side(match, 'b')}</span></h2>
      <p className="muted center small">{t('Pierwszy zawodnik gra białymi. Zegar szachowy prowadzą zawodnicy; tu zapisujesz tylko wynik.')}</p>
      <ChessPicker state={state} match={match} submitLabel={t('Zakończ partię i wyślij wynik')}
        onSubmit={(s) => { store.updateMatch(match.id, (m) => ({ ...m, status: 'finished', sets: [s] })); onFinish() }} />
    </section>
  )
}

export function ChessResultForm({ state, match, submitLabel, onSubmit, children }: {
  state: State; match: Match; submitLabel: string; onSubmit: (sets: SetScore[]) => void; children?: ReactNode
}) {
  return <ChessPicker state={state} match={match} initial={match.sets[0]} submitLabel={submitLabel} onSubmit={(s) => onSubmit([s])}>{children}</ChessPicker>
}

/** Under a game's result for fans: how it ended. */
export function ChessNote({ rules, set }: { rules: Rules; set: SetScore }) {
  if (rules.scoring !== 'chess' || !set.chess) return null
  return <p className="jd-note">{chessText(set)} · {chessEndName(set.chess)}</p>
}
