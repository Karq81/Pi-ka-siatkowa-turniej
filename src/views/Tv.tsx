import { useEffect, useState } from 'react'
import { useStore } from '../store/store'
import { CourtCard, GroupTable } from './Public'

const SLIDE_SECONDS = 12

/** Big-screen mode for a TV or projector in the hall: rotates live courts and group tables. */
export function Tv() {
  const state = useStore()
  const slides = ['courts', ...state.categories.map((c) => c.id)]
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((x) => x + 1), SLIDE_SECONDS * 1000)
    return () => clearInterval(t)
  }, [])
  const slide = slides[i % slides.length]
  const category = state.categories.find((c) => c.id === slide)
  return (
    <div className="tv">
      <header className="tv-head">
        <h1>{state.tournament.name}</h1>
        <span>{category ? `Tabele · ${category.name}` : 'Na żywo'}</span>
      </header>
      {slide === 'courts' ? (
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
      <a className="tv-exit" href="#">Wyjdź z trybu TV</a>
    </div>
  )
}
