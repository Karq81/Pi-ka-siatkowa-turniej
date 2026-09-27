import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai'
import { assistantInstructions, assistantSchema } from '../logic/assistantPrompt'
import type { AssistantDraft } from '../views/Assistant'
import { currentAccount } from './accounts'
import { firebaseHandles } from './firebase'

/**
 * The AI assistant through Firebase AI Logic (Gemini Developer API, free tier): the site asks
 * Gemini directly, with no server of its own. It has to be switched on once in the Firebase
 * console (AI Logic → Get started → Gemini Developer API). Newest model first, then fallbacks.
 */
const MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash']

export async function askAssistant(text: string): Promise<AssistantDraft> {
  if (!firebaseHandles) throw new Error('Asystent działa tylko na stronie z bazą danych.')
  if (!currentAccount()) throw new Error('Zaloguj się na konto organizatora, żeby użyć asystenta.')
  if (text.length > 20000) throw new Error('Opis jest za długi (do 20 000 znaków).')
  const ai = getAI(firebaseHandles.auth.app, { backend: new GoogleAIBackend() })
  let lastError: unknown = null
  for (const model of MODELS) {
    try {
      const gemini = getGenerativeModel(ai, {
        model,
        systemInstruction: assistantInstructions(),
        generationConfig: { responseMimeType: 'application/json', responseJsonSchema: assistantSchema() },
      })
      const result = await gemini.generateContent(text)
      return JSON.parse(result.response.text()) as AssistantDraft
    } catch (e) {
      lastError = e
      const msg = String((e as Error)?.message ?? e)
      // An unknown or overloaded model is worth retrying with the next one.
      if (!/not found|404|not supported|high demand|overloaded|unavailable|500|503/i.test(msg)) break
    }
  }
  console.error('asystent', lastError)
  const msg = String((lastError as Error)?.message ?? lastError)
  if (/API has not been used|disabled|PERMISSION_DENIED|403|api-not-enabled/i.test(msg)) {
    throw new Error('Asystent AI nie jest jeszcze włączony w Firebase (AI Logic).')
  }
  if (/quota|429|RESOURCE_EXHAUSTED/i.test(msg)) throw new Error('Asystent jest chwilowo przeciążony. Spróbuj za minutę.')
  throw new Error('Asystent nie mógł przygotować turnieju. Spróbuj jeszcze raz albo opisz go inaczej.')
}
