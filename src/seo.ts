import { useEffect } from 'react'

function upsert(selector: string, create: () => HTMLElement, attr: string, value: string) {
  let el = document.head.querySelector<HTMLElement>(selector)
  if (!el) {
    el = create()
    document.head.appendChild(el)
  }
  el.setAttribute(attr, value)
}

const meta = (key: 'name' | 'property', name: string, content: string) =>
  upsert(`meta[${key}="${name}"]`, () => {
    const el = document.createElement('meta')
    el.setAttribute(key, name)
    return el
  }, 'content', content)

/**
 * Sets the page's title, description and canonical address (also the ones shown when the
 * link is shared) for this tournament. `null` leaves the page as the HTML file has it.
 * Search engines that run the page's scripts read these; the address has no "#…" part,
 * because everything after "#" is ignored by them.
 */
export function usePageMeta(page: { title: string; description: string; canonical: string } | null) {
  const { title, description, canonical } = page ?? { title: '', description: '', canonical: '' }
  const active = page !== null
  useEffect(() => {
    if (!active) return
    document.title = title
    meta('name', 'description', description)
    meta('property', 'og:title', title)
    meta('property', 'og:description', description)
    meta('property', 'og:url', canonical)
    upsert('link[rel="canonical"]', () => {
      const el = document.createElement('link')
      el.setAttribute('rel', 'canonical')
      return el
    }, 'href', canonical)
  }, [active, title, description, canonical])
}
