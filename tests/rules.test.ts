// Firestore security rules tests. Run with: npm run test:rules (starts the Firebase emulator).
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

let env: RulesTestEnvironment
const T = 'tournaments/main'
const match = { id: 'm1', court: 1, status: 'live', sets: [{ a: 1, b: 0 }], teamA: 'x', teamB: 'y', updatedAt: 1 }

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-siatkalive',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})
afterAll(() => env.cleanup())
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, `${T}/private/pins`), { adminPin: '1234', courts: { '1': '1111', '2': '2222' } })
    await setDoc(doc(db, T), { tournament: { name: 'x' } })
    await setDoc(doc(db, `${T}/matches/m1`), match)
    await setDoc(doc(db, `${T}/matches/done`), { ...match, status: 'finished' })
    await setDoc(doc(db, `${T}/matches/court2`), { ...match, court: 2 })
    await setDoc(doc(db, `${T}/matches/sf`), { ...match, court: 2, status: 'scheduled', teamA: '', teamB: '' })
  })
})

const as = (uid: string | null) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore()
const login = (uid: string, pin: string, court?: number) =>
  setDoc(doc(as(uid), `${T}/sessions/${uid}`), court ? { role: 'court', court, pin } : { role: 'admin', pin })

describe('firestore rules', () => {
  it('lets anyone read results but only the admin read the keys', async () => {
    await assertSucceeds(getDoc(doc(as(null), `${T}/matches/m1`)))
    await assertSucceeds(getDoc(doc(as(null), T)))
    await assertFails(getDoc(doc(as('u'), `${T}/private/pins`)))
    await login('u', '1111', 1)
    await assertFails(getDoc(doc(as('u'), `${T}/private/pins`)))
    await login('a', '1234')
    await assertSucceeds(getDoc(doc(as('a'), `${T}/private/pins`)))
  })

  it('accepts a session only with the right key for that court', async () => {
    await assertFails(login('u', '9999', 1))
    await assertFails(login('u', '2222', 1))
    await assertFails(login('u', '1111'))
    await assertSucceeds(login('u', '1111', 1))
    await assertSucceeds(login('a', '1234'))
    await assertFails(setDoc(doc(as('u'), `${T}/sessions/other`), { role: 'court', court: 1, pin: '1111' }))
  })

  it('blocks writes without a session', async () => {
    await assertFails(setDoc(doc(as('u'), `${T}/matches/m1`), match))
    await assertFails(setDoc(doc(as(null), `${T}/matches/m1`), match))
  })

  it('lets a court referee score only their court, and not touch finished matches or settings', async () => {
    await login('u', '1111', 1)
    const db = as('u')
    await assertSucceeds(setDoc(doc(db, `${T}/matches/m1`), { ...match, sets: [{ a: 2, b: 0 }] }))
    await assertFails(setDoc(doc(db, `${T}/matches/m1`), { ...match, court: 2 }))
    await assertFails(setDoc(doc(db, `${T}/matches/court2`), { ...match, court: 2, sets: [{ a: 9, b: 0 }] }))
    await assertSucceeds(setDoc(doc(db, `${T}/matches/m1`), { ...match, status: 'finished' }))
    await assertFails(setDoc(doc(db, `${T}/matches/m1`), match))
    await assertFails(setDoc(doc(db, `${T}/matches/done`), match))
    await assertFails(deleteDoc(doc(db, `${T}/matches/m1`)))
    await assertFails(setDoc(doc(db, `${T}/matches/new`), match))
    await assertFails(setDoc(doc(db, T), { tournament: { name: 'hack' } }))
    await assertFails(setDoc(doc(db, `${T}/private/pins`), { adminPin: '1111', courts: {} }))
  })

  it('lets any referee fill in knockout teams on another court, but nothing else there', async () => {
    await login('u', '1111', 1)
    const db = as('u')
    const sf = { ...match, court: 2, status: 'scheduled' }
    await assertSucceeds(setDoc(doc(db, `${T}/matches/sf`), { ...sf, teamA: 'w1', teamB: '', updatedAt: 2 }))
    await assertFails(setDoc(doc(db, `${T}/matches/sf`), { ...sf, teamA: 'w1', teamB: '', status: 'live' }))
  })

  it('lets the admin correct results, change settings and keys', async () => {
    await login('a', '1234')
    const db = as('a')
    await assertSucceeds(setDoc(doc(db, `${T}/matches/done`), match))
    await assertSucceeds(setDoc(doc(db, `${T}/matches/new`), match))
    await assertSucceeds(setDoc(doc(db, T), { tournament: { name: 'ok' } }))
    await assertSucceeds(setDoc(doc(db, `${T}/private/pins`), { adminPin: '5555', courts: { '1': '7777' } }))
    // Old sessions stop working after a key change.
    await assertFails(setDoc(doc(db, T), { tournament: { name: 'stale' } }))
  })

  it('logs out a court referee when their court gets a new key', async () => {
    await login('u', '1111', 1)
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `${T}/private/pins`), { adminPin: '1234', courts: { '1': '4444', '2': '2222' } })
    })
    await assertFails(setDoc(doc(as('u'), `${T}/matches/m1`), { ...match, sets: [{ a: 3, b: 0 }] }))
  })

  it('allows creating the keys only once, on an empty database', async () => {
    await assertFails(setDoc(doc(as('x'), `${T}/private/pins`), { adminPin: '1111', courts: {} }))
    await assertSucceeds(setDoc(doc(as('x'), `tournaments/new/private/pins`), { adminPin: '1111', courts: { '1': '2345' } }))
    await assertFails(setDoc(doc(as('x'), `tournaments/new2/private/pins`), { adminPin: '1', courts: {} }))
  })
})
