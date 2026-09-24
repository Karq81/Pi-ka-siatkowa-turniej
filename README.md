# SiatkaLive

Wyniki turnieju mini siatkówki na żywo: strona dla kibiców, panel sędziego boiska i panel sędziego głównego.

## Co jest w tej wersji (szkic)

- **Strona publiczna** (`#`): 10 boisk z wynikiem na żywo, ostatnie wyniki, tabele grup (`#tabele`) i terminarz z wyszukiwarką drużyn (`#terminarz`).
- **Panel boiska** (`#sedzia`, `#boisko-3`): PIN, przycisk „Rozpocznij mecz”, duże +1 / −1, zatwierdzanie setów, zakończenie meczu. Po wysłaniu wyniku poprawić go może tylko sędzia główny.
- **Sędzia główny** (`#admin`): podgląd wszystkich boisk, wpisywanie i poprawianie wyników, import drużyn z Excela (wklejka: Drużyna;Kategoria;Grupa) z automatycznym ułożeniem terminarza, eksport wyników do CSV/Excela, ustawienia zasad (sety, punkty, punktacja tabeli), PIN-y.
- **Tryb TV** (`#tv`): na telewizor lub rzutnik, sam przełącza boiska i tabele.

Dane przykładowe: 60 drużyn, 3 kategorie, 12 grup po 5, 10 boisk. PIN sędziego głównego `1234`, PIN boisk `0000`.

> Na razie dane są zapisywane tylko w przeglądarce (synchronizują się między kartami na jednym urządzeniu).
> Następny krok: wspólna baza online (Firebase), żeby wyniki z telefonów sędziów trafiały do wszystkich.

## Uruchomienie

```bash
npm install
npm run dev        # serwer deweloperski
npm test           # testy logiki (sety, tabele, terminarz, import)
npm run build      # wersja do wrzucenia na hosting (katalog dist/)
```
