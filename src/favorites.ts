import { useSyncExternalStore } from 'react'

/**
 * Teams a visitor follows ("Moje drużyny"), kept on this phone only. A coach can
 * follow several teams; they are highlighted everywhere and listed on the start page.
 */
const KEY = 'siatkalive:moje-druzyny'
const listeners = new Set<() => void>()

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    const v = raw ? JSON.parse(raw) : []
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

let current = read()

export function setFavorites(ids: string[]) {
  current = [...new Set(ids)]
  try { localStorage.setItem(KEY, JSON.stringify(current)) } catch { /* private mode: keep for this visit */ }
  listeners.forEach((l) => l())
}

export function toggleFavorite(id: string) {
  setFavorites(current.includes(id) ? current.filter((x) => x !== id) : [...current, id])
}

export function useFavorites(): string[] {
  return useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
    () => current,
  )
}
