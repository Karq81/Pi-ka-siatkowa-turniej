import { initialState } from '../logic/demo'
import { applyMatchUpdate } from '../logic/knockout'
import type { Pins, Session, State } from '../types'
import type { Store, SyncInfo } from './types'

const KEY = 'siatkalive:v3'
const PINS_KEY = 'siatkalive:pins'
const ROLE_KEY = 'siatkalive:role'

function read<T>(key: string, storage: () => Storage = () => localStorage): T | null {
  try {
    const raw = storage().getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown, storage: () => Storage = () => localStorage) {
  try {
    storage().setItem(key, JSON.stringify(value))
  } catch {
    // Storage unavailable (private mode, preview): keep working in memory.
  }
}

/** Browser-only store: syncs tabs on one device. Used when Firebase is not configured. */
export function createLocalStore(): Store {
  let state = read<State>(KEY) ?? initialState()
  // Demo keys: admin 1234, court N → 100N (e.g. court 3 → 1003).
  const demoPins: Pins = {
    adminPin: '1234',
    courts: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i + 1), String(1001 + i)])),
  }
  let pins = read<Pins>(PINS_KEY)
  if (!pins?.courts) pins = demoPins
  let session = read<Session>(ROLE_KEY, () => sessionStorage)
  const saveSession = (s: Session | null) => {
    session = s
    write(ROLE_KEY, s, () => sessionStorage)
    notify()
  }
  const sync: SyncInfo = { mode: 'local', connected: true, pending: false, empty: false, error: null }
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((l) => l())

  let channel: BroadcastChannel | null = null
  try {
    channel = new BroadcastChannel(KEY)
    channel.onmessage = (e) => {
      state = e.data as State
      notify()
    }
  } catch {
    channel = null
  }

  const commit = (next: State) => {
    state = next
    write(KEY, next)
    channel?.postMessage(next)
    notify()
  }

  return {
    get: () => state,
    sync: () => sync,
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    session: () => session,
    async login(pin, court) {
      if (pin === pins!.adminPin) saveSession({ role: 'admin' })
      else if (court && pin === pins!.courts[String(court)]) saveSession({ role: 'court', court })
      else return false
      return true
    },
    logout: () => saveSession(null),
    updateMatch(id, update) {
      const changed = new Map(applyMatchUpdate(state, id, update).map((m) => [m.id, m]))
      commit({ ...state, matches: state.matches.map((m) => changed.get(m.id) ?? m) })
    },
    async replace(next) {
      commit(next)
    },
    updateTournament(patch) {
      commit({ ...state, tournament: { ...state.tournament, ...patch } })
    },
    async getPins() {
      return session?.role === 'admin' ? pins : null
    },
    async setPins(next) {
      pins = next
      write(PINS_KEY, next)
      if (session?.role === 'admin') saveSession({ role: 'admin' })
    },
    clearError() {},
  }
}
