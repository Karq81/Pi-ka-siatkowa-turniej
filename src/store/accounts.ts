import {
  createUserWithEmailAndPassword, EmailAuthProvider, onAuthStateChanged, reauthenticateWithCredential, signInAnonymously,
  signInWithEmailAndPassword, signOut, updatePassword, updateProfile,
} from 'firebase/auth'
import { arrayUnion, doc, onSnapshot, setDoc, updateDoc, type Unsubscribe } from 'firebase/firestore'
import { useSyncExternalStore } from 'react'
import { TOURNAMENT_ID } from '../config'
import { firebaseHandles } from './firebase'
import { store } from './store'

/**
 * Organiser accounts. An account signs in with a login (or e-mail) and a password; it keeps
 * the list of its tournaments with their chief-referee PINs, so opening one of them from
 * "Moje konto" logs the organiser in without typing the PIN.
 *
 * Firestore: accounts/{uid} = { login, name, tournaments: [{ id, name, pin }] },
 * readable and writable only by the account itself (see firestore.rules).
 */
export interface AccountTournament {
  id: string
  name: string
  pin: string
}

/** Details the organiser may fill in on "Moje konto"; all optional. */
export interface AccountProfile {
  /** Club or organiser name, shown at the top of the account. */
  name: string
  contactName?: string
  phone?: string
  email?: string
  city?: string
  website?: string
  about?: string
}

export interface Account extends AccountProfile {
  uid: string
  /** False until the account's details have been read from the database. */
  loaded?: boolean
  login: string
  tournaments: AccountTournament[]
}

export type AccountState =
  | { status: 'unavailable' }
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; account: Account }

/** Logins without "@" become addresses in this domain (no mail is ever sent to them). */
const LOGIN_DOMAIN = 'konta.sportlivearena.com'

export const LOGIN_PATTERN = /^[a-z0-9][a-z0-9._-]{2,29}$/

export function loginToEmail(login: string): string {
  const l = login.trim().toLowerCase()
  return l.includes('@') ? l : `${l}@${LOGIN_DOMAIN}`
}

function emailToLogin(email: string | null): string {
  if (!email) return ''
  return email.endsWith(`@${LOGIN_DOMAIN}`) ? email.slice(0, -LOGIN_DOMAIN.length - 1) : email
}

let state: AccountState = firebaseHandles ? { status: 'loading' } : { status: 'unavailable' }
const listeners = new Set<() => void>()
const set = (next: AccountState) => { state = next; listeners.forEach((l) => l()) }

let stopDoc: Unsubscribe | null = null
let autoLoginTried = false

if (firebaseHandles) {
  const { auth, db } = firebaseHandles
  onAuthStateChanged(auth, (user) => {
    stopDoc?.()
    stopDoc = null
    if (!user || user.isAnonymous) {
      set({ status: 'signed-out' })
      return
    }
    const base: Account = { uid: user.uid, login: emailToLogin(user.email), name: user.displayName ?? '', tournaments: [] }
    set({ status: 'signed-in', account: base })
    stopDoc = onSnapshot(doc(db, 'accounts', user.uid), (snap) => {
      const data = snap.data() as Partial<Account> | undefined
      const account = { ...base, ...data, uid: user.uid, tournaments: data?.tournaments ?? [], loaded: true }
      set({ status: 'signed-in', account })
      // Opening one of the account's tournaments logs in as its chief referee.
      const own = account.tournaments.find((t) => t.id === TOURNAMENT_ID)
      if (own && !autoLoginTried && store.session()?.role !== 'admin') {
        autoLoginTried = true
        void store.login(own.pin)
      }
    }, () => set({ status: 'signed-in', account: base }))
  })
}

export function useAccount(): AccountState {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn) }, () => state)
}

export function currentAccount(): Account | null {
  return state.status === 'signed-in' ? state.account : null
}

const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Zły login albo hasło.',
  'auth/wrong-password': 'Zły login albo hasło.',
  'auth/requires-recent-login': 'Zaloguj się ponownie i spróbuj jeszcze raz.',
  'auth/user-not-found': 'Nie ma takiego konta.',
  'auth/invalid-email': 'Nieprawidłowy login.',
  'auth/email-already-in-use': 'Ten login jest już zajęty.',
  'auth/weak-password': 'Hasło musi mieć co najmniej 6 znaków.',
  'auth/too-many-requests': 'Za dużo prób. Spróbuj za kilka minut.',
  'auth/network-request-failed': 'Brak połączenia z internetem.',
  'auth/operation-not-allowed': 'Zakładanie kont jest jeszcze wyłączone. Administrator musi je włączyć w Firebase.',
}

export function accountError(e: unknown): string {
  const code = (e as { code?: string }).code ?? ''
  return MESSAGES[code] ?? 'Nie udało się. Spróbuj jeszcze raz.'
}

export async function signInAccount(login: string, password: string) {
  const { auth } = firebaseHandles!
  // Keys typed on this device belonged to the previous (anonymous) user.
  store.logout()
  autoLoginTried = false
  await signInWithEmailAndPassword(auth, loginToEmail(login), password)
}

export async function createAccount(login: string, password: string, name: string) {
  const { auth, db } = firebaseHandles!
  store.logout()
  autoLoginTried = false
  const cred = await createUserWithEmailAndPassword(auth, loginToEmail(login), password)
  if (name) await updateProfile(cred.user, { displayName: name })
  await setDoc(doc(db, 'accounts', cred.user.uid), {
    login: login.trim().toLowerCase(), name, tournaments: [], createdAt: Date.now(),
  })
}

/** New password for the signed-in account; the current one confirms it is the owner. */
export async function changePassword(current: string, next: string) {
  const user = firebaseHandles!.auth.currentUser
  if (!user?.email) throw { code: 'auth/invalid-credential' }
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current))
  await updatePassword(user, next)
}

export async function signOutAccount() {
  const { auth } = firebaseHandles!
  store.logout()
  await signOut(auth)
  await signInAnonymously(auth)
}

/** Saves the account's details (name, contact…). */
export async function saveProfile(profile: AccountProfile) {
  const account = currentAccount()
  if (!account || !firebaseHandles) return
  const { auth, db } = firebaseHandles
  await setDoc(doc(db, 'accounts', account.uid), profile, { merge: true })
  if (auth.currentUser && profile.name !== account.name) await updateProfile(auth.currentUser, { displayName: profile.name })
}

/** After a PIN change: the account keeps the tournament's new PIN, so opening it still logs in. */
export async function updateTournamentPin(id: string, pin: string) {
  const account = currentAccount()
  if (!account || !firebaseHandles) return
  if (!account.tournaments.some((t) => t.id === id)) return
  const tournaments = account.tournaments.map((t) => (t.id === id ? { ...t, pin } : t))
  await updateDoc(doc(firebaseHandles.db, 'accounts', account.uid), { tournaments })
}

/** Remembers a tournament (and its PIN) on the signed-in account. */
export async function addTournamentToAccount(entry: AccountTournament) {
  const account = currentAccount()
  if (!account || !firebaseHandles) return
  if (account.tournaments.some((t) => t.id === entry.id)) return
  const ref = doc(firebaseHandles.db, 'accounts', account.uid)
  try {
    await updateDoc(ref, { tournaments: arrayUnion(entry) })
  } catch {
    await setDoc(ref, { login: account.login, name: account.name, tournaments: [entry] }, { merge: true })
  }
}
