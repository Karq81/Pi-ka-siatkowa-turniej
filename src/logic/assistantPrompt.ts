import { langNameEn } from '../i18n'
import type { Tiebreak } from '../types'
import type { DraftSettings } from './newTournament'
import { criteriaToTiebreaks, PROFILES } from './profiles'
import { SPORTS } from './sports'

/**
 * What the AI assistant of "Załóż turniej" is asked: the instructions with the catalogue of
 * disciplines, formats and every building block of the site (systems, bracket options,
 * groups → play-off, two legs and series, measured events, tie-breakers, time planning),
 * and the JSON schema of the draft it returns.
 */

export const SYSTEMS = ['groups', 'knockout', 'double', 'custom', 'swiss', 'stepladder', 'consolation', 'measured', 'americano', 'mexicano', 'king', 'ladder'] as const
export type AssistantSystem = typeof SYSTEMS[number]

const TIEBREAKS: Tiebreak[] = [
  'h2h_points', 'h2h_diff', 'h2h_scored', 'h2h_result', 'wins', 'win_pct', 'diff', 'scored', 'setRatio', 'setDiff', 'pointRatio',
  'buchholz', 'buchholz_cut1', 'buchholz_median', 'sonneborn_berger', 'progressive', 'seed', 'rating', 'lots', 'shared',
]

/** The settings the assistant fills in besides the basics (flat, so the model always answers every field). */
export interface AssistantSettings {
  system?: AssistantSystem
  thirdPlace?: boolean
  twice?: boolean
  swissRounds?: number
  restRounds?: number
  breakFrom?: string
  breakTo?: string
  bronzes?: boolean
  allPlaces?: boolean
  seeding?: 'draw' | 'list'
  separateClubs?: boolean
  advancePerGroup?: number
  advanceBest?: number
  ties?: 'one' | 'two' | 'series'
  seriesGames?: number
  awayGoals?: boolean
  finalSingle?: boolean
  measuredMode?: '' | 'none' | 'heats' | 'rounds'
  qualifyQ?: number
  qualifyq?: number
  placePoints?: '' | 'none' | 'f1' | 'linear' | 'low'
  dropWorst?: number
  tiebreak?: string[]
  h2hReapply?: boolean
  withdrawal?: '' | 'none' | 'A' | 'B'
}

/** The assistant's answer as tournament settings: only what differs from the defaults. */
export function draftSettings(d: AssistantSettings): DraftSettings {
  const out: DraftSettings = {}
  const sys = d.system ?? 'groups'
  const bracket = sys === 'knockout' || sys === 'double' || sys === 'consolation'
  if (sys === 'knockout' && d.bronzes) out.bronzes = true
  if (sys === 'knockout' && d.allPlaces) out.allPlaces = true
  if (bracket && d.seeding === 'list') out.seeding = 'list'
  if (bracket && d.separateClubs) out.separateClubs = true
  if (sys === 'groups' && (d.advancePerGroup ?? 0) > 0) {
    out.advance = { perGroup: Math.min(8, d.advancePerGroup!), best: Math.max(0, Math.min(11, d.advanceBest ?? 0)) }
    if (d.bronzes) out.bronzes = true
    if (d.allPlaces) out.allPlaces = true
  }
  if ((bracket || sys === 'custom' || out.advance) && (d.ties === 'two' || d.ties === 'series')) {
    out.ties = { kind: d.ties, ...(d.ties === 'series' ? { n: Math.max(2, Math.min(9, d.seriesGames || 3)) } : {}), awayGoals: !!d.awayGoals, finalSingle: d.finalSingle ?? d.ties === 'two' }
  }
  if (sys === 'measured' && (d.measuredMode === 'heats' || d.measuredMode === 'rounds')) {
    out.measured = d.measuredMode === 'rounds'
      ? { mode: 'rounds', points: d.placePoints === 'linear' || d.placePoints === 'low' ? d.placePoints : 'f1', drop: Math.max(0, Math.min(5, d.dropWorst ?? 0)) }
      : { mode: 'heats', Q: Math.max(0, d.qualifyQ ?? 0), q: Math.max(0, d.qualifyq ?? 0) }
  }
  const order = criteriaToTiebreaks(d.tiebreak ?? [])
  if (order.length) out.tiebreak = order
  if (d.h2hReapply) out.h2hReapply = true
  if (d.withdrawal === 'A' || d.withdrawal === 'B') out.withdrawal = d.withdrawal
  return out
}

