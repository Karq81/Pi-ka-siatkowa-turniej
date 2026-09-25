import { bracketView } from '../logic/knockout'
import type { State } from '../types'
import { MatchCard } from './Competition'

/** Medal part of the bracket (places 1–8) for the TV screen. */
export function BracketBoard({ state, categoryId }: { state: State; categoryId: string }) {
  const slots = bracketView(state, categoryId)?.filter((s) => s.match.ko!.tierFrom === 1)
  if (!slots?.length) return <p className="muted">Drabinka pojawi się po losowaniu grup.</p>
  return (
    <div className="ko-cols">
      {(['QF', 'SF', 'P'] as const).map((round) => {
        const list = slots.filter((s) => s.match.ko!.round === round)
        if (!list.length) return null
        return (
          <section key={round} className="ko-col">
            <h3>{round === 'QF' ? 'Ćwierćfinały' : round === 'SF' ? 'Półfinały' : 'Mecze o miejsca'}</h3>
            {list.map((s) => <MatchCard key={s.match.id} state={state} match={s.match} label={s.match.ko!.label} />)}
          </section>
        )
      })}
    </div>
  )
}
