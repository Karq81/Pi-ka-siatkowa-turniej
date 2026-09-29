import { t } from '../i18n'
import { cardPoints } from '../logic/scoring'
import { store } from '../store/store'
import type { Card, Match, Rules, State } from '../types'
import { useLookups } from '../ui'

/*
 * Cards in team games (football, futsal, handball, hockey, rugby…): the referee taps them
 * during the match, the organiser can add a player and a minute later. Fans see them on the
 * boards and the match cards, and the fair-play table counts them (yellow 1, second
 * yellow 3, red 4 – the fewer, the better).
 */

export function hasCards(rules: Rules): boolean {
  return rules.scoring === 'score'
}

const LABEL = { Y: '🟨', YR: '🟨🟥', R: '🟥' } as const

/** The cards of one side, as small icons (nothing when there are none). */
export function CardIcons({ match, side }: { match: Match; side: 'a' | 'b' }) {
  const cards = (match.cards ?? []).filter((c) => c.side === side)
  if (!cards.length) return null
  const y = cards.filter((c) => c.kind === 'Y').length
  const r = cards.filter((c) => c.kind !== 'Y').length
  return (
    <span className="cards-icons" title={cards.map((c) => `${LABEL[c.kind]} ${c.player ?? ''}${c.minute ? ` ${c.minute}'` : ''}`).join(', ')}>
      {y > 0 && <span className="card-y" aria-label={t('Żółte kartki: {n}', { n: y })}>{y > 1 ? y : ''}</span>}
      {r > 0 && <span className="card-r" aria-label={t('Czerwone kartki: {n}', { n: r })}>{r > 1 ? r : ''}</span>}
    </span>
  )
}

const save = (match: Match, cards: Card[]) => store.updateMatch(match.id, (m) => ({ ...m, cards }))

/** The referee's quick buttons during the match: a yellow or a red for a side, and the last one taken back. */
export function CardButtons({ state, match, side }: { state: State; match: Match; side: 'a' | 'b' }) {
  const { side: name } = useLookups(state)
  if (!hasCards(state.tournament.rules)) return null
  const mine = (match.cards ?? []).filter((c) => c.side === side)
  const add = (kind: Card['kind']) => save(match, [...(match.cards ?? []), { side, kind }])
  const undo = () => {
    const all = [...(match.cards ?? [])]
    for (let i = all.length - 1; i >= 0; i--) if (all[i].side === side) { all.splice(i, 1); break }
    save(match, all)
  }
  return (
    <span className="card-buttons">
      <button type="button" className="btn btn-sm card-btn-y" onClick={() => add('Y')} aria-label={t('Żółta kartka dla: {team}', { team: name(match, side) })}>{t('Żółta')}</button>
      <button type="button" className="btn btn-sm card-btn-r" onClick={() => add('R')} aria-label={t('Czerwona kartka dla: {team}', { team: name(match, side) })}>{t('Czerwona')}</button>
      {mine.length > 0 && <button type="button" className="btn btn-sm" onClick={undo}>{t('Cofnij kartkę')}</button>}
      <CardIcons match={match} side={side} />
    </span>
  )
}

/** The organiser's list of a match's cards: side, colour, player and minute. */
export function CardsEditor({ state, match }: { state: State; match: Match }) {
  const { side } = useLookups(state)
  if (!hasCards(state.tournament.rules) || !match.teamA || !match.teamB) return null
  const cards = match.cards ?? []
  const change = (i: number, patch: Partial<Card>) => save(match, cards.map((c, k) => {
    if (k !== i) return c
    const next = { ...c, ...patch }
    if (!next.player) delete next.player
    if (!next.minute) delete next.minute
    return next
  }))
  return (
    <details className="pair-edit cards-edit" open={cards.length > 0}>
      <summary>{t('Kartki')}{cards.length ? ` · ${cards.length}` : ''}</summary>
      {cards.map((c, i) => (
        <div key={i} className="form-row card-row">
          <select value={c.side} onChange={(e) => change(i, { side: e.target.value as Card['side'] })} aria-label={t('Drużyna')}>
            <option value="a">{side(match, 'a')}</option>
            <option value="b">{side(match, 'b')}</option>
          </select>
          <select value={c.kind} onChange={(e) => change(i, { kind: e.target.value as Card['kind'] })} aria-label={t('Kartka')}>
            <option value="Y">🟨 {t('żółta')}</option>
            <option value="YR">🟨🟥 {t('druga żółta')}</option>
            <option value="R">🟥 {t('czerwona')}</option>
          </select>
          <input value={c.player ?? ''} placeholder={t('zawodnik (opcjonalnie)')} maxLength={40} onChange={(e) => change(i, { player: e.target.value })} aria-label={t('Zawodnik')} />
          <input value={c.minute ? String(c.minute) : ''} placeholder={t('min.')} inputMode="numeric" maxLength={3} className="card-min"
            onChange={(e) => change(i, { minute: Number(e.target.value.replace(/\D/g, '')) || undefined })} aria-label={t('Minuta')} />
          <button type="button" className="btn btn-sm" onClick={() => save(match, cards.filter((_, k) => k !== i))} aria-label={t('Usuń')}>✕</button>
        </div>
      ))}
      <div className="actions">
        <button type="button" className="btn btn-sm" onClick={() => save(match, [...cards, { side: 'a', kind: 'Y' }])}>+ 🟨 {t('Dodaj kartkę')}</button>
      </div>
    </details>
  )
}

/** Fair play in a group: cards per team and their points (only when there are any). */
export function FairPlay({ state, teamIds, matches }: { state: State; teamIds: string[]; matches: Match[] }) {
  const done = matches.filter((m) => m.status !== 'scheduled')
  if (!done.some((m) => m.cards?.length)) return null
  const name = (id: string) => state.teams.find((x) => x.id === id)?.name ?? ''
  const count = (id: string, kinds: Card['kind'][]) => done.reduce((n, m) => {
    const s = m.teamA === id ? 'a' : m.teamB === id ? 'b' : null
    return n + (s ? (m.cards ?? []).filter((c) => c.side === s && kinds.includes(c.kind)).length : 0)
  }, 0)
  const rows = teamIds.map((id) => ({ id, y: count(id, ['Y']), r: count(id, ['YR', 'R']), pts: cardPoints(id, done) }))
    .filter((r) => r.pts > 0).sort((a, b) => a.pts - b.pts)
  return (
    <section className="standings fair-play">
      <header><h3>{t('Fair play')}</h3><span className="muted small">{t('żółta 1 pkt · druga żółta 3 · czerwona 4 · im mniej, tym lepiej')}</span></header>
      <ol>
        {rows.map((r) => (
          <li key={r.id}>
            <span className="name">{name(r.id)}</span>
            <span className="muted small">🟨 {r.y} · 🟥 {r.r}</span>
            <b className="pts">{r.pts}</b>
          </li>
        ))}
      </ol>
    </section>
  )
}
