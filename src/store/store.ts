import { useSyncExternalStore } from 'react'
import { demoState } from '../logic/demo'
import type { Match, State } from '../types'

/**
 * Data layer. This first version keeps everything in the browser
 * (localStorage) and syncs open tabs on the same device, which is enough
 * to click through the app. The next step swaps this for a shared online
 * database (Firebase) behind the same functions, so the views don't change.
 */
export interface Store {
  get(): State
  subscribe(fn: () => void): () => void
  updateMatch(id: string, update: (m: Match) => Match): void
  replace(state: State): void
}

const KEY = 'siatkalive:v1'

function load(): State | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as State) : null
  } catch {
    return null
  }
}

function save(state: State) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // Storage unavailable (private mode, preview): keep working in memory.
  }
}

function createLocalStore(): Store {
  let state = load() ?? demoState()
  const listeners = new Set<() => void>()
  let channel: BroadcastChannel | null = null
  try {
    channel = new BroadcastChannel(KEY)
    channel.onmessage = (e) => {
      state = e.data as State
      listeners.forEach((l) => l())
    }
  } catch {
    channel = null
  }

  const commit = (next: State) => {
    state = next
    save(next)
    channel?.postMessage(next)
    listeners.forEach((l) => l())
  }

  return {
    get: () => state,
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    updateMatch(id, update) {
      commit({
        ...state,
        matches: state.matches.map((m) => (m.id === id ? { ...update(m), updatedAt: Date.now() } : m)),
      })
    },
    replace: commit,
  }
}

export const store: Store = createLocalStore()

export function useStore(): State {
  return useSyncExternalStore(store.subscribe, store.get)
}
