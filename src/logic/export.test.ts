import { describe, expect, it } from 'vitest'
import { crc32, xlsxFiles, zipStore } from './xlsx'
import { exportFileName, resultSheets } from './export'
import type { State } from '../types'

const state: State = {
  tournament: { name: 'Puchar Łodzi 2026', subtitle: '', courts: 1, rules: { setsMode: 'bestOf', sets: 3, setPoints: 25, lastSetPoints: 15, winBy: 2, pointsWin: 3, pointsDraw: 1, pointsLoss: 0, sport: 'Siatkówka' } },
  categories: [{ id: 'k', name: 'Kobiety' }],
  groups: [{ id: 'g', categoryId: 'k', name: 'Grupa A', teamIds: ['a', 'b'] }],
  teams: [{ id: 'a', name: 'Orły & <Sokoły>', categoryId: 'k', club: 'UKS' }, { id: 'b', name: 'Lwy', categoryId: 'k' }],
  matches: [
    { id: 'm1', categoryId: 'k', groupId: 'g', court: 1, start: '2026-05-10T09:00', teamA: 'a', teamB: 'b', sets: [{ a: 25, b: 20 }, { a: 25, b: 18 }], status: 'finished', updatedAt: 0 },
    { id: 'm2', categoryId: 'k', groupId: '', court: 1, start: '2026-05-10T10:00', teamA: 'a', teamB: 'b', sets: [{ a: 12, b: 10 }], status: 'live', updatedAt: 0,
      ko: { round: 'P', tierFrom: 1, tierTo: 2, place: 1, label: 'Finał', srcA: { kind: 'group', groupId: 'g', pos: 1 }, srcB: { kind: 'group', groupId: 'g', pos: 2 } } },
  ],
}

describe('Excel export', () => {
  it('lists matches with sets won, tables and teams', () => {
    const sheets = resultSheets(state)
    const matches = sheets[0].rows
    expect(matches[1]).toEqual(['Kobiety', 'Grupa A', '2026-05-10', '09:00', '1', 'Orły & <Sokoły>', 'Lwy', 2, 0, '25:20, 25:18', 'Koniec meczu'])
    expect(matches[2].slice(7, 11)).toEqual([0, 0, '12:10', 'Trwa'])
    const table = sheets[1].rows
    expect(table[1].slice(2, 5)).toEqual([1, 'Orły & <Sokoły>', 'UKS'])
    expect(table[1].at(-1)).toBe(3)
    // The final is still being played, so no final places yet.
    expect(sheets.map((s) => s.name)).not.toContain('Klasyfikacja końcowa')
  })

  it('writes final places once a match for a place is finished', () => {
    const done = { ...state, matches: state.matches.map((m) => (m.id === 'm2' ? { ...m, status: 'finished' as const, sets: [{ a: 20, b: 25 }, { a: 25, b: 23 }, { a: 13, b: 15 }] } : m)) }
    const places = resultSheets(done).find((s) => s.name === 'Klasyfikacja końcowa')!.rows
    expect(places.slice(1)).toEqual([['Kobiety', 1, 'Lwy', ''], ['Kobiety', 2, 'Orły & <Sokoły>', 'UKS']])
  })

  it('escapes text in the sheet XML', () => {
    const xml = xlsxFiles(resultSheets(state)).find(([p]) => p === 'xl/worksheets/sheet1.xml')![1]
    expect(xml).toContain('Orły &amp; &lt;Sokoły&gt;')
    expect(xml).toContain('<c r="H2"><v>2</v></c>')
  })

  it('builds a valid stored ZIP', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
    const zip = zipStore([['a.txt', new TextEncoder().encode('hej')]])
    const v = new DataView(zip.buffer)
    expect(v.getUint32(0, true)).toBe(0x04034b50)
    expect(v.getUint32(zip.length - 22, true)).toBe(0x06054b50)
    expect(v.getUint16(zip.length - 12 + 2, true)).toBeGreaterThan(0)
  })

  it('names the file after the tournament and the day', () => {
    expect(exportFileName(state, new Date(2026, 4, 10))).toBe('Puchar-Lodzi-2026-2026-05-10.xlsx')
  })
})
