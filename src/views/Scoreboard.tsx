import { t } from '../i18n'
import { publicBoard } from '../logic/publicBoard'
import { useStore } from '../store/store'
import { courtMatch, formatTime, useNow } from '../ui'
import { FanClock } from './ContestClock'

/**
 * One court's scoreboard, the same one the SportCast app draws on the video. Opens when
 * someone scans the app's QR code with the phone's camera, and works as a browser source
 * in streaming software (OBS).
 */
export function Scoreboard({ court, note = true }: { court: number; note?: boolean }) {
  const state = useStore()
  const now = useNow(5000)
  const b = publicBoard(state, court, now)
  const sets = b.scoring === 'sets'
  const live = courtMatch(state, court).current
  return (
    <div className={note ? 'scoreboard-page' : undefined}>
      <div className="scoreboard">
        <div className="sb-head">{b.tournament} · {t('Boisko {n}', { n: b.court })}{b.stage && ` · ${b.stage}`}</div>
        {b.status === 'none' ? (
          <div className="sb-empty">{t('Na tym boisku nie ma już meczów.')}</div>
        ) : (
          <>
            {(['a', 'b'] as const).map((side) => (
              <div key={side} className="sb-row">
                <span className="sb-team">{side === 'a' ? b.a : b.b}</span>
                {b.status !== 'next' && sets && <span className="sb-sets">{side === 'a' ? b.setsA : b.setsB}</span>}
                {b.status !== 'next' && <span className="sb-points">{side === 'a' ? b.pointsA : b.pointsB}</span>}
              </div>
            ))}
            <div className="sb-foot">
              {b.status === 'live' ? <span className="sb-live">● {t('Na żywo')}</span>
                : b.status === 'finished' ? t('Koniec meczu')
                  : t('Początek o {time}', { time: formatTime(b.start) })}
              {sets && b.sets.length > 1 && <span className="muted"> · {b.sets.map((s) => `${s.a}:${s.b}`).join(', ')}</span>}
            </div>
            {live && <FanClock match={live} className="sb-clock" />}
          </>
        )}
      </div>
      {note && <p className="sb-note">{t('To jest tablica wyników dla aplikacji SportCast. Zeskanuj ten sam kod QR w aplikacji, a wynik pojawi się na obrazie transmisji.')}</p>}
    </div>
  )
}

/** The page behind the organiser's QR code: every court's scoreboard. */
export function CameraBoards() {
  const state = useStore()
  return (
    <div className="scoreboard-page">
      <p className="sb-note">{t('To jest kod dla aplikacji SportCast. Zeskanuj go w aplikacji („Transmisja z sportlivearena.com”), a wynik z panelu sędziego pojawi się na obrazie transmisji.')}</p>
      <div className="scoreboards">
        {Array.from({ length: state.tournament.courts }, (_, i) => <Scoreboard key={i} court={i + 1} note={false} />)}
      </div>
    </div>
  )
}
