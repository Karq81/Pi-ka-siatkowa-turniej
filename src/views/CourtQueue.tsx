import { useFavorites } from '../favorites'
import type { State } from '../types'
import { formatDay, formatTime, useLookups } from '../ui'

/**
 * The matches still to come on one court (each group plays on its own court), in order,
 * with approximate times: a match starts 2 minutes after the one before it ends.
 * `skip`: a match not to list (the one shown above, e.g. being played).
 */
export function CourtQueue({ state, court, skip }: { state: State; court: number; skip?: string }) {
  const mine = useFavorites()
  const { side } = useLookups(state)
  const onCourt = state.matches.filter((m) => m.court === court).sort((a, b) => a.start.localeCompare(b.start))
  const queue = onCourt.filter((m) => m.status === 'scheduled' && m.id !== skip)
  const slot = state.tournament.slotMinutes ?? 15
  return (
    <section className="court-queue">
      <h3 className="list-title">Kolejne mecze na tym boisku</h3>
      <p className="court-rule">
        ⏱️ <b>Każdy mecz rozpocznie się 2 minuty po zakończeniu poprzedniego meczu na tym boisku.</b> Godziny są
        przybliżone: mecz z przerwą trwa ok. {slot} minut, więc kolejne godziny liczymy co {slot} minut.
      </p>
      {!queue.length && <p className="muted">Na tym boisku nie ma już kolejnych meczów.</p>}
      <ol className="queue">
        {queue.map((m, i) => (
          <li key={m.id} className={mine.includes(m.teamA) || mine.includes(m.teamB) ? 'mine' : ''}>
            <a href={`#mecz-${m.id}`}>
              <span className="q-no">{i + 1}.</span>
              <span className="q-at">ok. <b>{formatTime(m.start)}</b>{i === 0 || m.start.slice(0, 10) !== queue[i - 1].start.slice(0, 10) ? <small>{formatDay(m.start)}</small> : null}</span>
              <span className="q-teams">
                <span className={mine.includes(m.teamA) ? 'mine' : ''}>{mine.includes(m.teamA) && '★ '}{side(m, 'a')}</span>
                <span className="muted small">vs</span>
                <span className={mine.includes(m.teamB) ? 'mine' : ''}>{mine.includes(m.teamB) && '★ '}{side(m, 'b')}</span>
              </span>
            </a>
          </li>
        ))}
      </ol>
    </section>
  )
}
