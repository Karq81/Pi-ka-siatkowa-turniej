import { bracketView } from '../logic/knockout'
import type { State } from '../types'
import { BracketTree } from './BracketTree'

/** Medal part of the bracket (places 1–8) for the TV screen. */
export function BracketBoard({ state, categoryId }: { state: State; categoryId: string }) {
  const slots = bracketView(state, categoryId)?.filter((s) => s.match.ko!.tierFrom === 1)
  if (!slots?.length) return <p className="muted">Drabinka pojawi się po losowaniu grup.</p>
  return <BracketTree state={state} slots={slots} />
}
