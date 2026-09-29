# SiatkaLive

Wyniki turnieju mini siatkówki na żywo: strona dla kibiców, panel sędziego boiska i panel sędziego głównego.

## Co jest w tej wersji (szkic)

- **Strona publiczna** (`#`): 10 boisk z wynikiem na żywo, ostatnie wyniki, tabele grup (`#tabele`) i terminarz z wyszukiwarką drużyn (`#terminarz`).
- **Panel boiska** (`#sedzia`, `#boisko-3`): PIN, przycisk „Rozpocznij mecz”, duże +1 / −1, zatwierdzanie setów, zakończenie meczu. Po wysłaniu wyniku poprawić go może tylko sędzia główny.
- **Sędzia główny** (`#admin`): podgląd wszystkich boisk, wpisywanie i poprawianie wyników, import drużyn z Excela (wklejka: Drużyna;Kategoria;Grupa) z automatycznym ułożeniem terminarza, eksport wyników do CSV/Excela, ustawienia zasad (sety, punkty, punktacja tabeli), PIN-y.
- **Tryb TV** (`#tv`): na telewizor lub rzutnik, sam przełącza boiska i tabele.

Dane przykładowe: 60 drużyn, 3 kategorie, 12 grup po 5, 10 boisk. W trybie lokalnym: PIN sędziego głównego `1234`, klucz boiska N to `100N` (np. boisko 3: `1003`).

Bez konfiguracji Firebase aplikacja działa lokalnie (dane w jednej przeglądarce, dobre do przeklikania).
Z Firebase wyniki z telefonów sędziów trafiają na żywo do wszystkich, także bez zasięgu (wyślą się po jego powrocie).
Instrukcja krok po kroku: [docs/URUCHOMIENIE.md](docs/URUCHOMIENIE.md).

## Uruchomienie

```bash
npm install
npm run dev        # serwer deweloperski
npm test           # testy logiki (sety, tabele, terminarz, import)
npm run test:rules # testy reguł bezpieczeństwa na emulatorze Firebase
npm run dev:emulator # aplikacja na lokalnym emulatorze Firebase
npm run build      # wersja do wrzucenia na hosting (katalog dist/)
```

## Wyszukiwarki (SEO)

Aplikacja jest jedną stroną z ekranami za „#”, a wyszukiwarki pomijają wszystko po „#”. Dlatego:

- `index.html` ma opis, dane do podglądu linków (Open Graph), adres kanoniczny, dane strukturalne i alternatywy językowe; `public/robots.txt` i `public/og-image.png` trafiają do `dist/`.
- `npm run build` po zbudowaniu aplikacji uruchamia `scripts/generate-seo.mjs`. Zapisuje w `dist/` zwykłe strony HTML: listę dyscyplin i stronę każdej dyscypliny w 9 językach (`/turnieje/`, `/en/tournaments/`, `/de/turniere/`…, np. `/turnieje/siatkowka-plazowa/`) oraz `sitemap.xml` z alternatywami językowymi. Dyscypliny, zasady i tłumaczenia pochodzą z `src/logic/sports.ts`, więc nowa dyscyplina dostaje swoje strony sama.
- Teksty tych stron (9 języków) są w `scripts/generate-seo.mjs` (obiekt `COPY`).
- Strona turnieju (`/?t=adres`) ustawia własny tytuł, opis i adres kanoniczny (`src/seo.ts`, tylko dla wyszukiwarek, które uruchamiają skrypty); kanoniczna jest zawsze domena sportlivearena.com.
- Po wdrożeniu dodaj `https://sportlivearena.com/sitemap.xml` w Google Search Console.
