// Creates the project's default Realtime Database (europe-west1) if it does not exist yet.
// Used by the deploy workflow; needs GOOGLE_APPLICATION_CREDENTIALS (service account JSON).
import { createSign } from 'node:crypto'
import { readFileSync } from 'node:fs'

const PROJECT = process.argv[2]
const LOCATION = 'europe-west1'
const ID = `${PROJECT}-default-rtdb`
const sa = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'))

const b64 = (x) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url')
const now = Math.floor(Date.now() / 1000)
const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
  iss: sa.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform',
  aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 600,
})}`
const jwt = `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url')}`
const token = (await (await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
})).json()).access_token
if (!token) { console.log('::warning::No access token for the service account.'); process.exit(0) }

// The management API may be switched off in a new project: try to switch it on (needs the
// Service Usage Admin role; without it the database is created once in the Firebase console).
const enable = await fetch(`https://serviceusage.googleapis.com/v1/projects/${PROJECT}/services/firebasedatabase.googleapis.com:enable`, {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}',
})
console.log(`Enable firebasedatabase.googleapis.com: ${enable.status}`)
if (enable.ok) await new Promise((r) => setTimeout(r, 20000))

const base = `https://firebasedatabase.googleapis.com/v1beta/projects/${PROJECT}/locations/${LOCATION}/instances`
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
const existing = await fetch(`${base}/${ID}`, { headers })
if (existing.ok) { console.log(`Realtime Database ${ID} already exists.`); process.exit(0) }
const created = await fetch(`${base}?databaseId=${ID}`, { method: 'POST', headers, body: JSON.stringify({ type: 'DEFAULT_DATABASE' }) })
const body = await created.text()
if (created.ok) console.log(`Created Realtime Database ${ID} in ${LOCATION}.`)
else console.log(`::warning::Could not create the Realtime Database (${created.status}): ${body.slice(0, 300)}`)
