import { Admin } from './views/Admin'
import { Court, CourtPicker } from './views/Court'
import { Public } from './views/Public'
import { Tv } from './views/Tv'
import { useRoute } from './ui'

export function App() {
  const route = useRoute()
  const court = /^boisko-(\d+)$/.exec(route)
  if (court) return <Court key={court[1]} court={Number(court[1])} />
  if (route === 'sedzia') return <CourtPicker />
  if (route === 'admin') return <Admin />
  if (route === 'tv') return <Tv />
  return <Public route={route} />
}