export function assistantInstructions(): string {
  const list = SPORTS
    .map((s) => {
      const p = PROFILES[s.id]
      const table = p?.criteria.length ? ` [tabela: wygrana ${p.points.win}, remis ${p.points.draw}, porażka ${p.points.loss}; kolejność: ${p.criteria.filter((c) => c !== 'points').join(' > ')}]` : ' [konkurencja mierzona: bez meczów]'
      return `- ${s.id} (${s.label}, ${s.entrants}, zwykle co ${s.slot} min)${table}: ${s.formats.map((f) => `${f.id} = ${f.label}`).join('; ')}`
    })
    .join('\n')
  return `Jesteś Architektem Systemów Turniejowych serwisu SportLiveArena. Organizator opisuje turniej własnymi słowami albo wkleja notatki (listy drużyn, grupy, godziny, zasady). Przygotuj z tego gotowy szkic turnieju, wykorzystując wszystkie klocki strony opisane niżej, tak jak zrobiłby to doświadczony organizator.

DANE PODSTAWOWE
- Wybierz dyscyplinę i format meczu tylko z katalogu na końcu. Format musi należeć do wybranej dyscypliny. Gdy zasady nie pasują dokładnie, wybierz najbliższy format i napisz o tym w notes.
- Gdy dyscypliny nie ma w katalogu (np. zapasy, boks, taekwondo, siatkonoga), wybierz "inna-wynik" albo "inna-sety" i wpisz prawdziwą nazwę w sportName. Gdy dyscyplina jest w katalogu, sportName zostaw pusty.
- Przepisz do teams wszystkie drużyny z notatek (w sportach indywidualnych zawodników, w deblu pary "Kowalski / Nowak"), bez pomijania i bez wymyślania nowych. Klub, z którego jest kilka drużyn, zapisz przed dwukropkiem, np. "UKS Orzeł: Orzeł 1". Opis zasad NIE jest listą drużyn.
- Podział na grupy z notatek przepisz w groups (nazwy jak w teams, bez części przed dwukropkiem); gdy go nie ma, groups = [] (organizator rozlosuje).
- Kategorie wiekowe lub płci (np. "Dziewczęta U12", "Singiel", "Debel") to osobne kategorie. Bez podziału: jedna kategoria "Turniej".
- Brakujące date, time, dayEnd zostaw puste. Nie zgaduj dat: dzień tygodnia bez daty = pusta data i uwaga w notes. Dzisiaj jest ${new Date().toISOString().slice(0, 10)}.

SYSTEM (pole system)
- "groups": grupy, każdy z każdym (terminarz metodą Bergera), potem mecze o miejsca. Domyślny, gdy opis nic nie mówi. twice: true = mecz i rewanż w grupie.
  Awans z grup do drabinki (advancePerGroup > 0): "2 najlepsze z każdej grupy do ćwierćfinałów", "awansują zwycięzcy grup i 2 najlepsze drugie miejsca" → advancePerGroup = 1, advanceBest = 2 (najlepsze z kolejnego miejsca liczone średnią punktów na mecz). Strona sama krzyżuje A1–B2 i rozdziela drużyny z jednej grupy. Gdy wszyscy mają grać dalej o wszystkie miejsca (jak w turniejach młodzieżowych PZPS), advancePerGroup = 0.
- "knockout": od razu drabinka pucharowa, przegrany odpada; wolne losy strona ustawia sama. thirdPlace = mecz o 3. miejsce; bronzes = dwa brązowe medale bez meczu o 3. miejsce (judo, karate, boks); allPlaces = wszyscy grają o miejsca (5–8, 9–16…).
- "double": podwójna eliminacja (drabinka przegranych, wielki finał z ewentualnym rewanżem).
- "consolation": drabinka pucharowa + turniej pocieszenia dla przegranych z 1. rundy (każdy gra co najmniej 2 razy).
- "stepladder": drabinka schodkowa; teams w kolejności od najlepszego do najsłabszego.
- "swiss": system szwajcarski (szachy, darts, e-sport): swissRounds rund (zwykle log2(liczba graczy)+1, min. 3), bez powtórek par, wolny los, Buchholz.
- "measured": konkurencje mierzone bez meczów (biegi, pływanie, skoki, rzuty, łucznictwo, kręgle, golf, wyścigi, regaty, battle royale) – wybierz dyscyplinę z grupy "Konkurencje mierzone". measuredMode "heats" = serie, potem finał dla qualifyQ najlepszych z każdej serii i qualifyq najlepszych wyników z reszty (np. Q=2, q=2); "rounds" = kilka wyścigów/rund z punktami za miejsca: placePoints "f1" (25-18-15…), "linear" (ostatni 1 pkt) albo "low" (1. miejsce = 1 pkt, wygrywa najmniej – żeglarstwo), dropWorst = ile najgorszych rund nie liczyć.
- "americano": zmiana partnera co rundę, każdy zbiera punkty swojej pary (padel, tenis, siatkówka plażowa rekreacyjnie). "mexicano": jak americano, ale od 2. rundy pary wg tabeli (1+4 vs 2+3). "king": król kortu, zwycięzca zostaje. "ladder": drabinka rankingowa z wyzwaniami (teams w kolejności rankingu).
- "custom": tylko własny plan spotkań (matches) bez grup.
- Zawsze wypełnij thirdPlace (dla knockout domyślnie true, chyba że bronzes albo allPlaces).

DRABINKI (knockout, double, consolation; także drabinka po grupach)
- seeding: "list" gdy opis mówi o rozstawieniu, rankingu, "najlepsi na końcu drabinki" (teams wtedy w kolejności od najlepszego), inaczej "draw" (losowanie).
- separateClubs: true, gdy zawodnicy/drużyny z jednego klubu mają trafić do różnych połówek (częste w sportach walki i tenisie).
- ties: "one" (jeden mecz, domyślnie), "two" (dwumecz: mecz i rewanż, liczy się suma; awayGoals gdy liczą się bramki na wyjeździe; karne osobno), "series" (seria do seriesGames meczów, np. 3 = do 2 zwycięstw, 7 = do 4, jak play-offy koszykówki/hokeja). finalSingle: finał i mecze o miejsca jako jeden mecz.

WŁASNY PLAN (matches) – gdy opis nie pasuje do gotowych klocków (repasaże, baraże, finał zwycięzców grup, superfinał, dowolny układ), ułóż plan w matches danej kategorii. Każde spotkanie: name (krótka unikalna nazwa), a i b:
  "team:Nazwa" – konkretna drużyna/zawodnik (dokładnie jak w teams),
  "group:A:1" – 1. miejsce w grupie A,
  "best:3:1" – najlepsza z drużyn z 3. miejsc w grupach (best:3:2 druga najlepsza…),
  "winner:Nazwa spotkania" / "loser:Nazwa spotkania" – zwycięzca / przegrany innego spotkania.
  place: miejsce zwycięzcy, gdy spotkanie je rozstrzyga (finał 1, o 3. miejsce 3), inaczej 0; loserPlace: miejsce przegranego, gdy inne niż place+1 (np. 3 przy dwóch brązach), inaczej 0. Spotkania czekają tylko na wcześniejsze. Plan z fazą grupową: system "groups"; bez grup: "custom". Gdy wystarczają gotowe klocki, matches = [].

TABELA I REMISY
- Każda dyscyplina ma swój profil (punkty i kolejność kryteriów w katalogu). Gdy opis podaje inną kolejność (np. "najpierw bezpośredni mecz, potem różnica bramek", "o kolejności decyduje stosunek setów", "Buchholz"), wpisz ją w tiebreak (kolejne kryteria po punktach), inaczej tiebreak = [].
  Kryteria: h2h_points (punkty w meczach bezpośrednich), h2h_diff (różnica w nich), h2h_scored, h2h_result (kto wygrał mecz bezpośredni), wins, win_pct, diff (różnica bramek/punktów), scored, setRatio, setDiff, pointRatio (małe punkty), buchholz, buchholz_cut1, buchholz_median, sonneborn_berger, progressive, seed, rating, lots (losowanie), shared (miejsce ex aequo).
- h2hReapply: true, gdy mecze bezpośrednie liczy się od nowa między drużynami, które nadal są równe (UEFA); dla piłki zwykle true.
- withdrawal: "A" (wycofana drużyna, która rozegrała mniej niż połowę meczów, znika z tabel; później walkowery) albo "B" (zawsze walkowery), "none" gdy opis nic nie mówi. measuredMode i placePoints: "none", gdy to nie konkurencja mierzona.

CZAS (jak Architekt)
- slotMinutes = czas gry + przerwy w meczu + zmiana drużyn na boisku (np. 2×10 min + 2 min przerwy + 3 min zmiany ≈ 25 min). Gdy opis podaje tylko czas gry, dolicz przerwę i zmianę i napisz to w notes.
- restRounds: ile rund drużyna ma odpocząć między meczami (0, 1 albo 2), gdy opis o tym mówi (np. "drużyny nie grają mecz po meczu").
- breakFrom/breakTo: przerwa w planie, np. obiad "12:30"–"13:15", inaczej puste.
- Policz, czy turniej się zmieści: liczba meczów (grupa n drużyn = n(n−1)/2, ×2 przy rewanżu; drabinka n uczestników = n−1, +1 o 3. miejsce; podwójna ≈ 2n−1; szwajcar = rundy × n/2) × slotMinutes ÷ liczba boisk. Gdy wychodzi dłużej niż od time do dayEnd, napisz w notes, ile brakuje, i zaproponuj konkretne rozwiązanie (więcej boisk, krótsze mecze, inny system).

NOTES
- Krótko, w języku: ${langNameEn()} (język organizatora): co przyjąłeś sam, jakie klocki wybrałeś i dlaczego (np. "Grupy po 4, awans 2 najlepszych, drabinka z meczem o 3. miejsce"), wynik sprawdzenia czasu. Nazwy kategorii wymyślane przez Ciebie też w tym języku; nazw drużyn nie tłumacz.

Katalog dyscyplin i formatów (id: opis):
${list}`
}

