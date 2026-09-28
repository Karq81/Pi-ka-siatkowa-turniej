import { t } from '../i18n'
import { bracketView } from '../logic/knockout'
import type { State } from '../types'
import { BracketTree } from './BracketTree'
import { EliminationView } from './Elimination'
import { hasElimination } from '../logic/elimination'

/** Medal part of the bracket (places 1–8) for the TV screen. */
export function BracketBoard({ state, categoryId }: { state: State; categoryId: string }) {
  if (hasElimination(state, categoryId)) return <EliminationView state={state} categoryId={categoryId} schedule={false} />
  const slots = bracketView(state, categoryId)?.filter((s) => s.match.ko!.tierFrom === 1)
  if (!slots?.length) return <p className="muted">{t('Drabinka pojawi się później.')}</p>
  return <BracketTree state={state} slots={slots} />
}
