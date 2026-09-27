/**
 * "Asystent AI" of "Załóż turniej": turns an organiser's description or pasted notes (team
 * lists, groups, dates) into a tournament draft. Called by the site at its own function URL
 * (see ASSISTANT_URL in src/config.ts). Only signed-in organiser accounts may use it, up to
 * DAILY_LIMIT requests a day.
 *
 * The Anthropic API key comes from the ANTHROPIC_API_KEY environment variable (functions/.env,
 * written by the deploy workflow from the repository secret of the same name).
 */
import Anthropic from '@anthropic-ai/sdk'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { onRequest } from 'firebase-functions/v2/https'

initializeApp()

const MODEL = 'claude-opus-5'
const DAILY_LIMIT = 30
const MAX_TEXT = 20000

/** JSON schema of the draft; the sport and format ids come from the site's catalogue. */
function draftSchema(sportIds, formatIds) {
  const str = { type: 'string' }
  return {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'sport', 'format', 'date', 'time', 'dayEnd', 'courts', 'slotMinutes', 'categories', 'notes'],
    properties: {
      name: { type: 'string', description: 'Nazwa turnieju' },
      sport: { type: 'string', enum: sportIds },
      format: { type: 'string', enum: formatIds, description: 'Id formatu meczu należącego do wybranej dyscypliny' },
      date: { type: 'string', description: 'Dzień pierwszego meczu RRRR-MM-DD albo pusty, gdy nie podano' },
      time: { type: 'string', description: 'Godzina pierwszego meczu GG:MM albo pusty' },
      dayEnd: { type: 'string', description: 'Najpóźniejsza godzina ostatniego meczu dnia GG:MM albo pusty' },
      courts: { type: 'integer', description: 'Liczba boisk, kortów lub stołów (1–20)' },
      slotMinutes: { type: 'integer', description: 'Minuty od początku jednego meczu do następnego na boisku' },
      categories: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'teams', 'groups'],
          properties: {
            name: str,
            teams: { type: 'array', items: str, description: 'Drużyny, zawodnicy lub pary; klub przed dwukropkiem, np. "UKS Orzeł: Orzeł 1"' },
            groups: { type: 'array', items: { type: 'array', items: str }, description: 'Grupy z notatek (nazwy jak w teams) albo pusta lista' },
          },
        },
      },
      notes: { type: 'string', description: 'Krótko po polsku: co przyjęto, czego brakuje, o co dopytać organizatora' },
    },
  }
}

function systemPrompt(catalogue) {
  const list = catalogue.map((s) => `- ${s.id} (${s.label}): ${s.formats.map((f) => `${f.id} = ${f.label}`).join('; ')}`).join('\n')
  return `Pomagasz organizatorowi założyć turniej w serwisie SportLiveArena. Organizator opisuje turniej własnymi słowami albo wkleja notatki (listy drużyn, grupy, godziny, zasady). Przygotuj z tego szkic turnieju.

Zasady:
- Wybierz dyscyplinę i format meczu tylko z katalogu poniżej. Format musi należeć do wybranej dyscypliny. Gdy zasady nie pasują dokładnie, wybierz najbliższy format i napisz o tym w notes.
- Przepisz wszystkie drużyny z notatek, bez pomijania i bez wymyślania nowych. Klub, z którego jest kilka drużyn, zapisz przed dwukropkiem, np. "UKS Orzeł: Orzeł 1".
- Jeśli notatki podają podział na grupy, przepisz go w groups (nazwy dokładnie jak w teams). Jeśli nie podają, zostaw groups pustą listę: organizator rozlosuje grupy.
- Kategorie wiekowe lub płci (np. "Dziewczęta U12", "Dwójki") to osobne kategorie. Gdy nie ma podziału, użyj jednej kategorii "Turniej".
- Brakujące dane: date, time, dayEnd jako pusty tekst; courts i slotMinutes rozsądne dla dyscypliny. Wszystko, co przyjąłeś sam, wymień w notes.
- Nie zgaduj dat: jeśli podano dzień tygodnia bez daty, zostaw date pustą i napisz o tym w notes.

Katalog dyscyplin i formatów (id: opis):
${list}`
}

export const asystent = onRequest({ region: 'europe-central2', timeoutSeconds: 120, memory: '512MiB', cors: true }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Tylko POST.' }); return }
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) { res.status(503).json({ error: 'Asystent AI nie jest jeszcze włączony.' }); return }

  // Signed-in organiser accounts only (not anonymous visitors).
  let uid
  try {
    const token = (req.get('Authorization') ?? '').replace(/^Bearer /, '')
    const decoded = await getAuth().verifyIdToken(token)
    if (decoded.firebase?.sign_in_provider === 'anonymous') throw new Error('anonymous')
    uid = decoded.uid
  } catch {
    res.status(401).json({ error: 'Zaloguj się na konto organizatora, żeby użyć asystenta.' })
    return
  }

  const { text, catalogue } = req.body ?? {}
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT || !Array.isArray(catalogue) || !catalogue.length) {
    res.status(400).json({ error: `Wpisz opis turnieju (do ${MAX_TEXT} znaków).` })
    return
  }

  // Daily limit per account.
  const day = new Date().toISOString().slice(0, 10)
  const usageRef = getFirestore().doc(`aiUsage/${uid}_${day}`)
  const used = (await usageRef.get()).data()?.count ?? 0
  if (used >= DAILY_LIMIT) { res.status(429).json({ error: `Dzisiejszy limit asystenta (${DAILY_LIMIT}) został wykorzystany.` }); return }
  await usageRef.set({ count: FieldValue.increment(1), uid }, { merge: true })

  const sportIds = catalogue.map((s) => String(s.id))
  const formatIds = [...new Set(catalogue.flatMap((s) => s.formats.map((f) => String(f.id))))]
  const client = new Anthropic({ apiKey: key })
  try {
    const msg = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: draftSchema(sportIds, formatIds) } },
      system: systemPrompt(catalogue),
      messages: [{ role: 'user', content: text }],
    })
    if (msg.stop_reason === 'refusal') { res.status(422).json({ error: 'Asystent nie mógł przygotować tego turnieju. Spróbuj opisać go inaczej.' }); return }
    if (msg.stop_reason === 'max_tokens') { res.status(422).json({ error: 'Opis jest za długi. Podziel go na mniejsze części.' }); return }
    const out = msg.content.find((b) => b.type === 'text')
    const draft = JSON.parse(out?.text ?? '{}')
    res.json({ draft })
  } catch (e) {
    console.error('asystent', e)
    res.status(502).json({ error: 'Asystent jest chwilowo niedostępny. Spróbuj za chwilę.' })
  }
})
