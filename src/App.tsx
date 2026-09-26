import { Admin, PrintCards } from './views/Admin'
import { Court, CourtPicker } from './views/Court'
import { Public } from './views/Public'
import { Correction } from './views/Correction'
import { Organizer } from './views/Organizer'
import { Tv } from './views/Tv'
import { useEffect } from 'react'
import { SyncBanner, useRoute } from './ui'

/**
 * Phones show the public pages and the organiser panel laid out like the desktop view,
 * scaled to the screen: a fixed 640px-wide layout with the ten courts in two columns,
 * all on one screen. When the browser is in "desktop site" mode it ignores the viewport
 * setting, so the page zooms itself to the same 640px layout. Referee screens (scoring,
 * result entry, corrections) keep the normal phone layout with big buttons.
 */
const DESKTOP_LIKE_WIDTH = 640
const PHONE_LAYOUT = /^(boisko-\d+|wynik-\d+|korekta-.+|sedzia|kartki)$/

function isPhone() {
  const touch = matchMedia('(pointer: coarse)').matches
  return Math.min(screen.width, screen.height) < DESKTOP_LIKE_WIDTH || (touch && innerWidth <= 1000)
}

function useViewport(route: string) {
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]')
    const root = document.documentElement
    const desktopLike = !PHONE_LAYOUT.test(route) && isPhone()
    meta?.setAttribute('content', desktopLike
      ? `width=${DESKTOP_LIKE_WIDTH}, viewport-fit=cover`
      : 'width=device-width, initial-scale=1, viewport-fit=cover')
    const fit = () => {
      // "Desktop site" mode keeps a ~980px viewport: zoom in to the 640px layout.
      const zoom = desktopLike && innerWidth > DESKTOP_LIKE_WIDTH + 40 ? innerWidth / DESKTOP_LIKE_WIDTH : 1
      root.style.setProperty('zoom', zoom === 1 ? '' : String(zoom))
      root.classList.toggle('compact', desktopLike || innerWidth <= DESKTOP_LIKE_WIDTH)
    }
    const frame = requestAnimationFrame(fit)
    addEventListener('resize', fit)
    return () => { cancelAnimationFrame(frame); removeEventListener('resize', fit) }
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
