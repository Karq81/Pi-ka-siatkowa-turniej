# Specyfikacja: moduł organizacji turniejów sportowych

Dokument dla programisty (np. Claude Code). Opisuje formaty rozgrywek, systemy punktacji, kryteria rozstrzygania remisów i profile popularnych dyscyplin, tak aby moduł na stronie mógł obsłużyć większość turniejów organizowanych przez ludzi (amatorskich, szkolnych, klubowych i ligowych).

**Najważniejsza zasada projektowa:** nie zaszywaj reguł w kodzie. Nawet w obrębie jednej dyscypliny różne rozgrywki stosują inne kolejności kryteriów (np. na MŚ 2026 w piłce nożnej FIFA przesunęła bezpośrednie mecze przed różnicę bramek, a w siatkówce FIVB różne turnieje mają inną kolejność „stosunek setów / stosunek małych punktów”). Dlatego każdy turniej ma **profil reguł** (JSON), a dyscypliny to tylko gotowe szablony profili, które organizator może edytować.

---

## 1. Model danych

```ts
Tournament {
  id, name, discipline: DisciplineKey, rulesProfile: RulesProfile,
  categories: Category[],        // np. "Open", "U12 dziewczęta", "Amatorzy"
  status: "draft" | "registration" | "in_progress" | "finished",
  venues: Venue[],               // boiska / korty / stoły
}
Category   { id, name, participantType: "player" | "pair" | "team", stages: Stage[], participants: Participant[] }
Participant{ id, name, seed?: number, rating?: number, club?: string, members?: Player[], status: "active" | "withdrawn" | "disqualified" }
Stage {
  id, order, name,               // "Faza grupowa", "Play-off"
  format: FormatKey,             // patrz rozdział 2
  config: object,                // parametry formatu
  groups?: Group[],
  advancement: AdvancementRule,  // kto i gdzie awansuje
}
Group      { id, name, participantIds[] }
Match {
  id, stageId, groupId?, round, bracketPosition?,
  homeId | null, awayId | null,  // null = BYE lub jeszcze nieznany (zwycięzca meczu X)
  sourceHome?: { matchId, take: "winner" | "loser" }, sourceAway?: {...},
  leg?: 1 | 2,                   // dwumecz
  scheduledAt?, venueId?,
  result?: MatchResult,
  status: "scheduled" | "live" | "finished" | "walkover" | "cancelled",
}
MatchResult {
  periods: { home: number, away: number }[],   // sety / gemy / kwarty / legi
  final: { home, away },                        // np. sety 3:1 albo gole 2:1
  decidedBy: "regulation" | "overtime" | "shootout" | "walkover" | "retirement",
  winnerId | null,                              // null = remis
  extra?: { cards?, tries?, ... }               // dane do kryteriów (fair play, punkty bonusowe)
}
// Konkurencje mierzone (bieganie, pływanie, rzuty, golf):
Performance { participantId, heatId?, attempts: number[], best: number, unit: "time_ms" | "distance_cm" | "points" | "strokes", status: "OK" | "DNF" | "DNS" | "DQ" }
```

---

## 2. Formaty rozgrywek

### 2.1 Każdy z każdym (round robin, liga)
- Pojedynczy (każda para raz) lub podwójny (mecz i rewanż, z zamianą gospodarza).
- Liczba kolejek: `n−1` dla parzystego `n`; dla nieparzystego dodaj wirtualnego uczestnika BYE (wtedy `n` kolejek, co kolejkę ktoś pauzuje).
- Generowanie: **metoda koła (tabele Bergera)** — uczestnik 1 stoi w miejscu, pozostali rotują o jedną pozycję co kolejkę. Naprzemiennie zamieniaj gospodarza, żeby nikt nie grał kilku meczów z rzędu u siebie.
- Tabela liczona wg profilu punktacji i kryteriów (rozdz. 3–4).

