import { About } from './views/About'
import { IS_LANDING } from './config'
import { NewTournament } from './views/NewTournament'
import { AccountPage } from './views/Account'
import { Admin, PrintCards } from './views/Admin'
import { Court, CourtPicker } from './views/Court'
import { Public } from './views/Public'
import { BrandBar } from './views/Platform'
import { Correction } from './views/Correction'
import { Organizer } from './views/Organizer'
import { Tv } from './views/Tv'
import { CameraBoards, Scoreboard } from './views/Scoreboard'
import { RegistrationPage } from './views/Registration'
import { useEffect } from 'react'
import { SyncBanner, useRoute } from './ui'
import { HelpBot } from './views/HelpBot'
import { useStore } from './store/store'
import { useTermsOf } from './logic/terms'

/**
 * Phones show the public pages and the organiser panel laid out like the desktop view,
 * scaled to the screen: a fixed 640px-wide layout with the ten courts in two columns,
 * all on one screen. When the browser is in "desktop site" mode it ignores the viewport
 * setting, so the page zooms itself to the same 640px layout. Referee screens (scoring,
 * result entry, corrections) keep the normal phone layout with big buttons.
 */
const DESKTOP_LIKE_WIDTH = 640
const PHONE_LAYOUT = /^(zgloszenie|boisko-\d+|tablica-\d+|kamera|wynik-\d+|korekta-.+|sedzia|kartki|o-systemie|nowy-turniej|konto|rejestracja|moje-turnieje|kredyty|lista-turniejow|moj-turniej-.+)$/

function isPhone() {
  const touch = matchMedia('(pointer: coarse)').matches
  return Math.min(screen.width, screen.height) < DESKTOP_LIKE_WIDTH || (touch && innerWidth <= 1000)
}

function useViewport(route: string) {
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]')
    const root = document.documentElement
    const desktopLike = !(PHONE_LAYOUT.test(route) || IS_LANDING) && isPhone()
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

// Every screen opens from the top (e.g. "Na żywo" shows all ten courts from court 1),
// also after a reload; the browser would otherwise keep the previous scroll position.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual'

function useScrollTop(route: string) {
  useEffect(() => {
    scrollTo(0, 0)
  }, [route])
}

/** The service's own pages; on the front-page address these are the only screens. */
const PLATFORM_ROUTES = ['o-systemie', 'nowy-turniej', 'konto', 'rejestracja', 'moje-turnieje', 'kredyty', 'lista-turniejow']
/** The service's pages, also one of the account's tournaments (#moj-turniej-{id}). */
const isPlatformRoute = (route: string) => PLATFORM_ROUTES.includes(route) || route.startsWith('moj-turniej-')

export function App() {
  const route = useRoute()
  const state = useStore()
  // The discipline's words (mata, kort, walka…) on this tournament's pages; the service's own
  // pages (front page, new tournament, account) keep the usual ones.
  useTermsOf(IS_LANDING || isPlatformRoute(route) ? undefined : state.tournament.rules.sport)
  return (
    <>
      {/* The service pages show no tournament, so no connection notices either. */}
      {!(IS_LANDING || isPlatformRoute(route) || route.startsWith('tablica-') || route === 'kamera') && <SyncBanner />}
      <Screen route={route} />
      {/* The AI help desk on the service's and the organiser's screens (not on fans' or scoring screens). */}
      {(IS_LANDING || isPlatformRoute(route) || /^(panel(-[a-z]+)?|admin|kartki|sedzia)$/.test(route)) && <HelpBot route={route} />}
    </>
  )
}

function Screen({ route }: { route: string }) {
  useViewport(route)
  useScrollTop(route)
  // The front page (sportlivearena.com with no tournament) has no tournament screens.
  if (IS_LANDING && !isPlatformRoute(route)) return <About />
  const court = /^boisko-(\d+)$/.exec(route)
  if (court) return <Court key={court[1]} court={Number(court[1])} />
  const result = /^wynik-(\d+)$/.exec(route)
  if (result) return <Court key={`w${result[1]}`} court={Number(result[1])} manual />
  if (/^panel(-[a-z]+)?$/.test(route)) return <><BrandBar /><Organizer route={route} /></>
  const fix = /^korekta-(.+)$/.exec(route)
  if (fix) return <Correction key={fix[1]} matchId={fix[1]} />
  if (route === 'sedzia') return <CourtPicker />
  if (route === 'admin') return <Admin />
  if (route === 'kartki') return <PrintCards />
  if (route === 'tv') return <Tv />
  const board = /^tablica-(\d+)$/.exec(route)
  if (board) return <Scoreboard court={Number(board[1])} />
  if (route === 'kamera') return <CameraBoards />
  if (route === 'zgloszenie') return <RegistrationPage />
  if (route === 'o-systemie') return <About />
  if (route === 'nowy-turniej') return <NewTournament />
  if (['konto', 'rejestracja', 'moje-turnieje', 'kredyty', 'lista-turniejow'].includes(route) || route.startsWith('moj-turniej-')) return <AccountPage key={route} view={route} />
  return <><BrandBar /><Public route={route} /></>
}
