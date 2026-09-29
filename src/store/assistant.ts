import { langNameEn, t } from '../i18n'
import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai'
import { assistantInstructions, assistantSchema } from '../logic/assistantPrompt'
import type { AssistantDraft } from '../views/Assistant'
import { normalizePoster, POSTER_THEMES, type Poster, type PosterFacts } from '../logic/poster'
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
Gdy ktoś ma listę zawodników lub inny dokument na papierze, podpowiedz: zaloguj się w telefonie na to samo konto, otwórz "Załóż turniej" (asystent AI) albo panel organizatora i zrób zdjęcie przyciskiem "Zrób zdjęcie"; asystent sam odczyta listę. Transmisja wideo: "Ustawienia i PIN" → "Transmisja wideo na żywo" → przycisk "Jak nadawać mecz na żywo? Instrukcja krok po kroku". Trzy drogi: Facebook "Na żywo" (najprościej, bez limitów); aplikacja YouTube "+" → "Transmisja na żywo" (tylko kanał z co najmniej 50 subskrybentami); YouTube bez subskrybentów: studio.youtube.com → potwierdzenie kanału SMS-em i czekanie do 24 h (dzień wcześniej), potem klucz transmisji wpisany do darmowej aplikacji Larix Broadcaster (strona pokazuje kod QR, który ustawia Larix). Na końcu link do transmisji wkleja się w "Link do transmisji" i kibice widzą obraz obok wyników. Kto nadaje aplikacją SportCast (Android), otwiera w tym samym miejscu "Nadajesz aplikacją SportCast?" → "Włącz i pokaż kod dla SportCast"; w aplikacji naciska "Transmisja z sportlivearena.com", skanuje kod QR (albo wpisuje kod turnieju) i wybiera boisko: aplikacja sama pokazuje na obrazie wynik z panelu sędziego. Animacja pokazująca to krok po kroku jest na stronie głównej w sekcji "Transmisja na żywo z wynikiem na obrazie", a instrukcja w oknie "Jak nadawać mecz na żywo?" w zakładce "Aplikacja SportCast: wynik na obrazie". Kod widzi tylko organizator (sędzia główny); kibicom i trenerom nie podawaj go i nie opisuj, jak go zdobyć.
Dyscypliny i panele sędziego: judo (ippon, waza-ari, yuko, shido, zegar walki z golden score i osaekomi), karate WKF (yuko +1, waza-ari +2, ippon +3, przewaga 8 punktów kończy walkę, senshu, kary chui 1–3, hansoku-chui, hansoku), szachy (wynik 1–0, ½–½, 0–1 i sposób zakończenia), tenis i padel punkt po punkcie (15, 30, 40, przewaga, tie-break przy 6:6), koszykówka +1/+2/+3, koszykówka 3x3 +1/+2, rugby 7 przyłożenie +5, podwyższenie +2, karny/drop +3; w grach zespołowych zegar meczu z połowami, kwartami albo tercjami, a w ręcznej i hokeju kary 2 minuty. Zegar, który sędzia uruchamia w telefonie, widzą też kibice na tablicy wyników na żywo, na stronie meczu i w trybie TV (część gry, czas do końca, "zegar zatrzymany"). Czas gry zmienia się w "Ustawienia i PIN" → "Zasady meczu". Gdy dyscypliny nie ma na liście, wybierz "Inna dyscyplina" i wpisz jej nazwę (np. Zapasy): pokaże się na stronie turnieju. Nazwy dopasowują się do dyscypliny: mata i walka w sportach walki, kort w tenisie, stół i partia w szachach.
Wynik niezgodny z zasadami (np. pomyłka albo wyjątkowa sytuacja) da się zapisać: strona najpierw wyjaśnia, co się nie zgadza, i pyta "Zapisać go mimo to?".
Zgłoszenia drużyn: panel organizatora → "1. Zespoły i losowanie" → "Zgłoszenia drużyn" → zaznacz "Zgłoszenia otwarte" i wyślij klubom link do formularza. Drużyny podają nazwę, kategorię, skład, logo i kontakt (kontakt widzi tylko organizator). Organizator klika "Przyjmij do turnieju".
Systemy turnieju (wybór przy zakładaniu albo w "1. Zespoły i losowanie" → "System turnieju", potem losowanie jeszcze raz): "Grupy (każdy z każdym), potem drabinka" (terminarz metodą Bergera; "Po grupach": wszyscy grają o miejsca albo drabinka dla N najlepszych z każdej grupy plus najlepsze z kolejnego miejsca, krzyżowanie A1–B2), "Drabinka pucharowa" (rozstawienie z listy albo losowanie, zawodnicy z jednego klubu w różnych połówkach; po półfinałach: mecz o 3. miejsce, dwa brązowe medale albo wszyscy grają o miejsca), "Podwójna eliminacja" (drabinka przegranych, wielki finał z rewanżem), "Drabinka z turniejem pocieszenia", "Drabinka schodkowa", "System szwajcarski" (kolejne rundy przyciskiem "Losuj rundę", Buchholz), "Americano" i "Mexicano" (zmiana partnera, każdy zbiera punkty pary), "Król kortu", "Drabinka rankingowa" (wyzwania najwyżej 3 miejsca wyżej) i konkurencje mierzone (biegi, pływanie, skoki, rzuty, łucznictwo, kręgle, golf, regaty: serie i finał Q/q albo rundy z punktami za miejsca; wyniki wpisuje się w tabeli w "2. Grupy", DNF/DNS/DQ na końcu). Pary w drabince mogą grać jeden mecz, dwumecz (suma bramek, karne wpisywane osobno) albo serię do N zwycięstw. Przy 17 zawodnikach: jedna walka wstępna, potem 1/8 finału.
Tabela: punkty i kolejność kryteriów przy równej liczbie punktów zależą od dyscypliny i można je zmienić w "Ustawienia i PIN" → sędzia główny → "Ustawienia" (mecze bezpośrednie, różnica, stosunek setów, Buchholz, Sonneborn-Berger, losowanie, miejsce ex aequo; opcja liczenia meczów bezpośrednich od nowa jak w UEFA). Hokej i unihokej: przy wpisywaniu wyniku wybiera się "po dogrywce" albo "po rzutach karnych" (2 i 1 pkt).
Sytuacje szczególne: walkower jednym przyciskiem na stronie meczu ("Walkower dla…"); wycofanie lub dyskwalifikacja drużyny w "Ustawienia i PIN" → sędzia główny → "Drużyny i terminarz" (opcja A: przy mniej niż połowie rozegranych meczów wyniki znikają z tabel, B: zawsze walkowery); tam też "Historia zmian". Przycisk "Drukuj / PDF" pod nazwą turnieju drukuje to, co widać na ekranie.
Wyniki do Excela: w panelu organizatora, pod nazwą turnieju, przycisk "Pobierz wyniki do Excela" – w każdej chwili pobiera plik .xlsx z arkuszami: mecze (godzina, boisko, drużyny, wynik, status), tabele grup, klasyfikacja końcowa (gdy są rozegrane mecze o miejsca), drużyny i informacje o turnieju.
Usuwanie turnieju: "Moje turnieje" → lista turniejów → kliknij turniej → na dole "Usuń turniej" (albo w panelu turnieju: "Ustawienia i PIN" → "Usuń turniej" na dole). Strona pyta "Czy na pewno usunąć turniej…?" → "Tak, usuń turniej". Usuwa wszystkie mecze, wyniki, zgłoszenia i PIN-y; adres strony znów jest wolny. Tego nie da się cofnąć, więc wcześniej warto pobrać wyniki do Excela. Albatros CUP nie ma tego przycisku.
Strona "Moje turnieje" (konto organizatora): na górze "Załóż nowy turniej", pod nim ciemny przycisk "Moje turnieje" z liczbą turniejów (0, gdy nie ma żadnego). Przycisk otwiera listę turniejów; kliknięcie turnieju otwiera jego osobną stronę: Panel organizatora, Strona dla kibiców, PIN, zużycie danych (wejścia, limit, kredyty, koszt) i "Usuń turniej".
Plakat do wydarzenia: "Moje turnieje" → kliknij turniej → sekcja "Plakat do wydarzenia" (pod przyciskami Panel organizatora i Strona dla kibiców). "Utwórz plakat" robi plakat A4 z nazwą turnieju, terminem, miejscem, szczegółami i kodem QR do strony z wynikami; "Utwórz z pomocą AI" robi go według opisu organizatora (np. wpisowe, nagrody, kolory, hasło). Potem: "Drukuj / PDF", "Pobierz" (obraz PNG), "Wyślij" (jeśli telefon to umie), "Popraw z pomocą AI" (opisujesz zmiany), "Edytuj teksty ręcznie" (teksty i kolory) oraz "Usuń plakat" (żeby zrobić nowy). Miejscowość, telefon i e-mail plakat bierze z "Moje konto".
Jeśli czegoś serwis nie potrafi albo nie wiesz, powiedz to wprost i zaproponuj najbliższe rozwiązanie. Nie wymyślaj funkcji.`
}

const POSTER_SCHEMA = {
  type: 'object',
  required: ['kicker', 'title', 'tagline', 'when', 'where', 'lines', 'footer', 'theme'],
  properties: {
    kicker: { type: 'string', description: 'Mała linia nad tytułem, np. rodzaj turnieju' },
    title: { type: 'string', description: 'Tytuł plakatu (zwykle nazwa turnieju)' },
    tagline: { type: 'string', description: 'Zachęta lub hasło pod tytułem, jedno krótkie zdanie' },
    when: { type: 'string', description: 'Termin: data i godzina' },
    where: { type: 'string', description: 'Miejsce: miejscowość, hala lub adres' },
    lines: { type: 'array', items: { type: 'string' }, description: 'Do 6 krótkich linii szczegółów (kategorie, wpisowe, nagrody, program, kontakt)' },
    footer: { type: 'string', description: 'Linia na dole: organizator i kontakt' },
    theme: { type: 'string', enum: POSTER_THEMES, description: 'Kolorystyka plakatu' },
  },
}

function posterInstructions(): string {
  return `Jesteś grafikiem i redaktorem plakatów sportowych. Układasz TREŚĆ plakatu na turniej (obraz rysuje strona, ty podajesz teksty i kolorystykę).
