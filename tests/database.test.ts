// Realtime Database rules tests (live scores). Run with: npm run test:rules (starts the emulators).
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { get, ref, remove, set } from 'firebase/database'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

let env: RulesTestEnvironment
const PINS = { admin: '1234', courts: { '1': '1111', '2': '2222' } }
const score = { sets: [{ a: 5, b: 3 }], at: 1 }

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
})
