// Realtime Database rules tests (live scores). Run with: npm run test:rules (starts the emulators).
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { get, ref, remove, set, update } from 'firebase/database'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

let env: RulesTestEnvironment
const PINS = { admin: '1234', courts: { '1': '1111', '2': '2222' } }
const score = { sets: [{ a: 5, b: 3 }], at: 1 }
const board = {
  v: 1, at: 1, tournament: 'Cup', court: 'A', status: 'live', stage: 'Grupa A', a: 'Orły', b: 'Sokoły',
  sets: [{ a: 25, b: 20 }, { a: 3, b: 1 }], setsA: 1, setsB: 0, pointsA: 3, pointsB: 1, scoring: 'sets',
  setsToWin: 2, setPoints: 25, lastSetPoints: 15, start: '2026-10-23T10:00', next: { a: 'X', b: 'Y', start: '2026-10-23T10:40' },
  previous: { a: 'P', b: 'Q', setsA: 2, setsB: 0, sets: [{ a: 25, b: 1 }, { a: 25, b: 2 }] },
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-siatkalive',
    database: { rules: readFileSync('database.rules.json', 'utf8'), host: '127.0.0.1', port: 9000 },
  })
})
afterAll(() => env.cleanup())
beforeEach(async () => {
  await env.clearDatabase()
  await env.withSecurityRulesDisabled(async (ctx) => { await set(ref(ctx.database(), 'pins/main'), PINS) })
})

const as = (uid: string | null) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).database()
const login = (uid: string, pin: string, court?: number) =>
  set(ref(as(uid), `sessions/main/${uid}`), court ? { role: 'court', court, pin } : { role: 'admin', pin })

