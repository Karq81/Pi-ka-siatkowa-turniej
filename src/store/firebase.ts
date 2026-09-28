import { t, tk } from '../i18n'
import { initializeApp, type FirebaseOptions } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInAnonymously, type Auth } from 'firebase/auth'
import {
  addDoc, collection, connectFirestoreEmulator, doc, FieldPath, getDoc, getDocs, getFirestore, increment, initializeFirestore, onSnapshot, persistentLocalCache,
  persistentMultipleTabManager, setDoc, updateDoc, writeBatch, type Firestore,
} from 'firebase/firestore'
import { applyMatchUpdate } from '../logic/knockout'
import { boardKey, publicBoard } from '../logic/publicBoard'
import { dayKey } from '../logic/usage'
import type { Entry, Match, Pins, Session, State, LiveClock } from '../types'
import type { Store, SyncInfo } from './types'
import { backups, backupScore, dropBackup, openLive, type LiveChannel, type LiveEntry } from './live'

/*
 * Firestore layout (see firestore.rules):
 *   tournaments/{t}                 settings, categories, groups, teams (one small document)
 *   tournaments/{t}/matches/court-N one "sheet" per court: { court: N, status: 'scheduled',
 *                                   matches: { [id]: Match } }. A phone opening the page
 *                                   reads ~10 documents instead of one per match, and a
 *                                   result (with the court's times moving) changes one.
 *                                   Courts still write independently; `court` and `status`
 *                                   are there for the access rules (a court's referee may
 *                                   update only that court's sheet).
 *   tournaments/{t}/private/pins    admin PIN and one key per court, readable only by the admin
 *   tournaments/{t}/sessions/{uid}  a device's role (and court), granted by the rules when the key matches
 *
 * Points of a match in progress go to the Realtime Database instead (see live.ts): fans get
 * every point for a few bytes. Firestore gets the start, every finished set, the result and
 * any correction, so it always holds the match's state up to its last complete set. Without
 * the Realtime Database (not set up, no session there) everything goes to Firestore.
 */

/** A hidden page stops following the tournament after this long (and resumes when shown). */
const PAUSE_HIDDEN_MS = 2 * 60 * 1000

/** How far phones' clocks may differ when a Firestore change and a live score are compared. */
const CLOCK_SLACK_MS = 60 * 1000


const LOGIN_TIMEOUT_MS = 15000

/** The Firebase app's auth and database, for organiser accounts (see accounts.ts). */
export let firebaseHandles: { auth: Auth; db: Firestore } | null = null

/** Court sheet documents are named court-1, court-2, … */
const SHEET_PREFIX = 'court-'

interface CourtSheet {
  court: number
  /** Always "scheduled": the access rules let a court's referee update a sheet that is not finished. */
  status: 'scheduled'
  matches: Record<string, Match>
}

/**
 * `listen`: follow the tournament's data. Off on the service's front page, which shows no
 * tournament, so its visitors cost no database reads.
 */
