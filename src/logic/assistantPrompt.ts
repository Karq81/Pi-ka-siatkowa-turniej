import { langNameEn } from '../i18n'
import { SPORTS } from './sports'

/**
 * What the AI assistant of "Załóż turniej" is asked: the instructions with the catalogue of
 * disciplines and formats, and the JSON schema of the draft it returns.
 */

export function assistantInstructions(): string {
  const list = SPORTS
    .map((s) => `- ${s.id} (${s.label}): ${s.formats.map((f) => `${f.id} = ${f.label}`).join('; ')}`)
    .join('\n')
  return `Pomagasz organizatorowi założyć turniej w serwisie SportLiveArena. Organizator opisuje turniej własnymi słowami albo wkleja notatki (listy drużyn, grupy, godziny, zasady). Przygotuj z tego szkic turnieju.

Zasady:
- Wybierz dyscyplinę i format meczu tylko z katalogu poniżej. Format musi należeć do wybranej dyscypliny. Gdy zasady nie pasują dokładnie, wybierz najbliższy format i napisz o tym w notes.
- Gdy dyscypliny nie ma w katalogu (np. zapasy, boks, taekwondo, siatkonoga), wybierz "inna-wynik" albo "inna-sety" (to, co pasuje do sposobu liczenia) i wpisz prawdziwą nazwę dyscypliny w sportName, np. "Zapasy". Gdy dyscyplina jest w katalogu, sportName zostaw pusty.
- Przepisz do teams wszystkie drużyny z notatek, a w sportach indywidualnych wszystkich zawodników (imię i nazwisko, samo imię albo pseudonim, tak jak napisano), bez pomijania i bez wymyślania nowych. Organizator nie powinien wpisywać ich drugi raz. Klub, z którego jest kilka drużyn, zapisz przed dwukropkiem, np. "UKS Orzeł: Orzeł 1".
- Jeśli notatki podają podział na grupy, przepisz go w groups (nazwy dokładnie jak w teams, bez części przed dwukropkiem). Jeśli nie podają, zostaw groups pustą listę: organizator rozlosuje grupy.
- system: jak rozgrywany jest turniej ("custom" – tylko własny plan z matches, bez grup). "groups" – grupy, każdy z każdym (potem mecze o miejsca); to domyślny wybór, gdy opis nic nie mówi. "knockout" – od razu drabinka pucharowa, przegrany odpada (puchar, system pucharowy, drabinka, eliminacje). "double" – podwójna eliminacja: kto przegra raz, spada do drabinki przegranych (looser/loser bracket, repasaże), kto przegra drugi raz, odpada; wielki finał. Wolne losy przy nieparzystej liczbie strona ustawia sama. thirdPlace: true, gdy w drabince pucharowej ma być mecz o 3. miejsce (przy "knockout" domyślnie true).
- Strona ma nie mieć ograniczeń: gdy opis turnieju nie pasuje dokładnie do "groups", "knockout" ani "double" (np. repasaże, baraże, mecze o każde miejsce, finał zwycięzców grup, skrzyżowane pary A1–B2, turniej finałowy, superfinał, dogrywki, dowolna drabinka), ułóż WŁASNY PLAN w matches danej kategorii. Każde spotkanie: name (krótka, unikalna nazwa, np. "Półfinał 1", "Repasaż 2", "O 5. miejsce"), a i b – skąd bierze się uczestnik:
  "team:Nazwa" – konkretna drużyna/zawodnik (dokładnie jak w teams),
  "group:A:1" – 1. miejsce w grupie A (litera grupy albo numer),
  "winner:Nazwa spotkania" – zwycięzca innego spotkania z planu,
  "loser:Nazwa spotkania" – przegrany innego spotkania z planu.
  place: miejsce zwycięzcy, gdy spotkanie rozstrzyga miejsce (finał 1, o 3. miejsce 3, o 5. miejsce 5), inaczej 0; loserPlace: miejsce przegranego, gdy inne niż place+1 (np. 3 w finale repasaży), inaczej 0. Spotkania mogą czekać tylko na wcześniejsze spotkania. Strona sama ułoży godziny i boiska (po grupach, jeśli są) i sama wpisze uczestników po wynikach.
  Gdy plan ma fazę grupową, podaj groups (albo zostaw pustą, jeśli organizator ma losować) i system "groups"; gdy turniej to same spotkania z planu bez grup, ustaw system "custom". Gdy wystarcza gotowy system (groups/knockout/double), matches zostaw pustą listą.
- twice: true, gdy w grupach każdy gra z każdym dwa razy (mecz i rewanż).
- Opis zasad turnieju (jak ma wyglądać drabinka, kto z kim, rundy) NIE jest listą drużyn: do teams wpisz tylko nazwy drużyn albo zawodników.
- Kategorie wiekowe lub płci (np. "Dziewczęta U12", "Dwójki") to osobne kategorie. Gdy nie ma podziału, użyj jednej kategorii "Turniej".
- Brakujące dane: date, time, dayEnd jako pusty tekst; courts i slotMinutes rozsądne dla dyscypliny. Wszystko, co przyjąłeś sam, wymień w notes.
- Nie zgaduj dat: jeśli podano dzień tygodnia bez daty, zostaw date pustą i napisz o tym w notes. Dzisiaj jest ${new Date().toISOString().slice(0, 10)}.
- notes pisz krótko, w języku: ${langNameEn()} (język organizatora). Nazwy kategorii, gdy wymyślasz je sam (np. "Turniej"), też w tym języku; nazw drużyn z notatek nie tłumacz.

Katalog dyscyplin i formatów (id: opis):
${list}`
}

