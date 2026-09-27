import { useSyncExternalStore } from 'react'
import type { State } from '../types'
import { firebaseConfig, IS_ALBATROS, IS_LANDING, TOURNAMENT_ID } from '../config'
import { initialState } from '../logic/demo'
import { blankState, EMPTY_DRAFT, readDraft } from '../logic/newTournament'
import { createFirebaseStore } from './firebase'
import { createLocalStore } from './local'
import type { Store, SyncInfo } from './types'

/** What a tournament starts with before anything is saved in the database. */
const initial: State = IS_ALBATROS ? initialState() : blankState(readDraft(TOURNAMENT_ID) ?? EMPTY_DRAFT)

export const store: Store = firebaseConfig
  ? createFirebaseStore(firebaseConfig, TOURNAMENT_ID, initial, !IS_LANDING)
  : createLocalStore(TOURNAMENT_ID, initial)

export function useStore(): State {
  return useSyncExternalStore(store.subscribe, store.get)
}

export function useSync(): SyncInfo {
  return useSyncExternalStore(store.subscribe, store.sync)
}

export function useSession() {
  return useSyncExternalStore(store.subscribe, store.session)
}
