// Firestore security rules tests. Run with: npm run test:rules (starts the Firebase emulator).
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

let env: RulesTestEnvironment
const T = 'tournaments/main'
const match = { id: 'm1', status: 'live', sets: [{ a: 1, b: 0 }] }

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
    await setDoc(doc(db, `${T}/private/pins`), { adminPin: '1234', courtPin: '0000' })
    await setDoc(doc(db, T), { tournament: { name: 'x' } })
    await setDoc(doc(db, `${T}/matches/m1`), match)
    await setDoc(doc(db, `${T}/matches/done`), { ...match, status: 'finished' })
  })
})

const as = (uid: string | null) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore()
const login = (uid: string, role: string, pin: string) => setDoc(doc(as(uid), `${T}/sessions/${uid}`), { role, pin })

describe('firestore rules', () => {
  it('lets anyone read results but nobody read the PINs', async () => {
    await assertSucceeds(getDoc(doc(as(null), `${T}/matches/m1`)))
    await assertSucceeds(getDoc(doc(as(null), T)))
    await assertFails(getDoc(doc(as('u'), `${T}/private/pins`)))
  })

  it('accepts a session only with the right PIN', async () => {
    await assertFails(login('u', 'court', '9999'))
    await assertFails(login('u', 'admin', '0000'))
    await assertSucceeds(login('u', 'court', '0000'))
    await assertSucceeds(login('a', 'admin', '1234'))
    await assertFails(setDoc(doc(as('u'), `${T}/sessions/other`), { role: 'court', pin: '0000' }))
  })

  it('blocks writes without a session', async () => {
    await assertFails(setDoc(doc(as('u'), `${T}/matches/m1`), match))
    await assertFails(setDoc(doc(as(null), `${T}/matches/m1`), match))
  })

  it('lets a court referee score, but not touch finished matches or settings', async () => {
    await login('u', 'court', '0000')
    const db = as('u')
    await assertSucceeds(setDoc(doc(db, `${T}/matches/m1`), { ...match, status: 'finished' }))
    await assertFails(setDoc(doc(db, `${T}/matches/m1`), match))
    await assertFails(setDoc(doc(db, `${T}/matches/done`), match))
    await assertFails(deleteDoc(doc(db, `${T}/matches/m1`)))
    await assertFails(setDoc(doc(db, T), { tournament: { name: 'hack' } }))
    await assertFails(setDoc(doc(db, `${T}/private/pins`), { adminPin: '1111', courtPin: '2222' }))
  })

  it('lets the admin correct results, change settings and PINs', async () => {
    await login('a', 'admin', '1234')
    const db = as('a')
    await assertSucceeds(setDoc(doc(db, `${T}/matches/done`), match))
    await assertSucceeds(setDoc(doc(db, T), { tournament: { name: 'ok' } }))
    await assertSucceeds(setDoc(doc(db, `${T}/private/pins`), { adminPin: '5555', courtPin: '6666' }))
    // Old sessions stop working after a PIN change.
    await assertFails(setDoc(doc(db, T), { tournament: { name: 'stale' } }))
  })

  it('allows creating the PINs only once, on an empty database', async () => {
    await assertFails(setDoc(doc(as('x'), `${T}/private/pins`), { adminPin: '1111', courtPin: '2222' }))
    await assertSucceeds(setDoc(doc(as('x'), `tournaments/new/private/pins`), { adminPin: '1111', courtPin: '2222' }))
    await assertFails(setDoc(doc(as('x'), `tournaments/new2/private/pins`), { adminPin: '1', courtPin: '2' }))
  })
})