export function assistantSchema(): Record<string, unknown> {
  const str = { type: 'string' }
  return {
    type: 'object',
    required: ['name', 'sport', 'sportName', 'format', 'date', 'time', 'dayEnd', 'courts', 'slotMinutes', 'categories', 'system', 'thirdPlace', 'twice', 'notes'],
    properties: {
      name: { type: 'string', description: 'Nazwa turnieju' },
      sport: { type: 'string', enum: SPORTS.map((s) => s.id) },
      sportName: { type: 'string', description: 'Nazwa dyscypliny spoza katalogu (przy inna-wynik / inna-sety), inaczej pusty' },
      format: { type: 'string', enum: [...new Set(SPORTS.flatMap((s) => s.formats.map((f) => f.id)))], description: 'Id formatu meczu z wybranej dyscypliny' },
      date: { type: 'string', description: 'Dzień pierwszego meczu RRRR-MM-DD albo pusty' },
      time: { type: 'string', description: 'Godzina pierwszego meczu GG:MM albo pusty' },
      dayEnd: { type: 'string', description: 'Najpóźniejsza godzina ostatniego meczu dnia GG:MM albo pusty' },
      courts: { type: 'integer', description: 'Liczba boisk, kortów lub stołów (1–20)' },
      slotMinutes: { type: 'integer', description: 'Minuty od początku jednego meczu do następnego na boisku' },
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
                  a: { type: 'string', description: 'team:Nazwa | group:A:1 | winner:Spotkanie | loser:Spotkanie' },
                  b: { type: 'string', description: 'team:Nazwa | group:A:1 | winner:Spotkanie | loser:Spotkanie' },
                  place: { type: 'integer', description: 'Miejsce zwycięzcy albo 0' },
                  loserPlace: { type: 'integer', description: 'Miejsce przegranego, gdy inne niż place+1, albo 0' },
                },
              },
            },
          },
        },
      },
      system: { type: 'string', enum: ['groups', 'knockout', 'double', 'custom'], description: 'groups: grupy każdy z każdym; knockout: drabinka pucharowa; double: podwójna eliminacja z drabinką przegranych; custom: tylko własny plan spotkań' },
      twice: { type: 'boolean', description: 'W grupach każdy z każdym dwa razy' },
      thirdPlace: { type: 'boolean', description: 'Mecz o 3. miejsce w drabince pucharowej' },
      notes: { type: 'string', description: 'Co przyjęto, czego brakuje' },
    },
  }
}
