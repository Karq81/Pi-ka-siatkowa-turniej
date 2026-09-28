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
    required: ['name', 'sport', 'sportName', 'format', 'date', 'time', 'dayEnd', 'courts', 'slotMinutes', 'categories', 'notes'],
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
          required: ['name', 'teams', 'groups'],
          properties: {
            name: str,
            teams: { type: 'array', items: str, description: 'Drużyny, zawodnicy lub pary; klub przed dwukropkiem' },
            groups: { type: 'array', items: { type: 'array', items: str }, description: 'Grupy z notatek albo pusta lista' },
          },
        },
      },
      notes: { type: 'string', description: 'Co przyjęto, czego brakuje' },
    },
  }
}