### 2.2 Pucharowy — pojedyncza eliminacja
- Rozmiar drabinki = najbliższa potęga dwójki ≥ liczby uczestników. Wolne losy (BYE) = rozmiar − liczba uczestników; dostają je najwyżej rozstawieni.
- **Standardowe rozstawienie** (1 i 2 mogą spotkać się dopiero w finale): zacznij od `[1,2]`, w każdym kroku zamień każde rozstawienie `s` na parę `[s, 2k+1−s]`, gdzie `2k` to nowa długość. Dla 8: `1–8, 4–5, 2–7, 3–6`.
- Opcje: mecz o 3. miejsce; dwa brązowe medale (bez meczu o 3. miejsce, np. sporty walki); gra o dalsze miejsca (5–8 itd.).
- Mecz w pucharze nie może zakończyć się remisem → profil określa dogrywkę / rzuty karne / tie-break.
- Rozstawienie: z rankingu, ręczne lub losowanie; opcjonalnie rozdzielanie zawodników z tego samego klubu do różnych połówek.

### 2.3 Podwójna eliminacja
- Drabinka zwycięzców + drabinka przegranych; odpada się po drugiej porażce.
- Przegrani z rundy `r` drabinki zwycięzców trafiają do odpowiedniej rundy drabinki przegranych (naprzemiennie odwracaj kolejność, by unikać szybkich rewanżów).
- Wielki finał: zwycięzca górnej drabinki vs zwycięzca dolnej. Opcja **reset drabinki**: jeśli wygra zawodnik z dolnej, gra się drugi mecz (bo obaj mają po jednej porażce).

### 2.4 System szwajcarski
- Stała liczba rund (zwykle ≈ `ceil(log2(n))` lub więcej), nikt nie odpada.
- Kojarzenie w każdej rundzie: grupuj po liczbie punktów, w grupie górna połowa gra z dolną (system holenderski), **bez powtórzeń par**; jeśli grupa jest nieparzysta, najniższy przechodzi do niższej grupy punktowej.
- BYE przy nieparzystej liczbie: dostaje najniżej sklasyfikowany, który jeszcze nie pauzował; wartość BYE konfigurowalna (zwykle 1 pkt lub ½).
- Szachy: dodatkowo balans kolorów (białe/czarne naprzemiennie, maks. 2 razy z rzędu ten sam kolor).
- Wariant e-sportowy: gra się do X zwycięstw (awans) lub X porażek (odpadnięcie), np. 3–3.
- Kryteria remisowe typowe: Buchholz, Buchholz bez najsłabszego (Cut 1), Sonneborn-Berger, bezpośredni pojedynek, liczba zwycięstw (rozdz. 4).

### 2.5 Grupy + faza pucharowa
- Podział na grupy **metodą węża** z koszyków rozstawienia (A1, B1, C1, D1, D2, C2, B2, A2, …) lub losowaniem z koszyków.
- Awans: `top N` z każdej grupy + opcjonalnie najlepsze drużyny z miejsc N+1 (np. najlepsze trzecie). Przy grupach różnej wielkości porównuj średnią na mecz albo odrzuć wyniki z ostatnią drużyną w większych grupach.
- Krzyżowanie: A1–B2, B1–A2 itd.; zwycięzcy grup nie grają ze sobą w pierwszej rundzie, drużyny z tej samej grupy trafiają do przeciwnych połówek drabinki.

### 2.6 Dwumecz i serie
- **Dwumecz**: suma bramek z 2 meczów; przy remisie w sumie dogrywka w rewanżu, potem karne. Zasada bramek na wyjeździe — opcjonalna flaga, domyślnie wyłączona (UEFA ją zniosła).
- **Seria best-of-N** (np. do 4 zwycięstw w play-offach koszykówki/hokeja): kolejne mecze generowane tylko, dopóki nikt nie osiągnął `ceil(N/2)` zwycięstw; ustawiany schemat gospodarzy (np. 2-2-1-1-1).

### 2.7 Konkurencje mierzone (czas, odległość, wynik)
- Biegi, pływanie, kolarstwo na czas, skoki, rzuty, łucznictwo, strzelectwo, kręgle, golf.
- Kierunek sortowania: `lower_is_better` (czas, uderzenia w golfie) lub `higher_is_better` (odległość, punkty).
- Eliminacje w seriach/biegach → awans „Q” (miejsce w serii) + „q” (najlepsze czasy spoza miejsc).
- Próby: liczy się najlepsza (np. 3 lub 6 prób), remis rozstrzyga druga najlepsza próba.
- Statusy DNF / DNS / DQ zawsze na końcu klasyfikacji.

