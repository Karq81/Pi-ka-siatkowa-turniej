import { demoState } from '../logic/demo'
import type { Role, State } from '../types'
import type { Store, SyncInfo } from './types'

const KEY = 'siatkalive:v1'
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
  let state = read<State>(KEY) ?? demoState()
  let pins = read<{ admin: string; court: string }>(PINS_KEY) ?? { admin: '1234', court: '0000' }
  let role = read<Role>(ROLE_KEY, () => sessionStorage)
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
    role: () => role,
    async login(r, pin) {
      const ok = pin === pins.admin || (r === 'court' && pin === pins.court)
      if (ok) {
        role = pin === pins.admin ? 'admin' : 'court'
        write(ROLE_KEY, role, () => sessionStorage)
        notify()
      }
      return ok
    },
    updateMatch(id, update) {
      commit({
        ...state,
        matches: state.matches.map((m) => (m.id === id ? { ...update(m), updatedAt: Date.now() } : m)),
      })
    },
    async replace(next) {
      commit(next)
    },
    updateTournament(patch) {
      commit({ ...state, tournament: { ...state.tournament, ...patch } })
    },
    async setPins(admin, court) {
      pins = { admin, court }
      write(PINS_KEY, pins)
    },
    clearError() {},
  }
}
