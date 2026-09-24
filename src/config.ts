import type { FirebaseOptions } from 'firebase/app'

/**
 * Firebase project settings (Firebase console → Project settings → Your apps → Web app).
 * These values are not secret: they identify the project; access is controlled by
 * firestore.rules. Set them in `.env.local` (see `.env.example`) or in the hosting
 * provider's environment variables. Without them the app runs in local demo mode.
 */
const env = import.meta.env

export const firebaseConfig: FirebaseOptions | null = env.VITE_FIREBASE_API_KEY
  ? {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      appId: env.VITE_FIREBASE_APP_ID,
    }
  : null

export const TOURNAMENT_ID: string = env.VITE_TOURNAMENT_ID || 'main'
