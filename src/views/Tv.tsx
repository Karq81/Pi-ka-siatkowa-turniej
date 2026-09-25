import { useEffect, useState } from 'react'
import { useStore } from '../store/store'
import { hasKnockout } from '../logic/knockout'
import { BracketBoard } from './Bracket'
import { CourtCard, GroupTable } from './Public'

const SLIDE_SECONDS = 12

/** Big-screen mode for a TV or projector in the hall: rotates live courts and group tables. */
export function Tv() {
  const state = useStore()
  // Courts, then each category's tables, then its bracket once it has been created.
  const slides = [
    'courts',
    ...state.categories.map((c) => c.id),
    ...state.categories.filter((c) => hasKnockout(state, c.id)).map((c) => `ko:${c.id}`),
  ]
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((x) => x + 1), SLIDE_SECONDS * 1000)
    return () => clearInterval(t)
  }, [])
  const slide = slides[i % slides.length]
  const isBracket = slide.startsWith('ko:')
  const category = state.categories.find((c) => c.id === slide.replace('ko:', ''))
  return (
    <div className="tv">
      <header className="tv-head">
        <h1>{state.tournament.name}</h1>
        <span>{category ? `${isBracket ? 'Drabinka' : 'Tabele'} · ${category.name}` : 'Na żywo'}</span>
      </header>
      {isBracket && category ? (
        <BracketBoard state={state} categoryId={category.id} />
      ) : slide === 'courts' ? (
        <section className="courts courts-tv">
          {Array.from({ length: state.tournament.courts }, (_, c) => (
            <CourtCard key={c} state={state} court={c + 1} big />
          ))}
        </section>
      ) : (
        <section className="tables tables-tv">
          {state.groups.filter((g) => g.categoryId === slide).map((g) => (
            <GroupTable key={g.id} state={state} groupId={g.id} />
          ))}
        </section>
      )}
      <a className="tv-exit" href="#panel">Wyjdź z trybu TV</a>
    </div>
  )
}