describe('realtime database rules', () => {
  it('lets anyone read live scores but nobody read the keys', async () => {
    await assertSucceeds(get(ref(as(null), 'live/main')))
    await assertFails(get(ref(as('fan'), 'pins/main')))
    await assertFails(get(ref(as('fan'), 'sessions/main/ref1')))
  })

  it('accepts a session only with the right key', async () => {
    await assertFails(login('ref1', '9999', 1))
    await assertFails(login('ref1', '2222', 1))
    await assertSucceeds(login('ref1', '1111', 1))
    await assertFails(login('boss', '1111'))
    await assertSucceeds(login('boss', '1234'))
    await assertFails(set(ref(as('ref1'), 'sessions/main/other'), { role: 'admin', pin: '1234' }))
  })

  it('lets a court referee write only their own court', async () => {
    await login('ref1', '1111', 1)
    await assertSucceeds(set(ref(as('ref1'), 'live/main/1/m1'), score))
    await assertFails(set(ref(as('ref1'), 'live/main/2/m2'), score))
    await assertSucceeds(remove(ref(as('ref1'), 'live/main/1/m1')))
  })

  it('refuses scores from fans and from sessions with an old key', async () => {
    await assertFails(set(ref(as('fan'), 'live/main/1/m1'), score))
    await assertFails(set(ref(as(null), 'live/main/1/m1'), score))
    await login('ref1', '1111', 1)
    await env.withSecurityRulesDisabled(async (ctx) => { await set(ref(ctx.database(), 'pins/main/courts/1'), '5555') })
    await assertFails(set(ref(as('ref1'), 'live/main/1/m1'), score))
  })

  it('lets the chief referee write every court and change the keys', async () => {
    await login('boss', '1234')
    await assertSucceeds(set(ref(as('boss'), 'live/main/2/m2'), score))
    await assertSucceeds(remove(ref(as('boss'), 'live/main')))
    await assertSucceeds(set(ref(as('boss'), 'pins/main'), { admin: '4321', courts: PINS.courts }))
    await assertFails(set(ref(as('ref1'), 'pins/main'), PINS))
  })

  it('game clock: fans read it, only the court\'s referee writes it, and only its fields', async () => {
    const clock = { match: 'm1', ms: 600000, run: true, at: 1, part: 2 }
    await assertSucceeds(get(ref(as(null), 'clock/main')))
    await assertFails(set(ref(as('fan'), 'clock/main/1'), clock))
    await login('ref1', '1111', 1)
    await assertSucceeds(set(ref(as('ref1'), 'clock/main/1'), clock))
    await assertSucceeds(set(ref(as('ref1'), 'clock/main/1'), { match: 'm1', ms: 5000, run: false, at: 2, up: true, golden: true }))
    await assertFails(set(ref(as('ref1'), 'clock/main/2'), clock))
    await assertFails(set(ref(as('ref1'), 'clock/main/1'), { ...clock, note: 'x' }))
    await assertFails(set(ref(as('ref1'), 'clock/main/1'), { ...clock, ms: -1 }))
    await assertSucceeds(remove(ref(as('ref1'), 'clock/main/1')))
    await assertFails(remove(ref(as('ref1'), 'clock/main')))
    await login('boss', '1234')
    await assertSucceeds(remove(ref(as('boss'), 'clock/main')))
  })

  it('does not let a court referee clear all courts', async () => {
    await login('ref1', '1111', 1)
    await assertFails(remove(ref(as('ref1'), 'live/main')))
  })

  it('lets anyone copy keys only where there are none yet', async () => {
    await assertFails(set(ref(as('fan'), 'pins/main'), PINS))
    await assertSucceeds(set(ref(as('fan'), 'pins/newone'), PINS))
    await assertFails(set(ref(as('fan'), 'pins/other'), { admin: '12', courts: {} }))
  })

  it('accepts only proper scores', async () => {
    await login('ref1', '1111', 1)
    await assertFails(set(ref(as('ref1'), 'live/main/1/m1'), { sets: [{ a: 'x', b: 1 }], at: 1 }))
    await assertFails(set(ref(as('ref1'), 'live/main/1/m1'), { sets: [{ a: 1, b: 1 }] }))
    await assertFails(set(ref(as('ref1'), 'live/main/1/m1'), { ...score, extra: 1 }))
  })

  const KEY = 'CAMKEY2345'
  const withKey = () => env.withSecurityRulesDisabled(async (ctx) => { await set(ref(ctx.database(), 'pins/main/stream'), KEY) })

  it('keeps the camera key from fans, and gives it to referees', async () => {
    await withKey()
    await assertFails(get(ref(as('fan'), 'pins/main/stream')))
    await login('ref1', '1111', 1)
    await assertSucceeds(get(ref(as('ref1'), 'pins/main/stream')))
    await assertFails(set(ref(as('ref1'), 'pins/main/stream'), 'OTHERKEY99'))
    await login('boss', '1234')
    await assertSucceeds(set(ref(as('boss'), 'pins/main/stream'), 'NEWKEY2345'))
    await assertFails(set(ref(as('boss'), 'pins/main/stream'), 'bad key'))
  })

  it('lets whoever has the key read the scoreboards, but nobody list them', async () => {
    await withKey()
    await assertSucceeds(get(ref(as(null), `board/main/${KEY}`)))
    await assertFails(get(ref(as(null), 'board/main')))
  })

  it('lets only the court referee or the chief write a scoreboard, and only under the current key', async () => {
    await withKey()
    await assertFails(set(ref(as('fan'), `board/main/${KEY}/1`), board))
    await login('ref1', '1111', 1)
    await assertSucceeds(set(ref(as('ref1'), `board/main/${KEY}/1`), board))
    await assertFails(set(ref(as('ref1'), `board/main/${KEY}/2`), board))
    await assertFails(set(ref(as('ref1'), 'board/main/GUESSED234/1'), board))
    await login('boss', '1234')
    await assertSucceeds(set(ref(as('boss'), `board/main/${KEY}/2`), { ...board, status: 'none', a: '', b: '', sets: null, next: null }))
  })

  it('keeps the camera key when the keys are copied again', async () => {
    await withKey()
    await login('boss', '1234')
    await assertSucceeds(update(ref(as('boss'), 'pins/main'), { admin: '1234', courts: PINS.courts }))
    await env.withSecurityRulesDisabled(async (ctx) => {
      const v = (await get(ref(ctx.database(), 'pins/main/stream'))).val()
      if (v !== KEY) throw new Error(`stream key lost: ${v}`)
    })
  })

  it('accepts only proper scoreboards', async () => {
    await withKey()
    await login('ref1', '1111', 1)
    const at = `board/main/${KEY}/1`
    await assertFails(set(ref(as('ref1'), at), { ...board, status: 'party' }))
    await assertFails(set(ref(as('ref1'), at), { ...board, extra: 'x' }))
    await assertFails(set(ref(as('ref1'), at), { ...board, setsA: 'x' }))
    await assertFails(set(ref(as('ref1'), at), { ...board, a: 'x'.repeat(300) }))
  })
})
