import { describe, expect, it } from 'vitest'
import { BUILTIN_SPONSOR, contactLine, defaultOptions, defaultPoster, factsFor, hasContactLine, withContactLine, MAX_LINES, normalizePoster, scrubNames, withSponsorDefault, posterDate, wrapWords, type PosterFacts } from './poster'

const facts: PosterFacts = {
  name: 'Halówka Mielno', subtitle: 'Hala sportowa', sport: 'Piłka nożna', start: '2026-10-23T09:00',
  categories: ['U10', 'U12'], teams: 8, courts: 2, registration: true, url: 'https://x.pl/?t=halowka',
  organizer: 'UKS Opty', city: 'Mielno', contactName: 'Jan Kowalski', phone: '600 100 200', email: 'klub@example.pl', website: 'https://klub.pl',
}

describe('poster', () => {
  it('makes a poster from the facts only', () => {
    const p = defaultPoster(facts, 'pl')
    expect(p.title).toBe('Halówka Mielno')
    expect(p.where).toBe('Mielno')
    expect(p.when).toContain('2026')
    expect(p.when).toContain('09:00')
    expect(p.lines.join('|')).toContain('U10, U12')
    expect(p.footer).toBe('Organizator: UKS Opty')
    expect(JSON.stringify(p)).not.toContain('600 100 200')
    expect(p.url).toBe(facts.url)
  })
  it('does not list a single category', () => {
    expect(defaultPoster({ ...facts, categories: ['Turniej'] }, 'pl').lines.join('|')).not.toContain('Kategorie')
  })
  it('leaves unknown things empty instead of inventing them', () => {
    const p = defaultPoster({ ...facts, start: undefined, city: '', subtitle: '', categories: [], teams: 0, registration: false }, 'pl')
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
  it('takes the contact person out of every text', () => {
    const p = normalizePoster({ title: 'Cup', footer: 'Organizator: UKS Opty Mielno · Jan Kowalski', lines: ['Kontakt: Jan Kowalski', 'Pytania: kowalski@example.pl', 'Wpisowe 100 zł'] })
    const q = scrubNames(p, ['Jan Kowalski'])
    expect(JSON.stringify(q)).not.toMatch(/Jan|Kowalski/i)
    expect(q.footer).toBe('Organizator: UKS Opty Mielno')
    expect(q.lines).toEqual(['Wpisowe 100 zł'])
    expect(scrubNames(p, [undefined, ' ']).footer).toBe(p.footer)
  })
  it('has nothing personal unless ticked', () => {
    const p = defaultPoster(facts, 'pl')
    const all = JSON.stringify(p)
    expect(all).not.toMatch(/Kowalski|600 100 200|klub@example\.pl|klub\.pl/)
    expect(hasContactLine(p)).toBe(false)
    const f = factsFor(facts, defaultOptions(facts))
    expect(f.contactName + f.phone + f.email + f.website).toBe('')
  })
  it('puts on the poster what was ticked, in one contact line', () => {
    const o = { ...defaultOptions(facts), contact: true, phone: true, email: false, website: true, fee: '100 zł', prizes: 'puchary', extra: 'Start 9:00\nParking przy hali' }
    const p = defaultPoster(facts, 'pl', o)
    expect(p.lines).toContain('Kontakt: Jan Kowalski · 600 100 200')
    expect(p.lines).toContain('Wpisowe: 100 zł')
    expect(p.lines).toContain('Nagrody: puchary')
    expect(p.lines).toContain('Parking przy hali')
    expect(p.footer).toContain('https://klub.pl')
    expect(JSON.stringify(p)).not.toContain('klub@example.pl')
    const f = factsFor(facts, o)
    expect(f.contactName).toBe('Jan Kowalski')
    expect(f.phone).toBe('600 100 200')
    expect(f.email).toBe('')
  })
  it('untucked options are left out for the AI too', () => {
    const f = factsFor(facts, { ...defaultOptions(facts), categories: false, registration: false })
    expect(f.categories).toEqual([])
    expect(f.registration).toBe(false)
    expect(f.teams).toBe(0)
  })
  it('adds and removes the contact line', () => {
    const base = defaultPoster(facts, 'pl')
    const line = contactLine({ contact: true, contactName: 'Jan Kowalski', phone: true, email: true }, facts)
    expect(line).toBe('Kontakt: Jan Kowalski · 600 100 200 · klub@example.pl')
    const withLine = withContactLine(base, line)
    expect(hasContactLine(withLine)).toBe(true)
    expect(withContactLine(withContactLine(withLine, 'Kontakt: X'), '').lines.some((l) => l.startsWith('Kontakt'))).toBe(false)
    expect(contactLine({ contact: false, contactName: 'A', phone: false, email: false }, facts)).toBe('')
  })
  it('wraps words by width and keeps a long word whole', () => {
    expect(wrapWords('aa bb cc dd', (l) => l.length <= 5)).toEqual(['aa bb', 'cc dd'])
    expect(wrapWords('abcdefghij kk', (l) => l.length <= 5)).toEqual(['abcdefghij', 'kk'])
  })
})
