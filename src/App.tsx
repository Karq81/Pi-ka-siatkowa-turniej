import { Admin, PrintCards } from './views/Admin'
import { Court, CourtPicker } from './views/Court'
import { Public } from './views/Public'
import { Tv } from './views/Tv'
import { SyncBanner, useRoute } from './ui'

export function App() {
  return (
    <>
      <SyncBanner />
      <Screen />
    </>
  )
}

function Screen() {
  const route = useRoute()
  const court = /^boisko-(\d+)$/.exec(route)
  if (court) return <Court key={court[1]} court={Number(court[1])} />
  if (route === 'sedzia') return <CourtPicker />
  if (route === 'admin') return <Admin />
  if (route === 'kartki') return <PrintCards />
  if (route === 'tv') return <Tv />
  return <Public route={route} />
}