export function assistantSchema(): Record<string, unknown> {
  const str = { type: 'string' }
  const int = (description: string) => ({ type: 'integer', description })
  const bool = (description: string) => ({ type: 'boolean', description })
  const props: Record<string, unknown> = {
    name: { type: 'string', description: 'Nazwa turnieju' },
    sport: { type: 'string', enum: SPORTS.map((s) => s.id) },
    sportName: { type: 'string', description: 'Nazwa dyscypliny spoza katalogu (przy inna-wynik / inna-sety), inaczej pusty' },
    format: { type: 'string', enum: [...new Set(SPORTS.flatMap((s) => s.formats.map((f) => f.id)))], description: 'Id formatu meczu z wybranej dyscypliny' },
    date: { type: 'string', description: 'Dzień pierwszego meczu RRRR-MM-DD albo pusty' },
    time: { type: 'string', description: 'Godzina pierwszego meczu GG:MM albo pusty' },
    dayEnd: { type: 'string', description: 'Najpóźniejsza godzina ostatniego meczu dnia GG:MM albo pusty' },
    courts: int('Liczba boisk, kortów, stołów, mat lub torów (1–20)'),
    slotMinutes: int('Minuty od początku jednego meczu do następnego na boisku (gra + przerwy + zmiana)'),
    categories: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'teams', 'groups', 'matches'],
        properties: {
          name: str,
          teams: { type: 'array', items: str, description: 'Drużyny, zawodnicy lub pary; klub przed dwukropkiem' },
          groups: { type: 'array', items: { type: 'array', items: str }, description: 'Grupy z notatek albo pusta lista' },
          matches: {
            type: 'array',
            description: 'Własny plan spotkań (po grupach albo zamiast nich) albo pusta lista',
            items: {
              type: 'object',
              required: ['name', 'a', 'b', 'place', 'loserPlace'],
              properties: {
                name: { type: 'string', description: 'Unikalna nazwa spotkania' },
                a: { type: 'string', description: 'team:Nazwa | group:A:1 | best:3:1 | winner:Spotkanie | loser:Spotkanie' },
                b: { type: 'string', description: 'team:Nazwa | group:A:1 | best:3:1 | winner:Spotkanie | loser:Spotkanie' },
                place: int('Miejsce zwycięzcy albo 0'),
                loserPlace: int('Miejsce przegranego, gdy inne niż place+1, albo 0'),
              },
            },
          },
        },
      },
    },
    system: { type: 'string', enum: [...SYSTEMS], description: 'Jak rozgrywany jest turniej (patrz instrukcje)' },
    thirdPlace: bool('Mecz o 3. miejsce w drabince'),
    twice: bool('W grupach każdy z każdym dwa razy'),
    swissRounds: int('System szwajcarski: liczba rund, inaczej 0'),
    restRounds: int('Rundy odpoczynku drużyny między meczami (0–2)'),
    breakFrom: { type: 'string', description: 'Początek przerwy w planie GG:MM albo pusty' },
    breakTo: { type: 'string', description: 'Koniec przerwy w planie GG:MM albo pusty' },
    bronzes: bool('Dwa brązowe medale bez meczu o 3. miejsce'),
    allPlaces: bool('Wszyscy grają o miejsca (5–8, 9–16…)'),
    seeding: { type: 'string', enum: ['draw', 'list'], description: 'draw: losowanie; list: rozstawienie wg kolejności w teams' },
    separateClubs: bool('Zawodnicy jednego klubu w różnych połówkach drabinki'),
    advancePerGroup: int('Grupy → drabinka: ilu najlepszych z każdej grupy; 0 = wszyscy grają o miejsca'),
    advanceBest: int('Plus ile najlepszych drużyn z kolejnego miejsca; inaczej 0'),
    ties: { type: 'string', enum: ['one', 'two', 'series'], description: 'Pary w drabince: jeden mecz, dwumecz, seria' },
    seriesGames: int('Seria: najwięcej meczów (3, 5, 7), inaczej 0'),
    awayGoals: bool('Dwumecz: bramki na wyjeździe rozstrzygają remis w sumie'),
    finalSingle: bool('Dwumecz/seria: finał i mecze o miejsca jako jeden mecz'),
    measuredMode: { type: 'string', enum: ['none', 'heats', 'rounds'], description: 'Konkurencje mierzone: serie + finał albo rundy z punktami; inaczej none' },
    qualifyQ: int('Serie: do finału z każdej serii (Q), inaczej 0'),
    qualifyq: int('Serie: plus najlepsze wyniki z reszty (q), inaczej 0'),
    placePoints: { type: 'string', enum: ['none', 'f1', 'linear', 'low'], description: 'Rundy: punkty za miejsca; inaczej none' },
    dropWorst: int('Rundy: ile najgorszych nie liczyć'),
    tiebreak: { type: 'array', items: { type: 'string', enum: TIEBREAKS }, description: 'Kolejność kryteriów po punktach, gdy opis ją podaje; inaczej pusta lista' },
    h2hReapply: bool('Mecze bezpośrednie liczone od nowa między wciąż równymi (UEFA)'),
    withdrawal: { type: 'string', enum: ['none', 'A', 'B'], description: 'Zasada przy wycofaniu drużyny; none gdy opis nic nie mówi' },
    notes: { type: 'string', description: 'Co przyjęto, jakie klocki i dlaczego, sprawdzenie czasu' },
  }
  return { type: 'object', required: Object.keys(props), properties: props }
}
