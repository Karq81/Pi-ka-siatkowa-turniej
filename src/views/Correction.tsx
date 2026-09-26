import { useSession, store, useStore } from '../store/store'
import type { Match } from '../types'
import { BackBar, courtLabel, formatDay, formatTime, PinGate, useLookups } from '../ui'
import { ResultForm } from './ResultForm'

/** Small button shown only to the chief referee: opens the result correction for a match. */
export function CorrectButton({ match }: { match: Match }) {
  const session = useSession()
  if (session?.role !== 'admin' || !match.teamA || !match.teamB) return null
  return (
    <a className="btn-correct" href={`#korekta-${match.id}`}>
      ✎ {match.status === 'scheduled' ? 'Wpisz wynik' : 'Korekta wyniku'}
    </a>
  )
}

/** Correcting a result (chief referee only): change the sets, or clear the result. */
export function Correction({ matchId }: { matchId: string }) {
  const state = useStore()
  const { side, categoryName, stageName } = useLookups(state)
  const m = state.matches.find((x) => x.id === matchId)
  const done = () => { history.length > 1 ? history.back() : (location.hash = `mecz-${matchId}`) }
  return (
    <div className="page page-court">
      <BackBar fallback={`mecz-${matchId}`} />
      <header className="bar"><h1>Korekta wyniku</h1></header>
      <PinGate label="Korekta wyniku (sędzia główny)">
        {!m ? (
          <p className="muted">Nie znaleziono meczu.</p>
        ) : (
          <section className="ref-card">
            <p className="muted">{categoryName(m.categoryId)} · {stageName(m)} · {formatDay(m.start)} {formatTime(m.start)} · Boisko {courtLabel(m.court)}</p>
            <h2 className="vs">
              <span>{side(m, 'a')}</span>
              <span className="muted">vs</span>
              <span>{side(m, 'b')}</span>
            </h2>
            {m.status === 'finished' && (
              <p className="muted small">Obecny wynik: <b>{m.sets.map((s) => `${s.a}:${s.b}`).join(', ')}</b>. Wpisz poprawny i zapisz.</p>
            )}
            <ResultForm
              state={state}
              match={m}
              submitLabel="Zapisz poprawiony wynik"
              onSubmit={(sets) => {
                store.updateMatch(m.id, (x) => ({ ...x, status: 'finished', sets }))
                done()
              }}
            >
              {m.status !== 'scheduled' && (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => { store.updateMatch(m.id, (x) => ({ ...x, status: 'scheduled', sets: [] })); done() }}
                >
                  Cofnij wynik (mecz nierozegrany)
                </button>
              )}
            </ResultForm>
            <p className="muted small">Tabele, drabinka i strony drużyn przeliczą się same od razu po zapisaniu.</p>
          </section>
        )}
      </PinGate>
    </div>
  )
}
