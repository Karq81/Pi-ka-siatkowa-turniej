/**
 * Usage and credits. Google bills Firebase for the whole project, not per tournament, so the
 * site counts its own usage: every opening of a tournament's page is one "wejście" (visit).
 * A visit reads about READS_PER_VIEW database documents (the tournament and its court
 * sheets, then live updates), which is what Firebase charges for.
 *
 * Each account has a free daily allowance of visits; beyond it, visits use the account's
 * credits (bought in advance). All prices here are the organiser's proposal and can change.
 */

/** Database reads per visit: ~11 on opening plus live updates while the page stays open. */
export const READS_PER_VIEW = 15

/** Firebase price of 100 000 document reads (USD, Blaze plan, europe), and the exchange rate. */
export const FIREBASE_USD_PER_100K_READS = 0.06
export const PLN_PER_USD = 4

/** Visits per day per account that cost the organiser nothing. */
export const FREE_VIEWS_PER_DAY = 1000

/** Credit packages: visits over the free allowance, and their price. */
export const PACKAGES = [
  { views: 5_000, pln: 9 },
  { views: 20_000, pln: 29 },
  { views: 100_000, pln: 99 },
]

/** What Firebase charges for this many visits (PLN). */
export function firebaseCostPln(views: number): number {
  return (views * READS_PER_VIEW / 100_000) * FIREBASE_USD_PER_100K_READS * PLN_PER_USD
}

/** Price for the organiser of visits over the free allowance (PLN), at the smallest package's rate. */
export function pricePln(views: number): number {
  const p = PACKAGES[0]
  return Math.max(0, views) * p.pln / p.views
}

/** Share of today's free allowance used (0–100, may exceed 100). */
export function freeUsedPercent(viewsToday: number): number {
  return Math.round(viewsToday * 100 / FREE_VIEWS_PER_DAY)
}

/** Local date as used for the daily usage documents: 2026-10-24. */
export function dayKey(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function formatPln(v: number): string {
  return `${v.toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`
}import { locale } from '../i18n'

