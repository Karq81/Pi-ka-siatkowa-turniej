import { Admin, PrintCards } from './views/Admin'
import { Court, CourtPicker } from './views/Court'
import { Public } from './views/Public'
import { Correction } from './views/Correction'
import { Organizer } from './views/Organizer'
import { Tv } from './views/Tv'
import { useEffect } from 'react'
import { SyncBanner, useRoute } from './ui'

/**
 * Phones show the public pages and the organiser panel laid out like the desktop view
 * (two columns of courts), scaled to the screen: a fixed 640px-wide layout, so all
 * ten courts fit on one phone screen and stay readable. Referee screens (scoring, result
 * entry, corrections) keep the normal phone layout with big buttons.
 */
const DESKTOP_LIKE_WIDTH = 640
const PHONE_LAYOUT = /^(boisko-\d+|wynik-\d+|korekta-.+|sedzia|kartki)$/

function useViewport(route: string) {
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]')
    if (!meta) return
    const desktopLike = !PHONE_LAYOUT.test(route) && Math.min(screen.width, screen.height) < DESKTOP_LIKE_WIDTH
    meta.setAttribute('content', desktopLike
      ? `width=${DESKTOP_LIKE_WIDTH}, viewport-fit=cover`
      : 'width=device-width, initial-scale=1, viewport-fit=cover')
  }, [route])
}

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
  useViewport(route)
  const court = /^boisko-(\d+)$/.exec(route)
  if (court) return <Court key={court[1]} court={Number(court[1])} />
  const result = /^wynik-(\d+)$/.exec(route)
  if (result) return <Court key={`w${result[1]}`} court={Number(result[1])} manual />
  if (/^panel(-[a-z]+)?$/.test(route)) return <Organizer route={route} />
  const fix = /^korekta-(.+)$/.exec(route)
  if (fix) return <Correction key={fix[1]} matchId={fix[1]} />
  if (route === 'sedzia') return <CourtPicker />
  if (route === 'admin') return <Admin />
  if (route === 'kartki') return <PrintCards />
  if (route === 'tv') return <Tv />
  return <Public route={route} />
}