### 2.8 Punktacja za miejsca (wieloetapowa)
- Seria wyścigów / rund, każdy etap daje punkty za zajęte miejsce, np. `[25,18,15,12,10,8,6,4,2,1]` lub system niski (1. miejsce = 1 pkt, wygrywa najmniej punktów, jak w żeglarstwie; opcja odrzucenia najgorszego wyniku).
- Stosowane w e-sporcie (battle royale), żeglarstwie, cyklach zawodów, grand prix amatorskich.

### 2.9 Formaty rekreacyjne (popularne w amatorskim padlu, tenisie, siatkówce plażowej)
- **Americano**: gracze zmieniają partnerów co rundę, mecz do stałej liczby punktów (np. 21/24/32), każdy zawodnik zbiera indywidualnie punkty zdobyte przez swoją parę.
- **Mexicano**: jak Americano, ale od drugiej rundy pary i przeciwnicy dobierani wg aktualnej tabeli (1+4 vs 2+3 w czwórce).
- **Drabinka (ladder)**: ciągły ranking, można wyzwać zawodnika o 1–3 miejsca wyżej; wygrana z wyższym = zamiana miejsc.
- **King of the court**: zwycięzca zostaje na boisku, przegrany schodzi.

---

## 3. Systemy punktacji meczu (do tabeli)

Punkty przyznawane są funkcją `(wynik, decidedBy, marginesy) → punkty`. Konfiguracja jako lista reguł:

| Profil | Zwycięstwo | Remis | Porażka | Uwagi |
|---|---|---|---|---|
| Piłka nożna, futsal | 3 | 1 | 0 | |
| Piłka ręczna | 2 | 1 | 0 | |
| Koszykówka (FIBA) | 2 | — | 1 | walkower: 0 |
| Hokej (IIHF) | 3 w regulaminowym / 2 po dogrywce lub karnych | — | 1 po dogrywce / karnych, 0 w regulaminowym | |
| Hokej (NHL) | 2 | — | 1 po dogrywce / karnych, 0 w regulaminowym | |
| Siatkówka (FIVB) | 3 za 3:0 i 3:1, 2 za 3:2 | — | 1 za 2:3, 0 za 0:3 i 1:3 | kolejność kryteriów zależy od turnieju |
| Siatkówka plażowa | 2 | — | 1 | |
| Tenis stołowy (drużynowo) | 2 | — | 1 | 0 za niestawienie się |
| Rugby | 4 | 2 | 0 | +1 bonus za 4 przyłożenia, +1 za porażkę różnicą ≤7 |
| Szachy | 1 | ½ | 0 | BYE konfigurowalne |
| Tenis, badminton, squash, padel | 1 zwycięstwo | — | 0 | tabele liczone liczbą zwycięstw |
| Baseball | procent zwycięstw | — | | |

---

## 4. Kryteria rozstrzygania remisów w tabeli

Profil zawiera **uporządkowaną listę** kryteriów, np. `["points", "h2h_points", "h2h_diff", "diff", "scored", "fair_play", "lots"]`. Implementacja:

1. Posortuj po pierwszym kryterium.
2. Dla każdej grupy remisującej stosuj kolejne kryterium.
3. Kryteria `h2h_*` liczone są **tylko z meczów między uczestnikami aktualnie remisującymi**. Jeśli kryterium h2h rozdzieli część grupy, dla pozostałych remisujących **licz h2h od nowa** tylko między nimi (tak robi m.in. UEFA). Zrób z tego flagę `h2hReapply: true/false`.
4. Na końcu zawsze `lots` (losowanie, zapisane w bazie, żeby wynik się nie zmieniał) albo `shared_position` (ex aequo).

