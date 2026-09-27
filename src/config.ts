import type { FirebaseOptions } from 'firebase/app'

/**
 * Firebase project settings (Firebase console → Project settings → Your apps → Web app).
 * These values are not secret: they identify the project; access is controlled by
 * firestore.rules. Set them in `.env.local` (see `.env.example`) or in the hosting
 * provider's environment variables. Without them the app runs in local demo mode.
 */
const env = import.meta.env

/**
 * The tournament's own Firebase project, built into the production site so it works
 * even when the hosting provider has no environment variables set (the site then
 * silently fell back to demo mode, keeping data only on each device). Other modes
 * (dev, emulator, the single-file preview) stay on their .env files.
 */
const PRODUCTION_FIREBASE = {
  apiKey: 'AIzaSyC4rABhqN4GtuSP-FNJj0dS1Cuw73rTAZA',
  authDomain: 'turniej-siatkowki-faf22.firebaseapp.com',
  projectId: 'turniej-siatkowki-faf22',
  appId: '1:871220726534:web:1197e4ca0b443b99e32c87',
}

export const firebaseConfig: FirebaseOptions | null = env.VITE_FIREBASE_API_KEY
  ? {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      appId: env.VITE_FIREBASE_APP_ID,
    }
  : env.MODE === 'production'
    ? PRODUCTION_FIREBASE
    : null

/** A tournament set up through "Załóż turniej" is opened as `?t=its-address`. */
function tournamentFromUrl(): string | null {
  if (typeof location === 'undefined') return null
  const t = new URLSearchParams(location.search).get('t')
  return t && TOURNAMENT_SLUG.test(t) ? t : null
}

/** Allowed tournament addresses: lowercase letters, digits and hyphens. */
export const TOURNAMENT_SLUG = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/

const urlTournament = tournamentFromUrl()

export const TOURNAMENT_ID: string = urlTournament ?? (env.VITE_TOURNAMENT_ID || 'main')

/** The site's own tournament (Albatros CUP), with its invitation, fixed groups and second stage. */
export const IS_ALBATROS = urlTournament === null

/** Base of this tournament's links, e.g. https://…/?t=halowka-mielno (no hash). */
export function tournamentUrl(): string {
  return `${location.origin}${location.pathname}${urlTournament ? `?t=${urlTournament}` : ''}`
}
