import { t } from '../i18n'
import { eliminationPlaces } from '../logic/elimination'
import { tally } from '../logic/scoring'
import type { Match, State } from '../types'
import { useLookups } from '../ui'
import { BMatch } from './BracketTree'
import { MatchList } from './Public'

/** Column title in the winners' bracket, from how many matches the round has in a full draw. */
function winnersTitle(col: number, rounds: number, double: boolean): string {
  const inRound = 2 ** (rounds - col)
  if (inRound === 1) return double ? t('Finał drabinki zwycięzców') : t('Finał')
  if (inRound === 2) return t('Półfinały')
  if (inRound === 4) return t('Ćwierćfinały')
  if (inRound === 8) return t('1/8 finału')
  if (inRound === 16) return t('1/16 finału')
  return t('Runda {r}', { r: col })
}

/**
 * A bracket from the start (knockout or double elimination): the winners' bracket, the
 * losers' bracket and the final(s) in columns, then the places and every match by time.
 */
export function EliminationView({ state, categoryId, schedule = true }: { state: State; categoryId: string; schedule?: boolean }) {
  const { teamName } = useLookups(state)
  const ms = state.matches.filter((m) => m.categoryId === categoryId && m.ko?.bracket)
  if (!ms.length) return <p className="notice-inline">{t('Drabinka pojawi się po losowaniu.')}</p>
  const double = ms.some((m) => m.ko!.bracket === 'L' || m.ko!.resetOf)
  const winners = ms.filter((m) => m.ko!.bracket === 'W')
  const losers = ms.filter((m) => m.ko!.bracket === 'L')
  const finals = ms.filter((m) => m.ko!.bracket === 'F')
  // Rounds of the full draw: players in the first round, rounded up to 2, 4, 8…
  const players = ms[0].ko!.tierTo
  let size = 2
  while (size < players) size *= 2
  const rounds = Math.log2(size)
  const cols = (list: Match[]) => {
    const byCol = new Map<number, Match[]>()
    for (const m of list) byCol.set(m.ko!.col ?? 1, [...(byCol.get(m.ko!.col ?? 1) ?? []), m])
    return [...byCol.entries()].sort((a, b) => a[0] - b[0])
  }
  const lCols = cols(losers)
  const winnerOf = (m: Match) => { const tl = tally(state.tournament.rules, m.sets); return tl.setsA > tl.setsB ? m.teamA : tl.setsB > tl.setsA ? m.teamB : '' }
  const places = eliminationPlaces(state, categoryId, winnerOf)
  return (
    <div className="elim">
      {places.length > 0 && (
        <section className="elim-places">
          {places.map((p) => (
            <span key={p.place} className={`elim-place p${p.place}`}>{p.place === 1 ? '🏆' : p.place === 2 ? '🥈' : p.place === 3 ? '🥉' : `${p.place}.`} {teamName(p.teamId)}</span>
          ))}
        </section>
      )}
      <h3 className="elim-title">{double ? t('Drabinka zwycięzców') : t('Drabinka')}</h3>
      <p className="tree-hint">{t('Przesuń drabinkę w bok, żeby zobaczyć dalsze rundy →')}</p>
      <Columns state={state} columns={cols(winners).map(([c, list]) => [winnersTitle(c, rounds, double), list])} />
      {double && lCols.length > 0 && (
        <>
          <h3 className="elim-title elim-losers">{t('Drabinka przegranych')}</h3>
          <p className="muted small">{t('Tu trafia się po pierwszej porażce. Druga porażka kończy turniej.')}</p>
          <Columns state={state} columns={lCols.map(([c, list], i) => [i === lCols.length - 1 ? t('Finał drabinki przegranych') : t('Przegrani · runda {r}', { r: c }), list])} />
        </>
      )}
      {finals.length > 0 && (
        <>
          <h3 className="elim-title">{double ? t('Wielki finał') : t('Spotkanie o 3. miejsce')}</h3>
          <div className="elim-finals">
            {finals.map((m) => (
              m.skipped
                ? <p key={m.id} className="muted small elim-skipped">{t('Rewanż niepotrzebny: wygrał zwycięzca drabinki zwycięzców.')}</p>
                : <div key={m.id} className="elim-final">
                    {m.ko!.resetOf && <p className="muted small">{t('Rewanż: gdy wielki finał wygra zwycięzca drabinki przegranych, obaj mają po jednej porażce.')}</p>}
                    <BMatch state={state} match={m} />
                  </div>
            ))}
          </div>
        </>
      )}
      {schedule && (
        <>
          <h3 className="elim-title">{t('Terminarz')}</h3>
          <MatchList state={state} matches={[...ms].filter((m) => !m.skipped).sort((a, b) => a.start.localeCompare(b.start) || a.court - b.court)} />
        </>
      )}
    </div>
  )
}

function Columns({ state, columns }: { state: State; columns: [string, Match[]][] }) {
  return (
    <div className="tree-scroll">
      <div className="elim-cols">
        {columns.map(([title, list]) => (
          <div key={title} className="elim-col">
            <h4>{title}</h4>
            <div className="elim-col-body">
              {list.map((m) => <div key={m.id} className="elim-slot"><BMatch state={state} match={m} /></div>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
