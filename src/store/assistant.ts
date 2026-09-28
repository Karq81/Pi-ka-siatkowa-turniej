import { langNameEn, t } from '../i18n'
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

/** A photo, PDF or text file turned into what Gemini reads. */
type Part = { text: string } | { inlineData: { mimeType: string; data: string } }

const MAX_FILE = 15 * 1024 * 1024
const PHOTO_SIDE = 1800

const isText = (f: File) => /^text\//.test(f.type) || /\.(txt|csv|tsv)$/i.test(f.name)

/** Text of a .txt/.csv file; spreadsheet rows "Club;Team" become "Club: Team". */
export async function readTextFile(file: File): Promise<string> {
  const text = await file.text()
  return text.split(/\r?\n/).map((line) => {
    const cells = line.split(/[;\t]/).map((c) => c.trim().replace(/^"|"$/g, '')).filter(Boolean)
    return cells.length > 1 ? `${cells[0]}: ${cells[1]}` : (cells[0] ?? '')
  }).filter(Boolean).join('\n')
}

const base64 = (buf: ArrayBuffer) => {
  let s = ''
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

/** Phone photos are several MB: scaled down to a sharp enough JPEG before sending. */
async function photoPart(file: File): Promise<Part> {
  try {
    const img = await createImageBitmap(file)
    const scale = Math.min(1, PHOTO_SIDE / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    const data = canvas.toDataURL('image/jpeg', 0.85).split(',')[1]
    return { inlineData: { mimeType: 'image/jpeg', data } }
  } catch {
    return { inlineData: { mimeType: file.type || 'image/jpeg', data: base64(await file.arrayBuffer()) } }
  }
}

async function filePart(file: File): Promise<Part> {
  if (file.size > MAX_FILE) throw new Error(t('Plik jest za duży (do 15 MB).'))
  if (isText(file)) return { text: await readTextFile(file) }
  if (file.type.startsWith('image/')) return photoPart(file)
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    return { inlineData: { mimeType: 'application/pdf', data: base64(await file.arrayBuffer()) } }
  }
  throw new Error(t('Ten rodzaj pliku nie jest obsługiwany. Dodaj zdjęcie, PDF albo plik tekstowy (CSV).'))
}

/** Asks Gemini (newest model first) and returns its JSON answer. */
async function ask<T>(parts: Part[], systemInstruction: string, schema: Record<string, unknown> | null, needsAccount = true): Promise<T> {
  if (!firebaseHandles) throw new Error(t('Asystent działa tylko na stronie z bazą danych.'))
  if (needsAccount && !currentAccount()) throw new Error(t('Zaloguj się na konto organizatora, żeby użyć asystenta.'))
  const ai = getAI(firebaseHandles.auth.app, { backend: new GoogleAIBackend() })
  let lastError: unknown = null
  for (const model of MODELS) {
    try {
      const gemini = getGenerativeModel(ai, {
        model,
        systemInstruction,
        generationConfig: schema ? { responseMimeType: 'application/json', responseJsonSchema: schema } : undefined,
      })
      const result = await gemini.generateContent(parts)
      return (schema ? JSON.parse(result.response.text()) : result.response.text()) as T
    } catch (e) {
      lastError = e
      const msg = String((e as Error)?.message ?? e)
      // An unknown or overloaded model, or one whose free quota ran out, is worth retrying with the next one.
      if (!/not found|404|not supported|high demand|overloaded|unavailable|500|503|429|quota|RESOURCE_EXHAUSTED/i.test(msg)) break
    }
  }
  console.error('asystent', lastError)
  const msg = String((lastError as Error)?.message ?? lastError)
  if (/API has not been used|disabled|PERMISSION_DENIED|403|api-not-enabled/i.test(msg)) {
    throw new Error(t('Asystent AI nie jest jeszcze włączony w Firebase (AI Logic).'))
  }
  if (/quota|429|RESOURCE_EXHAUSTED/i.test(msg)) throw new Error(t('Asystent jest chwilowo przeciążony. Spróbuj za minutę.'))
  throw new Error(t('Asystent nie mógł przygotować turnieju. Spróbuj jeszcze raz albo opisz go inaczej.'))
}

/** The tournament draft from the organiser's description and attached photos or files. */
export async function askAssistant(text: string, files: File[] = []): Promise<AssistantDraft> {
  if (text.length > 20000) throw new Error(t('Opis jest za długi (do 20 000 znaków).'))
  const parts: Part[] = [...await Promise.all(files.map(filePart))]
  if (text.trim()) parts.unshift({ text })
  if (files.length) parts.push({ text: 'Załączone zdjęcia lub pliki to notatki organizatora (np. kartka z listą drużyn): odczytaj z nich drużyny, grupy i ustawienia.' })
  return ask<AssistantDraft>(parts, assistantInstructions(), assistantSchema())
}

const TEAMS_SCHEMA = {
  type: 'object',
  required: ['teams'],
  properties: { teams: { type: 'array', items: { type: 'string' }, description: 'Drużyny, zawodnicy lub pary' } },
}

/**
 * Team list from a photo of a sheet, a PDF or a text file, or from what the organiser typed
 * (messy notes, or an instruction such as "30 zawodników, numery 1–30"): one entry per line,
 * the club before a colon when a club has several teams ("UKS Orzeł: Orzeł 1").
 */
export async function organizeTeams(text: string, files: File[] = []): Promise<string> {
  if (!files.length && !text.trim()) return ''
  const onlyText = files.every(isText)
  if (onlyText && !text.trim()) return (await Promise.all(files.map(readTextFile))).join('\n')
  const parts: Part[] = await Promise.all(files.map(filePart))
  if (text.trim()) parts.unshift({ text: `Tekst organizatora:\n${text}` })
  const result = await ask<{ teams: string[] }>(parts, teamListInstructions(), TEAMS_SCHEMA)
  return (result.teams ?? []).map((x) => x.trim()).filter(Boolean).join('\n')
}

function teamListInstructions(): string {
  return `Przygotuj listę drużyn, zawodników albo par do turnieju. Źródło: tekst organizatora i/lub załączone zdjęcie lub plik (także pismo odręczne).
- Jeśli tekst to polecenie (np. "zrób 30 zawodników o nazwach 1–30", "dodaj 8 drużyn A–H"), wykonaj je.
- Jeśli to notatki lub lista, przepisz wszystkie pozycje, bez pomijania i bez wymyślania nowych. Pomiń nagłówki, numery porządkowe, telefony i inne dane.
- Pozycje, które już są na liście organizatora, zostaw bez zmian.
- Klub, z którego jest kilka drużyn, zapisz przed dwukropkiem, np. "UKS Orzeł: Orzeł 1".
- Nazw nie tłumacz. Nowe nazwy, które tworzysz sam, pisz w języku: ${langNameEn()}.`
}

/** Short guidance for the organiser: the site's help desk, in the visitor's language. */
export async function askHelp(question: string, page: string, history: { q: string; a: string }[]): Promise<string> {
  const parts: Part[] = [
    ...history.slice(-4).flatMap((h) => [{ text: `Pytanie: ${h.q}` }, { text: `Twoja odpowiedź: ${h.a}` }]),
    { text: `Ekran, na którym jest użytkownik: ${page}\nPytanie: ${question}` },
  ]
  return ask<string>(parts, helpInstructions(), null, false)
}

function helpInstructions(): string {
  return `Jesteś pomocnikiem serwisu SportLiveArena (wyniki turniejów na żywo). Prowadzisz organizatora za rękę: odpowiadasz krótko (do 6 zdań lub krótka lista kroków), prosto, życzliwie, bez żargonu. Odpowiadaj w języku: ${langNameEn()}.

Jak działa serwis:
1. Konto: "Załóż konto" (login i hasło) albo "Zaloguj się". Na koncie: "Moje turnieje", "Kredyty", "Moje konto" (dane, zmiana hasła).
2. Nowy turniej: "Moje turnieje" → "Załóż nowy turniej". Najprościej użyć przycisku "Użyj asystenta AI": opisać turniej swoimi słowami, wkleić notatki albo dodać zdjęcie kartki lub plik; asystent wypełni formularz (dyscyplina, format meczu, dzień, godzina, liczba boisk, kategorie, drużyny i grupy). Wszystko można poprawić ręcznie. Adres strony tworzy się sam z nazwy. Potem "Dalej: ustaw PIN".
3. PIN sędziego głównego (min. 4 cyfry) tworzy turniej w bazie. Klucze dla sędziów boisk tworzą się same.
4. Panel organizatora, zakładka "1. Zespoły i losowanie": w każdej kategorii lista drużyn (jedna w linii, klub przed dwukropkiem). Można dodać zdjęcie listy albo plik albo wpisać polecenie i kliknąć "Uporządkuj z AI". Potem liczba grup i "Zapisz zespoły i losuj grupy": losowanie rozdziela drużyny z jednego klubu i od razu układa terminarz.
5. "2. Grupy": grupy, tabele, terminarz, faza pucharowa. "3. Na żywo": boiska; sędzia boiska wchodzi przez "Sędziuj na żywo" (liczy punkty w telefonie) albo "Podaj wynik" (wpisuje wynik z kartki). Następny mecz na boisku zaczyna się 2 minuty po zakończeniu poprzedniego.
6. "Ustawienia i PIN": sędzia główny (poprawki wyników, klucze boisk, eksport do Excela), kartki z kodami QR do wydruku, tryb TV, zmiana PIN-u, co ile minut mecze.
7. Kibice: link do strony turnieju albo kod QR; nic nie instalują. Mogą wybrać "Moje drużyny".
8. Koszty: start za darmo; dzienny darmowy limit wejść kibiców; ponad limit kredyty (zakładka "Kredyty").
Gdy ktoś ma listę zawodników lub inny dokument na papierze, podpowiedz: zaloguj się w telefonie na to samo konto, otwórz "Załóż turniej" (asystent AI) albo panel organizatora i zrób zdjęcie przyciskiem "Zrób zdjęcie"; asystent sam odczyta listę. Transmisja wideo: "Ustawienia i PIN" → "Transmisja wideo na żywo" → przycisk "Jak nadawać mecz na żywo? Instrukcja krok po kroku". Trzy drogi: Facebook "Na żywo" (najprościej, bez limitów); aplikacja YouTube "+" → "Transmisja na żywo" (tylko kanał z co najmniej 50 subskrybentami); YouTube bez subskrybentów: studio.youtube.com → potwierdzenie kanału SMS-em i czekanie do 24 h (dzień wcześniej), potem klucz transmisji wpisany do darmowej aplikacji Larix Broadcaster (strona pokazuje kod QR, który ustawia Larix). Na końcu link do transmisji wkleja się w "Link do transmisji" i kibice widzą obraz obok wyników. Kto nadaje aplikacją SportCast (Android), otwiera w tym samym miejscu "Nadajesz aplikacją SportCast?" → "Włącz i pokaż kod dla SportCast"; w aplikacji naciska "Transmisja z sportlivearena.com", skanuje kod QR (albo wpisuje kod turnieju) i wybiera boisko: aplikacja sama pokazuje na obrazie wynik z panelu sędziego. Kod widzi tylko organizator (sędzia główny); kibicom i trenerom nie podawaj go i nie opisuj, jak go zdobyć.
Jeśli czegoś serwis nie potrafi albo nie wiesz, powiedz to wprost i zaproponuj najbliższe rozwiązanie. Nie wymyślaj funkcji.`
}