- Dostajesz FAKTY o turnieju i organizatorze, aktualną treść plakatu i POLECENIE organizatora. Wykonaj polecenie: dopisz, co prosi (np. nagrody, wpisowe, program, sponsorów, hasło), usuń to, czego nie chce, zmień ton lub kolory.
- Używaj wyłącznie faktów z danych i polecenia. Niczego nie wymyślaj: żadnych dat, godzin, adresów, kwot, nagród ani numerów telefonu, których nie ma w danych. Brakującą informację pomiń albo zostaw pole puste.
- Teksty krótkie, czytelne z daleka: tytuł do 70 znaków, hasło do 120, każda linia szczegółów do 90 znaków, najwyżej 6 linii. Bez emoji i bez hashtagów.
- Bez polecenia wygeneruj estetyczny, zachęcający plakat z danych.
- Pisz w języku polecenia organizatora; gdy polecenie nie wskazuje języka, w języku: ${langNameEn()}.
- Kolorystyka (theme): blue, green, red, dark lub gold. Zmień ją tylko gdy organizator o to prosi albo gdy zmieniasz całość plakatu.
- Adres strony turnieju (kod QR) dodaje strona sama, nie wpisuj go do linii.`
}

/** The poster's text from the tournament's facts, the current poster and the organiser's instruction. */
export async function askPoster(facts: PosterFacts, current: Poster | null, instruction: string): Promise<Poster> {
  const { url, ...known } = facts
  const parts: Part[] = [
    { text: `FAKTY:\n${JSON.stringify(known, null, 1)}` },
    { text: `AKTUALNY PLAKAT:\n${current ? JSON.stringify(current, null, 1) : 'brak (pierwszy plakat)'}` },
    { text: `POLECENIE ORGANIZATORA:\n${instruction.trim() || 'Przygotuj plakat z faktów.'}` },
  ]
  const result = await ask<Partial<Poster>>(parts, posterInstructions(), POSTER_SCHEMA)
  return normalizePoster({ ...result, url })
}