Dostępne kryteria:
- `points`, `wins`, `win_pct`
- `diff` (różnica bramek / punktów), `scored`, `ratio_sets` (sety wygrane / przegrane), `ratio_points` (małe punkty), `ratio_games` (gemy)
- `h2h_points`, `h2h_diff`, `h2h_scored`, `h2h_result` (kto wygrał bezpośredni mecz)
- `away_scored`, `fair_play` (żółta −1, druga żółta/czerwona −3, bezpośrednia czerwona −4 itp.)
- Szachy / szwajcar: `buchholz` (suma punktów przeciwników), `buchholz_cut1` (bez najsłabszego), `buchholz_median` (bez najlepszego i najsłabszego), `sonneborn_berger` (suma punktów pokonanych + połowa zremisowanych), `wins_black`, `progressive` (suma narastających wyników)
- `rating`, `seed`, `lots`

Uwaga: dzielenie przez zero w `ratio_*` → traktuj jako nieskończoność (wszystko wygrane).

---

## 5. Profile dyscyplin (szablony)

Każdy profil definiuje: strukturę meczu, czy remis jest dozwolony, jak rozstrzygnąć remis w pucharze, punktację, domyślne kryteria i wynik walkowera.

**Piłka nożna / futsal** — wynik w golach; remis dozwolony w grupie; w pucharze: dogrywka (opcja) → rzuty karne (w amatorskich turniejach często od razu karne); karne zapisywane osobno, nie wliczane do bramek w tabeli. Walkower 3:0.

**Koszykówka** — kwarty; dogrywki po 5 min aż do rozstrzygnięcia (brak remisów); FIBA stawia bezpośrednie mecze wysoko w kryteriach. Walkower 20:0. Wariant 3x3: mecz do 21 pkt lub limit czasu.

**Siatkówka** — sety do 25 (5. set do 15), przewaga 2 pkt, mecz do 3 wygranych setów (amatorsko często do 2). Walkower 3:0 (25:0 w każdym secie). Siatkówka plażowa: do 2 setów, sety do 21, trzeci do 15.

**Piłka ręczna** — remis dozwolony w grupie; puchar: dogrywka, potem rzuty karne 7 m.

**Hokej** — tercje; przy remisie dogrywka, potem rzuty karne; punkty zależne od `decidedBy`.

**Tenis** — gemy do 4 pkt z przewagą (lub „złoty punkt” bez przewagi — flaga); set do 6 z przewagą 2, tie-break przy 6:6 do 7; mecz do 2 lub 3 wygranych setów; opcja: trzeci set jako super tie-break do 10. Walidacja wyników setów (7:5, 7:6 ok; 8:5 niepoprawny). Krecz (`retirement`) = wygrana przeciwnika.

**Padel** — jak tenis; często złoty punkt; popularne formaty Americano / Mexicano.

**Tenis stołowy** — gry do 11, przewaga 2, mecz do 3 lub 4 wygranych gier.

**Badminton** — gry do 21, przewaga 2, maks. 30; mecz do 2 wygranych gier.

**Squash** — gry do 11, przewaga 2; mecz do 3 wygranych gier.

**Szachy** — 1 / ½ / 0; system szwajcarski lub kołowy; kolory; BYE; kryteria: w szwajcarze Buchholz (Cut 1) + Sonneborn-Berger, w kołowym bezpośredni pojedynek + Sonneborn-Berger.

**Darts** — legi (501, zakończenie na double), mecz do X legów lub setów; tabela: zwycięstwa, różnica legów.

**E-sport** — mecze BO1 / BO3 / BO5 (mapy/gry jako okresy); szwajcar do 3 wygranych / 3 porażek, grupy GSL (podwójna eliminacja w 4-osobowej grupie) lub punktacja za miejsca w battle royale.

**Rugby** — przyłożenia zapisywane w `extra.tries` dla punktów bonusowych.

**Bilard** — mecz do X wygranych partii (race to X); często podwójna eliminacja.

**Kręgle / bowling** — suma kręgli z N gier, opcjonalny handicap.

**Golf** — stroke play (najmniej uderzeń; opcja handicapu netto), Stableford (punkty za dołek, więcej = lepiej), match play (drabinka pucharowa, wygrane dołki).

**Lekkoatletyka / pływanie / biegi / kolarstwo** — format 2.7; kategorie wiekowe i płci; miejsca mogą być ex aequo.

**Sporty walki (judo, zapasy, karate)** — pojedyncza eliminacja, dwa brązowe medale; opcja repasaży (przegrani z finalistami walczą o brąz).

---

