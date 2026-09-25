import { initializeApp, type FirebaseOptions } from 'firebase/app'
import { connectAuthEmulator, getAuth, onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth'
import {
  collection, connectFirestoreEmulator, doc, getDoc, getFirestore, initializeFirestore, onSnapshot, persistentLocalCache,
  persistentMultipleTabManager, setDoc, updateDoc, writeBatch, type Firestore,
} from 'firebase/firestore'
import { initialState } from '../logic/demo'
import { applyMatchUpdate } from '../logic/knockout'
import type { Match, Pins, Session, State } from '../types'
import type { Store, SyncInfo } from './types'

/*
 * Firestore layout (see firestore.rules):
 *   tournaments/{t}                 settings, categories, groups, teams (one small document)
 *   tournaments/{t}/matches/{id}    one document per match, so courts write independently
 *   tournaments/{t}/private/pins    admin PIN and one key per court, readable only by the admin
 *   tournaments/{t}/sessions/{uid}  a device's role (and court), granted by the rules when the key matches
 */


const LOGIN_TIMEOUT_MS = 15000

export function createFirebaseStore(config: FirebaseOptions, tournamentId: string): Store {
  const app = initializeApp(config)
  const auth = getAuth(app)
  let db: Firestore
  try {
    // Keeps data and queued writes on the device, so a referee can keep scoring without signal.
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })
  } catch {
    db = getFirestore(app)
  }
  if (import.meta.env.VITE_USE_EMULATOR) {
    // Local testing against `firebase emulators:start`.
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(db, '127.0.0.1', 8080)
  }

  const tRef = doc(db, 'tournaments', tournamentId)
  const matchesRef = collection(tRef, 'matches')
  const roleKey = `siatkalive:role:${tournamentId}`

  // Until the tournament is saved, show the qualified teams, so the organiser can draw right away.
  let state: State = initialState()
  let sync: SyncInfo = { mode: 'online', connected: false, pending: false, empty: false, error: null }
  let session: Session | null = null
  try { session = JSON.parse(localStorage.getItem(roleKey) ?? 'null') as Session | null } catch { /* no storage */ }
  if (session && typeof session !== 'object') session = null

  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((l) => l())
  const setSync = (patch: Partial<SyncInfo>) => { sync = { ...sync, ...patch }; notify() }
  const fail = (what: string) => (e: unknown) => {
    const code = (e as { code?: string }).code
    const msg = code === 'permission-denied'
      ? `${what}: brak uprawnień. Zaloguj się ponownie PIN-em.`
      : `${what}: nie udało się zapisać. Sprawdź internet i spróbuj jeszcze raz.`
    console.error(what, e)
    if (code === 'permission-denied') saveSession(null)
    setSync({ error: msg })
  }

  const user = new Promise<User>((resolve) => {
    onAuthStateChanged(auth, (u) => { if (u) resolve(u) })
  })
  signInAnonymously(auth).catch(fail('Logowanie'))

  onSnapshot(tRef, { includeMetadataChanges: true }, (snap) => {
    const data = snap.data() as Omit<State, 'matches'> | undefined
    if (data) state = { ...state, ...data, matches: state.matches }
    setSync({ empty: !snap.exists() && !snap.metadata.fromCache, connected: !snap.metadata.fromCache })
  }, fail('Odczyt turnieju'))

  onSnapshot(matchesRef, { includeMetadataChanges: true }, (snap) => {
    state = { ...state, matches: snap.docs.map((d) => d.data() as Match) }
    setSync({ pending: snap.metadata.hasPendingWrites, connected: !snap.metadata.fromCache })
  }, fail('Odczyt meczów'))

  const saveSession = (s: Session | null) => {
    session = s
    try { if (s) localStorage.setItem(roleKey, JSON.stringify(s)); else localStorage.removeItem(roleKey) } catch { /* no storage */ }
    notify()
  }

  const withTimeout = <T,>(p: Promise<T>) =>
    Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej({ code: 'timeout' }), LOGIN_TIMEOUT_MS))])

  async function login(pin: string, court?: number): Promise<boolean> {
    const u = await user
    const ref = doc(tRef, 'sessions', u.uid)
    // The rules accept the session only if the key matches; try admin first so the
    // chief referee's PIN also opens every court panel.
    const candidates: Session[] = [{ role: 'admin' }, ...(court ? [{ role: 'court' as const, court }] : [])]
    for (const candidate of candidates) {
      try {
        await withTimeout(setDoc(ref, { ...candidate, pin }))
        saveSession(candidate)
        return true
      } catch (e) {
        if ((e as { code?: string }).code === 'timeout') {
          setSync({ error: 'Brak połączenia z internetem. Logowanie PIN-em wymaga internetu.' })
          return false
        }
      }
    }
    return false
  }

  const stripMatches = (s: State) => {
    const { matches: _ignored, ...rest } = s
    return rest
  }

  return {
    get: () => state,
    sync: () => sync,
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    session: () => session,
    login,
    logout: () => saveSession(null),
    updateMatch(id, update) {
      // Also fills in knockout teams that follow from this result, in one atomic write.
      const changed = applyMatchUpdate(state, id, update)
      if (!changed.length) return
      const b = writeBatch(db)
      for (const m of changed) b.set(doc(matchesRef, m.id), m)
      b.commit().catch(fail('Zapis wyniku'))
    },
    async replace(next) {
      const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = []
      const keep = new Set(next.matches.map((m) => m.id))
      for (const m of state.matches) if (!keep.has(m.id)) ops.push((b) => b.delete(doc(matchesRef, m.id)))
      for (const m of next.matches) ops.push((b) => b.set(doc(matchesRef, m.id), m))
      try {
        await setDoc(tRef, stripMatches(next))
        for (let i = 0; i < ops.length; i += 400) {
          const b = writeBatch(db)
          ops.slice(i, i + 400).forEach((op) => op(b))
          await b.commit()
        }
      } catch (e) {
        fail('Zapis turnieju')(e)
      }
    },
    updateTournament(patch) {
      state = { ...state, tournament: { ...state.tournament, ...patch } }
      notify()
      updateDoc(tRef, { tournament: state.tournament }).catch(fail('Zapis ustawień'))
    },
    async getPins() {
      try {
        const snap = await getDoc(doc(tRef, 'private', 'pins'))
        return (snap.data() as Pins | undefined) ?? null
      } catch {
        return null
      }
    },
    async setPins(pins) {
      await setDoc(doc(tRef, 'private', 'pins'), pins)
      // Sessions are tied to the key they used; log this device in again with the new admin PIN.
      if (!(await login(pins.adminPin))) saveSession(null)
    },
    clearError() { setSync({ error: null }) },
  }
}
