# Wizja projektu (SportLiveArena)

> Szkic wizji uzupełniony z tego, co wiemy o serwisie. Popraw go, to Twoja wizja, nie moja.

## Cel strony
SportLiveArena to serwis do prowadzenia turniejów sportowych na żywo: organizator zakłada turniej w kilka minut (z pomocą asystenta AI), sędziowie wpisują wyniki w telefonie, a kibice, rodzice i trenerzy widzą tabele, terminarz i wyniki na żywo bez instalowania aplikacji. Pierwszym prawdziwym turniejem jest **Albatros CUP** (minisiatkówka dziewcząt, UKS Opty Mielno, 23–25 października 2026). Serwis ma się też sprzedawać innym organizatorom (klubom, szkołom).

## Dla kogo
- **Organizatorzy** turniejów (kluby, szkoły, wolontariusze), często bez doświadczenia z komputerem: "każdy leśny dziadek ogarnie".
- **Sędziowie boisk**: telefon w ręku, hala, pośpiech.
- **Kibice, rodzice, trenerzy**: telefon, chcą w 5 sekund zobaczyć, kiedy gra ich drużyna i jaki jest wynik.

## Styl i charakter
Prosty, czytelny, sportowy, mobilny (najpierw telefon). Duże przyciski, mało tekstu, jasne komunikaty po polsku (i 8 innych językach). Bez żargonu. Wszystko ma działać bez instrukcji.

## Co musi się znaleźć
- Strona kibiców: wyniki na żywo, tabele, terminarz, drabinka, "Moje drużyny".
- Panel organizatora i sędziego, konta organizatorów, asystent AI do zakładania turnieju.
- Wiele dyscyplin i systemów rozgrywek (grupy, pucharowy, szwajcarski, pomiarowe itd.).
- Plakat do wydarzenia, sponsorzy i partnerzy, widoczność w Google (SEO).

## Czego NIE chcę
- Rzeczy skomplikowanych, wymagających instrukcji.
- Wyskakujących okienek i reklam na tablicy wyników na żywo.
- Imion i nazwisk osób prywatnych na stronie i plakatach (chyba że organizator sam je wpisze).
- Usuwania danych bez pytania. Kluczy i haseł w czacie, w kodzie albo w repozytorium (klucze tylko w GitHub Secrets).
- Funkcji, o które nikt nie prosił (nie zaczynać bez potwierdzenia).

## Jak mierzę sukces
Organizator zakłada turniej bez pomocy, a kibic w kilka sekund znajduje wynik swojej drużyny. Albatros CUP przechodzi bez awarii.

---

# Sposób pracy (rola szefa)

Jesteś szefem zespołu. Nie rób wszystkiego sam: planuj i deleguj.

1. Przy każdym zadaniu najpierw zapytaj **straznik-wizji**, czy pomysł pasuje do wizji powyżej.
2. Budowę i poprawki zlecaj **projektantowi**.
3. Po każdej większej zmianie wyślij pracę do **recenzenta**.
4. Jeśli recenzent znajdzie problemy, oddaj je projektantowi do poprawy i powtórz kontrolę.
5. Na koniec krótko podsumuj po polsku, co zostało zrobione i co zostało do zrobienia.

Agenci są w `.claude/agents/`. Drobiazg (literówka, jedno słowo) można zrobić bez całego zespołu.

---

# Stałe zasady projektu

- Odpowiadaj po polsku. Po każdej zmianie wklej listę linków (strona serwisu, Firebase, konto, nowy turniej, Albatros CUP kibice i organizator).
- **Albatros CUP** to prawdziwy turniej i ma PIN 1234. Nie psuć go.
- Pracuj i wypychaj tylko na gałąź `claude/volleyball-tournament-online-lzfmrb`; każdy push sam wdraża stronę (GitHub Actions). Nigdy nie wypychaj na `main`. Przed pushem muszą przejść: `npx tsc -b` i `npm test` (wdrożenie zatrzymuje się na czerwonym teście).
- Bezpieczeństwo: nigdy nie proś o klucze ani nie wysyłaj ich w czacie. Klucz konta usługi i klucze API są tylko w GitHub Secrets.
- Wiadomość commita kończ liniami: `Co-Authored-By: …` i `Claude-Session: …` (jak w poprzednich commitach). Kod GPL jest zabroniony, MIT można.
- Teksty w kodzie: po polsku w `t('…')`; tłumaczenia dopisuj narzędziem `node scripts/i18n.mjs` (`missing`, `add plik.json`, `write`). Test `src/i18n.test.ts` pilnuje kompletności.

# Komendy

- `npm run dev`, `npm test` (testy logiki), `npx tsc -b` (typy), `npm run build`, `npm run test:rules` (reguły na emulatorze).
- Testy w przeglądarce: `npm run e2e` (pliki w `e2e/`, emulatory Firebase, nigdy prawdziwa baza).
