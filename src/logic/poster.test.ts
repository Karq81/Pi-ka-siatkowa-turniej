import { describe, expect, it } from 'vitest'
import { BUILTIN_SPONSOR, defaultPoster, MAX_LINES, normalizePoster, withSponsorDefault, posterDate, wrapWords, type PosterFacts } from './poster'

const facts: PosterFacts = {
  name: 'Halówka Mielno', subtitle: 'Hala sportowa', sport: 'Piłka nożna', start: '2026-10-23T09:00',
  categories: ['U10', 'U12'], teams: 8, courts: 2, registration: true, url: 'https://x.pl/?t=halowka',
  organizer: 'UKS Opty', city: 'Mielno', phone: '600 100 200', email: '', website: '',
}

describe('poster', () => {
  it('makes a poster from the facts only', () => {
    const p = defaultPoster(facts, 'pl')
    expect(p.title).toBe('Halówka Mielno')
    expect(p.where).toBe('Mielno')
    expect(p.when).toContain('2026')
    expect(p.when).toContain('09:00')
    expect(p.lines.join('|')).toContain('U10, U12')
    expect(p.lines.join('|')).toContain('600 100 200')
    expect(p.url).toBe(facts.url)
  })
  it('does not list a single category', () => {
    expect(defaultPoster({ ...facts, categories: ['Turniej'] }, 'pl').lines.join('|')).not.toContain('Kategorie')
  })
  it('leaves unknown things empty instead of inventing them', () => {
    const p = defaultPoster({ ...facts, start: undefined, city: '', subtitle: '', categories: [], teams: 0, phone: '', registration: false }, 'pl')
    expect(p.when).toBe('')
    expect(p.where).toBe('')
    expect(p.lines).toEqual([])
  })
  it('date is empty for a missing or broken start', () => {
    expect(posterDate(undefined, 'pl')).toBe('')
    expect(posterDate('kiedyś', 'pl')).toBe('')
  })
  it('keeps text within limits and a known theme', () => {
    const p = normalizePoster({ title: 'x'.repeat(500), theme: 'pink' as never, lines: Array.from({ length: 20 }, (_, i) => ` linia ${i} `), footer: '  ' })
    expect(p.title.length).toBe(70)
    expect(p.theme).toBe('blue')
    expect(p.lines).toHaveLength(MAX_LINES)
    expect(p.lines[0]).toBe('linia 0')
    expect(p.footer).toBe('')
  })
  it('accepts only the built-in logo or a small data image', () => {
    const ok = 'data:image/jpeg;base64,/9j/AAAA'
    expect(normalizePoster({ title: 'x', sponsorLogo: ok }).sponsorLogo).toBe(ok)
    expect(normalizePoster({ title: 'x', sponsorLogo: BUILTIN_SPONSOR }).sponsorLogo).toBe(BUILTIN_SPONSOR)
    expect(normalizePoster({ title: 'x', sponsorLogo: 'https://evil.example/x.png' }).sponsorLogo).toBeUndefined()
    expect(normalizePoster({ title: 'x', sponsorLogo: 'data:image/svg+xml;base64,AAAA' }).sponsorLogo).toBeUndefined()
    expect(normalizePoster({ title: 'x', sponsorLogo: '' }).sponsorLogo).toBe('')
  })
  it('Albatros CUP gets its sponsor unless it was taken off', () => {
    const base = normalizePoster({ title: 'x' })
    expect(withSponsorDefault(base, 'main').sponsorLogo).toBe(BUILTIN_SPONSOR)
    expect(withSponsorDefault({ ...base, sponsorLogo: '' }, 'main').sponsorLogo).toBe('')
    expect(withSponsorDefault(base, 'inny').sponsorLogo).toBeUndefined()
  })
  it('wraps words by width and keeps a long word whole', () => {
    expect(wrapWords('aa bb cc dd', (l) => l.length <= 5)).toEqual(['aa bb', 'cc dd'])
    expect(wrapWords('abcdefghij kk', (l) => l.length <= 5)).toEqual(['abcdefghij', 'kk'])
  })
})