## 6. Sytuacje szczególne (muszą być obsłużone)

- **Walkower**: wynik ustawiany z profilu (np. 3:0, 20:0, 25:0 w setach); konfigurowalne, czy przegrany dostaje punkty.
- **Wycofanie w trakcie ligi**: opcja A — jeśli rozegrał mniej niż 50% meczów, usuń wszystkie jego wyniki; w przeciwnym razie pozostałe mecze jako walkowery. Opcja B — zawsze walkowery. Wybór w profilu.
- **Dyskwalifikacja**: jak wycofanie + oznaczenie w tabeli.
- **BYE** w drabince: automatyczny awans, mecz niewidoczny lub oznaczony „wolny los”.
- **Korekta wyniku** po czasie: przelicz tabelę i, jeśli to możliwe, kolejne rundy; jeśli kolejna runda już się odbyła — ostrzeżenie dla organizatora zamiast automatycznej zmiany.
- **Ręczna edycja**: organizator może ręcznie zmienić parę / rozstawienie; system zapisuje historię zmian.
- **Remis w pucharze** zapisany bez rozstrzygnięcia → walidacja blokuje zapis.

---

## 7. Harmonogram

- Wejście: liczba boisk/kortów, godziny dostępności, długość meczu + przerwa, minimalny odpoczynek zawodnika między meczami.
- Uczestnik nie może grać dwóch meczów naraz (także w różnych kategoriach — sprawdzaj członków drużyn/par).
- Mecze pucharowe planowane dopiero, gdy znani są uczestnicy albo z „przewidywanym” czasem.
- Algorytm wystarczający na start: zachłanny — bierz mecze w kolejności rund, przypisuj do najwcześniejszego wolnego boiska spełniającego ograniczenia odpoczynku.

---

## 8. Widoki na stronie

- Tabela grupy/ligi (z kolumnami zależnymi od dyscypliny: bramki, sety, małe punkty, Buchholz…) i legendą kryteriów.
- Drabinka pucharowa (pojedyncza i podwójna), klikalne mecze.
- Terminarz z filtrem po boisku, kategorii, uczestniku; wyniki na żywo.
- Panel organizatora: kreator turnieju (dyscyplina → format → etapy → uczestnicy → rozstawienie → generuj), wpisywanie wyników z walidacją zależną od dyscypliny.
- Eksport: PDF/druk tabel i drabinek, udostępnialny link.

---

## 9. Testy akceptacyjne (przykłady)

1. Kołowy dla 5 drużyn → 5 kolejek, każda drużyna pauzuje dokładnie raz, 10 meczów.
2. Pucharowy dla 6 uczestników → drabinka 8, BYE dla rozstawionych 1 i 2; w 1. rundzie grają 3–6 i 4–5.
3. Trzy drużyny z równą liczbą punktów, A>B, B>C, C>A → kryteria h2h nie rozstrzygają, przechodzi do różnicy bramek.
4. Siatkówka: wynik 3:2 → zwycięzca 2 pkt, przegrany 1 pkt.
5. Tenis: set 7:6 wymaga zapisanego tie-breaka; set 6:5 odrzucony jako niedokończony.
6. Szwajcar 7 graczy, 5 rund → brak powtórzonych par, każdy BYE maksymalnie raz.
7. Podwójna eliminacja z resetem → zwycięstwo gracza z dolnej drabinki w finale generuje drugi mecz.
8. Wycofanie drużyny po 2 z 7 meczów (opcja A) → jej wyniki znikają z tabel pozostałych.

---

## 10. Sugerowana kolejność implementacji

1. Model danych + profile dyscyplin jako pliki JSON.
2. Kołowy + tabela z konfigurowalnymi kryteriami.
3. Pojedyncza eliminacja z rozstawieniem i BYE.
4. Grupy + play-off (łączenie etapów przez `advancement`).
5. Szwajcar, podwójna eliminacja, dwumecz/serie.
6. Konkurencje mierzone i punktacja za miejsca.
7. Harmonogram, formaty rekreacyjne (Americano/Mexicano), eksporty.

Reguły oficjalnych federacji zmieniają się co sezon, więc szablony profili traktuj jako punkt startowy, a organizator zawsze może je nadpisać.
