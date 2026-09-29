import { describe, expect, it } from 'vitest'
import { assistantInstructions, assistantSchema, draftSettings, SYSTEMS } from './assistantPrompt'
import { blankState } from './newTournament'

/* The AI assistant knows every building block and its answer becomes the tournament's settings. */

describe('assistant knowledge', () => {
  it('the schema offers every system and every setting, all required', () => {
    const s = assistantSchema() as { required: string[]; properties: Record<string, { enum?: string[] }> }
    expect(s.properties.system.enum).toEqual([...SYSTEMS])
    for (const k of ['advancePerGroup', 'ties', 'seriesGames', 'measuredMode', 'tiebreak', 'bronzes', 'seeding', 'restRounds', 'breakFrom']) {
      expect(s.required).toContain(k)
    }
  })

  it('the instructions name the building blocks and the discipline profiles', () => {
    const text = assistantInstructions()
    for (const w of ['best:3:1', 'advancePerGroup', 'dwumecz', 'measuredMode', 'americano', 'Buchholz', 'slotMinutes', 'h2hReapply', 'bieg (']) expect(text).toContain(w)
    expect(text).toMatch(/pilka-nozna \(Piłka nożna[^\n]*kolejność: h2h_points/)
  })
})

describe('the assistant\'s answer as settings', () => {
  it('groups → bracket for the top 2 + 2 best thirds, two legs, UEFA tie-breakers', () => {
    const x = draftSettings({ system: 'groups', advancePerGroup: 2, advanceBest: 2, ties: 'two', awayGoals: false, tiebreak: ['h2h_points', 'diff', 'nonsense'], h2hReapply: true, seeding: 'list', withdrawal: 'B' })
    expect(x.advance).toEqual({ perGroup: 2, best: 2 })
    expect(x.ties).toEqual({ kind: 'two', awayGoals: false, finalSingle: true })
    expect(x.tiebreak).toEqual(['h2h_points', 'diff'])
    expect(x.h2hReapply).toBe(true)
    // Seeding only concerns a bracket from the start.
    expect(x.seeding).toBeUndefined()
    expect(x.withdrawal).toBe('B')
  })

  it('knockout with two bronzes and clubs apart; nothing extra when nothing is asked', () => {
    expect(draftSettings({ system: 'knockout', bronzes: true, separateClubs: true, seeding: 'list', ties: 'one' })).toEqual({ bronzes: true, separateClubs: true, seeding: 'list' })
    expect(draftSettings({ system: 'groups', advancePerGroup: 0, ties: 'one', tiebreak: [], measuredMode: '', withdrawal: '' })).toEqual({})
  })

  it('measured events: heats and a final, or rounds with points', () => {
    expect(draftSettings({ system: 'measured', measuredMode: 'heats', qualifyQ: 2, qualifyq: 2 }).measured).toEqual({ mode: 'heats', Q: 2, q: 2 })
    expect(draftSettings({ system: 'measured', measuredMode: 'rounds', placePoints: 'low', dropWorst: 1 }).measured).toEqual({ mode: 'rounds', points: 'low', drop: 1 })
  })

  it('a tournament made from the draft has them', () => {
    const settings = draftSettings({ system: 'groups', advancePerGroup: 2, advanceBest: 0, ties: 'series', seriesGames: 5, tiebreak: ['diff', 'h2h_points'] })
    const s = blankState({ name: 'T', start: '2027-05-08T09:00', courts: 2, slotMinutes: 30, dayEnd: '18:00', categories: ['Open'], sport: 'koszykowka', format: 'bez-remisu', settings })
    expect(s.tournament.advance).toEqual({ perGroup: 2, best: 0 })
    expect(s.tournament.ties).toMatchObject({ kind: 'series', n: 5 })
    expect(s.tournament.rules.tiebreak).toEqual(['diff', 'h2h_points'])
    const run = blankState({ name: 'R', start: '2027-05-08T09:00', courts: 8, slotMinutes: 10, dayEnd: '18:00', categories: ['Open'], sport: 'bieg', format: 'czas', system: 'measured', settings: draftSettings({ system: 'measured', measuredMode: 'heats', qualifyQ: 1, qualifyq: 4 }) })
    expect(run.tournament.measured).toEqual({ mode: 'heats', Q: 1, q: 4 })
  })
})
