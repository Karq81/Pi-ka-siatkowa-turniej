import { t } from '../i18n'
import { useSession, store, useStore } from '../store/store'
import type { Match } from '../types'
import { BackBar, ConfirmButton, courtLabel, formatDay, formatTime, PinGate, useLookups } from '../ui'
import { ResultForm } from './ResultForm'
import { setsText } from '../logic/scoring'

/** Small button shown only to the chief referee: opens the result correction for a match. */
export function CorrectButton({ match }: { match: Match }) {
  const session = useSession()
  if (session?.role !== 'admin' || !match.teamA || !match.teamB) return null
  const go = () => { location.hash = `korekta-${match.id}` }
  if (match.status === 'scheduled') return <button type="button" className="btn-correct" onClick={go}>✎ {t('Wpisz wynik')}</button>
  return (
    <ConfirmButton
      className="btn-correct"
      label={`✎ ${t('Korekta wyniku')}`}
      question={t('Czy na pewno chcesz poprawić wynik tego meczu?')}
      yes={t('Tak, popraw wynik')}
      onYes={go}
    />
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
      <header className="bar"><h1>{t('Korekta wyniku')}</h1></header>
      <PinGate label={t('Korekta wyniku (sędzia główny)')}>
        {!m ? (
          <p className="muted">{t('Nie znaleziono meczu.')}</p>
        ) : (
          <section className="ref-card">
            <p className="muted">{categoryName(m.categoryId)} · {stageName(m)} · {formatDay(m.start)} {formatTime(m.start)} · {t('Boisko {n}', { n: courtLabel(m.court) })}</p>
            <h2 className="vs">
              <span>{side(m, 'a')}</span>
              <span className="muted">{t('vs')}</span>
              <span>{side(m, 'b')}</span>
            </h2>
            {m.status === 'finished' && (
              <p className="muted small">{t('Obecny wynik:')} <b>{setsText(state.tournament.rules, m.sets)}</b>{t('. Wpisz poprawny i zapisz.')}</p>
            )}
            <ResultForm
              state={state}
              match={m}
              submitLabel={t('Zapisz poprawiony wynik')}
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
                  {t('Cofnij wynik (mecz nierozegrany)')}
                </button>
              )}
            </ResultForm>
            <p className="muted small">{t('Tabele, drabinka i strony drużyn przeliczą się same od razu po zapisaniu.')}</p>
          </section>
        )}
      </PinGate>
    </div>
  )
}
