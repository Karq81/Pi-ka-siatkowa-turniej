import { useSyncExternalStore } from 'react'
import type { State } from '../types'
import { firebaseConfig, TOURNAMENT_ID } from '../config'
import { createFirebaseStore } from './firebase'
import { createLocalStore } from './local'
import type { Store, SyncInfo } from './types'

export const store: Store = firebaseConfig
  ? createFirebaseStore(firebaseConfig, TOURNAMENT_ID)
  : createLocalStore()

export function useStore(): State {
  return useSyncExternalStore(store.subscribe, store.get)
}

export function useSync(): SyncInfo {
  return useSyncExternalStore(store.subscribe, store.sync)
}

export function useSession() {
  return useSyncExternalStore(store.subscribe, store.session)
}