export function createFirebaseStore(config: FirebaseOptions, tournamentId: string, initial: State, listen = true): Store {
  const app = initializeApp(config)
  const auth = getAuth(app)
  let db: Firestore
  try {
    // Keeps data and queued writes on the device, so a referee can keep scoring without signal.
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      ignoreUndefinedProperties: true,
    })
  } catch {
    db = getFirestore(app)
  }
  if (import.meta.env.VITE_USE_EMULATOR) {
    // Local testing against `firebase emulators:start`.
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(db, '127.0.0.1', 8080)
  }

  firebaseHandles = { auth, db }

  const tRef = doc(db, 'tournaments', tournamentId)
  const matchesRef = collection(tRef, 'matches')
  const sheetRef = (court: number) => doc(matchesRef, `${SHEET_PREFIX}${court}`)
  const roleKey = `siatkalive:role:${tournamentId}`

  // Until the tournament is saved, show what it will start with (Albatros CUP: its fixed groups;
  // a new tournament: the settings from "Załóż turniej").
  let state: State = initial
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
      ? t('{what}: brak uprawnień. Zaloguj się ponownie PIN-em.', { what: t(what) })
      : t('{what}: nie udało się zapisać. Sprawdź internet i spróbuj jeszcze raz.', { what: t(what) })
    console.error(what, e)
    if (code === 'permission-denied') saveSession(null)
    setSync({ error: msg })
  }

  // Every device is signed in: with an organiser account if it logged in to one on this
  // device, otherwise anonymously. Sessions (PIN logins) belong to whoever is signed in.
  const ready = auth.authStateReady()
    .then(() => (auth.currentUser ? undefined : signInAnonymously(auth).then(() => undefined)))
    .catch(fail(tk('Logowanie')))
  const currentUser = async () => {
    await ready
    if (!auth.currentUser) await signInAnonymously(auth)
    return auth.currentUser!
  }

  // One visit of this tournament's pages, for the organiser's usage counter. Counted once the
  // tournament is known to exist: a refused write would restart the write stream, and the
  // SDK would then send other pending counters twice.
  let visitCounted = false
  const countVisit = () => {
    if (visitCounted) return
    visitCounted = true
    setDoc(doc(tRef, 'usage', dayKey()), { views: increment(1) }, { merge: true }).catch(() => {})
  }

  // Live scores (Realtime Database) of matches in progress. They win over Firestore for the
  // set being played; Firestore wins once it has a later set or a clearly newer change
  // (phones' clocks differ, so only a large difference counts).
  let liveScores = new Map<string, LiveEntry>()
  const newer = (m: Match, e: LiveEntry) => e.sets.length > m.sets.length
    || (e.sets.length === m.sets.length && e.at + CLOCK_SLACK_MS >= (m.updatedAt ?? 0))
  const withLive = (matches: Match[]) => matches.map((m) => {
    const e = liveScores.get(m.id)
    return m.status === 'live' && e && newer(m, e) ? { ...m, sets: e.sets } : m
  })
  const liveReady: Promise<LiveChannel | null> = listen
    ? openLive(app, tournamentId, !!import.meta.env.VITE_USE_EMULATOR).catch(() => null)
    : Promise.resolve(null)
  let live: LiveChannel | null = null
  let clocks = new Map<number, LiveClock>()

  // Documents in `matches` that are not court sheets (the old one-document-per-match layout).
  let legacy: string[] = []
  let sheetsLoaded = false
  let stops: (() => void)[] = []
  const follow = () => {
    if (stops.length) return
    stops.push(onSnapshot(tRef, { includeMetadataChanges: true }, (snap) => {
      const data = snap.data() as Omit<State, 'matches'> | undefined
      if (data) state = { ...state, ...data, matches: state.matches }
      if (snap.exists() && !snap.metadata.fromCache) countVisit()
      setSync({ empty: !snap.exists() && !snap.metadata.fromCache, connected: !snap.metadata.fromCache })
    }, fail(tk('Odczyt turnieju'))))
    stops.push(onSnapshot(matchesRef, { includeMetadataChanges: true }, (snap) => {
      const sheets = snap.docs.filter((d) => d.id.startsWith(SHEET_PREFIX))
      legacy = snap.docs.filter((d) => !d.id.startsWith(SHEET_PREFIX)).map((d) => d.id)
      const matches = sheets.length
        ? sheets.flatMap((d) => Object.values((d.data() as CourtSheet).matches ?? {}))
        : snap.docs.map((d) => d.data() as Match)
      state = { ...state, matches: withLive(matches) }
      sheetsLoaded = true
      setSync({ pending: snap.metadata.hasPendingWrites, connected: !snap.metadata.fromCache })
    }, fail(tk('Odczyt meczów'))))
    if (live) {
      stops.push(live.followClocks((map) => { clocks = map; notify() }))
      stops.push(live.follow((map) => {
        liveScores = map
        state = { ...state, matches: withLive(state.matches) }
        notify()
      }))
    }
  }
  const unfollow = () => { stops.forEach((stop) => stop()); stops = [] }

  if (listen) {
    follow()
    void liveReady.then((ch) => {
      if (!ch) return
      live = ch
      // Start following the live scores too (if the page is not paused right now).
      if (stops.length) { unfollow(); follow() }
      void resumeLiveSession()
    })
    // A phone left on the page in a pocket stops costing reads; back on screen it catches up
    // (Firestore sends only what changed meanwhile).
    let pauseTimer: ReturnType<typeof setTimeout> | undefined
    document.addEventListener('visibilitychange', () => {
      clearTimeout(pauseTimer)
      if (document.hidden) pauseTimer = setTimeout(unfollow, PAUSE_HIDDEN_MS)
      else follow()
    })
  }

  const saveSession = (s: Session | null) => {
    session = s
    try { if (s) localStorage.setItem(roleKey, JSON.stringify(s)); else localStorage.removeItem(roleKey) } catch { /* no storage */ }
    notify()
  }

  const withTimeout = <T,>(p: Promise<T>) =>
    Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej({ code: 'timeout' }), LOGIN_TIMEOUT_MS))])

  async function login(pin: string, court?: number): Promise<boolean> {
    const u = await currentUser()
    const ref = doc(tRef, 'sessions', u.uid)
    // The rules accept the session only if the key matches; try admin first so the
    // chief referee's PIN also opens every court panel.
    const candidates: Session[] = [{ role: 'admin' }, ...(court ? [{ role: 'court' as const, court }] : [])]
    for (const candidate of candidates) {
      try {
        await withTimeout(setDoc(ref, { ...candidate, pin }))
        saveSession(candidate)
        void liveSignIn(candidate, pin)
        return true
      } catch (e) {
        if ((e as { code?: string }).code === 'timeout') {
          setSync({ error: t('Brak połączenia z internetem. Logowanie PIN-em wymaga internetu.') })
          return false
        }
      }
    }
    return false
  }

  const readPins = async () => {
    try {
      return ((await getDoc(doc(tRef, 'private', 'pins'))).data() as Pins | undefined) ?? null
    } catch {
      return null
    }
  }

  /** The same key opens this device's session in the Realtime Database, for live scores. */
  async function liveSignIn(s: Session, pin: string) {
    const ch = await liveReady
    const uid = auth.currentUser?.uid
    if (!ch || !uid) return
    const court = s.role === 'court' ? s.court : undefined
    if (await ch.signIn(uid, s.role, pin, court)) { void afterLiveSignIn(); return }
    // Tournaments set up before the live scores: the chief referee copies the keys there.
    if (s.role === 'admin') {
      const pins = await readPins()
      if (pins && await ch.copyPins(pins) && await ch.signIn(uid, s.role, pin, court)) void afterLiveSignIn()
    }
  }

  /** After a reload: the device's session, with its key, is in Firestore. */
  async function resumeLiveSession() {
    if (!session) return
    try {
      const u = await currentUser()
      const saved = (await getDoc(doc(tRef, 'sessions', u.uid))).data() as { pin?: string } | undefined
      if (saved?.pin) await liveSignIn(session, saved.pin)
    } catch { /* no session: nothing to resume */ }
  }

  async function afterLiveSignIn() {
    await restoreBackups()
    // The camera apps' key: boards are written only while the organiser has it turned on.
    if (!stopStreamKey && live) {
      stopStreamKey = live.followStreamKey((key) => {
        if (key === streamKey) return
        streamKey = key
        boardsSent.clear()
        publishBoards(allCourts())
      })
    }
    publishBoards(allCourts())
  }

  /** Points typed on this phone that never reached the database (page reloaded offline). */
  async function restoreBackups() {
    for (let i = 0; i < 20 && !sheetsLoaded; i++) await new Promise((r) => setTimeout(r, 500))
    for (const [id, e] of backups(tournamentId)) {
      const m = state.matches.find((x) => x.id === id)
      if (!m || m.status !== 'live') { dropBackup(tournamentId, id); continue }
      // The backup and the live score both come from this phone, so their times compare.
      const sent = liveScores.get(id)
      const same = JSON.stringify(e.sets) === JSON.stringify(m.sets)
      if (!same && e.sets.length >= m.sets.length && (!sent || e.at >= sent.at)) store.updateMatch(id, (x) => ({ ...x, sets: e.sets }))
    }
  }

  /**
   * The courts' scoreboards for camera apps (board/… in the Realtime Database), written by
   * the phones that score: a court's referee its own court, the chief referee every court.
   */
  const boardsSent = new Map<number, string>()
  let streamKey: string | null = null
  let stopStreamKey: (() => void) | null = null
  const publishBoards = (courts: Iterable<number>, from: State = state) => {
    // Before the matches are loaded, the board would say the court is empty.
    if (!live?.canWrite() || !session || !streamKey || (from === state && !sheetsLoaded)) return
    for (const c of new Set(courts)) {
      if (session.role === 'court' && session.court !== c) continue
      if (c < 1 || c > from.tournament.courts) continue
      const board = publicBoard(from, c, Date.now())
      const key = boardKey(board)
      if (boardsSent.get(c) === key) continue
      boardsSent.set(c, key)
      live.writeBoard(streamKey, c, board)
    }
  }
  const allCourts = (s: State = state) => Array.from({ length: s.tournament.courts }, (_, i) => i + 1)

  /** Writes whole matches into their courts' Firestore sheets. */
  const writeSheets = (changed: Match[]) => {
    // Each changed match replaces its own entry in its court's sheet; other matches on
    // the sheet (maybe written by another phone at the same time) are left alone.
    const b = writeBatch(db)
    const byCourt = new Map<number, Match[]>()
    for (const m of changed) byCourt.set(m.court, [...(byCourt.get(m.court) ?? []), m])
    for (const [court, ms] of byCourt) {
      const [first, ...more] = ms.flatMap((m) => [new FieldPath('matches', m.id), m])
      b.update(sheetRef(court), first as FieldPath, more[0], ...more.slice(1))
    }
    b.commit().catch(fail(tk('Zapis wyniku')))
  }

  const stripMatches = (s: State) => {
    const { matches: _ignored, ...rest } = s
    return rest
  }

  const store: Store = {
    get: () => state,
    sync: () => sync,
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    session: () => session,
    login,
    logout: () => saveSession(null),
    publishClock(court, clock) {
      if (clock) clocks.set(court, clock)
      else clocks.delete(court)
      live?.writeClock(court, clock)
      notify()
    },
    clock: (court) => clocks.get(court) ?? null,
    now: () => live?.serverNow() ?? Date.now(),
    updateMatch(id, update) {
      const before = state.matches.find((m) => m.id === id)
      // Also fills in knockout teams that follow from this result, in one atomic write.
      const changed = applyMatchUpdate(state, id, update)
      if (!changed.length || !before) return
      // Shown at once, so the next quick tap (+1, +1…) builds on this one instead of on the
      // state before it; the database snapshot then confirms the same values.
      const byId = new Map(changed.map((m) => [m.id, m]))
      state = { ...state, matches: state.matches.map((m) => byId.get(m.id) ?? m) }
      notify()
      const m = changed[0]
      const entry = { sets: m.sets, at: m.updatedAt }
      // A point in the set being played: only the live score changes.
      const point = changed.length === 1 && before.status === 'live' && m.status === 'live'
        && m.sets.length > 0 && m.sets.length === before.sets.length && m.court === before.court
      if (point && live?.canWrite()) {
        liveScores.set(id, entry)
        backupScore(tournamentId, id, entry)
        live.write(m.court, id, entry, () => writeSheets([m]))
        publishBoards([m.court])
        return
      }
      writeSheets(changed)
      for (const c of changed) {
        if (c.status === 'live' && live?.canWrite()) {
          const e = { sets: c.sets, at: c.updatedAt }
          liveScores.set(c.id, e)
          live.write(c.court, c.id, e, () => {})
        } else if (c.status !== 'live') {
          liveScores.delete(c.id)
          dropBackup(tournamentId, c.id)
          live?.clear(c.court, c.id)
        }
      }
      publishBoards([before.court, ...changed.map((c) => c.court)])
    },
    async replace(next) {
      const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = []
      const sheets = new Map<number, Record<string, Match>>()
      for (const m of next.matches) sheets.set(m.court, { ...(sheets.get(m.court) ?? {}), [m.id]: m })
      const old = new Set(state.matches.map((m) => m.court))
      for (const c of old) if (!sheets.has(c)) ops.push((b) => b.delete(sheetRef(c)))
      for (const id of legacy) ops.push((b) => b.delete(doc(matchesRef, id)))
      for (const [court, matches] of sheets) {
        const sheet: CourtSheet = { court, status: 'scheduled', matches }
        ops.push((b) => b.set(sheetRef(court), sheet))
      }
      // New timetable or cleared results: live scores of the old one must not come back.
      live?.clearAll()
      try {
        await setDoc(tRef, stripMatches(next))
        for (let i = 0; i < ops.length; i += 400) {
          const b = writeBatch(db)
          ops.slice(i, i + 400).forEach((op) => op(b))
          await b.commit()
        }
        publishBoards(allCourts(next), next)
        return true
      } catch (e) {
        fail(tk('Zapis turnieju'))(e)
        return false
      }
    },
    updateTournament(patch) {
      state = { ...state, tournament: { ...state.tournament, ...patch } }
      notify()
      updateDoc(tRef, { tournament: state.tournament }).catch(fail(tk('Zapis ustawień')))
      publishBoards(allCourts())
    },
    getPins: readPins,
    async setPins(pins) {
      // The live scores' copy of the keys changes first, while the old admin PIN still opens it.
      // (Not connected: the keys are copied later, when the chief referee logs in.)
      const ch = await liveReady
      if (ch?.connected()) {
        const old = await readPins()
        if (old && session?.role === 'admin') await liveSignIn({ role: 'admin' }, old.adminPin)
        await ch.copyPins(pins)
      }
      await setDoc(doc(tRef, 'private', 'pins'), pins)
      // Sessions are tied to the key they used; log this device in again with the new admin PIN.
      if (!(await login(pins.adminPin))) saveSession(null)
    },
    async newCameraKey() {
      const ch = await liveReady
      if (!ch?.canWrite() || session?.role !== 'admin') return null
      const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
      const key = Array.from(crypto.getRandomValues(new Uint8Array(10)), (n) => abc[n % abc.length]).join('')
      return (await ch.setStreamKey(key)) ? key : null
    },
    async cameraKey() {
      const ch = await liveReady
      if (!ch) return null
      if (streamKey) return streamKey
      return new Promise<string | null>((resolve) => {
        const stop = ch.followStreamKey((k) => { resolve(k); setTimeout(() => stop(), 0) })
        setTimeout(() => resolve(null), 8000)
      })
    },
    async submitEntry(entry) {
      await currentUser()
      const clean = Object.fromEntries(Object.entries(entry).filter(([, v]) => v !== undefined && v !== ''))
      await addDoc(collection(tRef, 'entries'), { ...clean, status: 'nowe', createdAt: Date.now() })
    },
    async listEntries() {
      const snap = await getDocs(collection(tRef, 'entries'))
      return snap.docs.map((d) => ({ ...(d.data() as Omit<Entry, 'id'>), id: d.id })).sort((a, b) => b.createdAt - a.createdAt)
    },
    async setEntryStatus(id, status) {
      await updateDoc(doc(tRef, 'entries', id), { status })
    },
    async addTeams(teams) {
      state = { ...state, teams: [...state.teams, ...teams] }
      notify()
      await updateDoc(tRef, { teams: state.teams }).catch(fail(tk('Zapis turnieju')))
    },
    async tournamentExists(id) {
      const snap = await getDoc(doc(db, 'tournaments', id))
      return snap.exists()
    },
    clearError() { setSync({ error: null }) },
  }
  return store
}
