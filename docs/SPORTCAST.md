# Wynik na żywo dla aplikacji SportCast (i innych aplikacji z kamerą)

Każde boisko turnieju ma publiczną „tablicę”: jeden mały wpis w Firebase Realtime Database
z wszystkim, czego potrzebuje nakładka na obraz. Czytanie nie wymaga logowania ani klucza.
Wpis zapisują telefony, które liczą punkty (sędzia boiska, sędzia główny), przy każdym punkcie,
starcie i końcu meczu.

## Kod organizatora (tylko organizator może podłączyć kamerę)

Organizator otwiera: panel → **Więcej** (PIN sędziego głównego) → **📺 Transmisja wideo na żywo** →
**📱 Nadajesz aplikacją SportCast?** → **Włącz i pokaż kod dla SportCast**. Strona losuje klucz
(10 znaków `A–Z`, `2–9`) i pokazuje:

- **kod QR** z adresem, np.
  `https://sportlivearena.com/?t=albatros&cam=main/Y7EE8MVL42#kamera`
- **kod do wpisania**, np. `main/Y7EE8MVL42` (`{turniej}/{klucz}`).

Aplikacja przyjmuje jedno i drugie: z adresu bierze parametr `cam`, a wpisany tekst bierze wprost.
Poprawny kod pasuje do `^([a-z0-9-]{3,40})/([A-Z0-9]{8,20})$`.

Tablice są zapisane **pod kluczem**, więc bez kodu nie da się ich odczytać ani wylistować.
Kibice i trenerzy nie widzą tej opcji. „Nowy kod” odcina stary: kamery podłączone starym kodem
przestają dostawać wynik. Dopóki organizator nie włączy kodu, telefony sędziów nie zapisują tablic.

Zeskanowany zwykłym aparatem ten sam adres otwiera w przeglądarce tablice wszystkich boisk
(podgląd tego, co dostaje aplikacja).

## Adresy danych

Baza: `https://turniej-siatkowki-faf22-default-rtdb.europe-west1.firebasedatabase.app`

- **Lista boisk** (do wyboru w aplikacji): `GET {baza}/board/{turniej}/{klucz}.json`
  → obiekt `{ "1": {tablica}, "2": {tablica}, … }` (klucze to numery boisk; Firebase może też
  zwrócić tablicę JSON z `null` na pozycji 0 – obsłuż oba). Nazwa boiska do pokazania: pole `court`,
  a pod nią `a` – `b` (kto teraz gra). `null` albo pusto: kod jest zły albo zmieniony, albo sędziowie
  jeszcze się nie zalogowali.
- **Jedno boisko** (na żywo): `{baza}/board/{turniej}/{klucz}/{boisko}.json`

### Na żywo, bez odpytywania co chwilę (zalecane)

Ten sam adres z nagłówkiem `Accept: text/event-stream` to strumień zdarzeń (SSE). Połączenie
zostaje otwarte, a serwer sam wysyła każdą zmianę, zwykle w ułamku sekundy:

```
event: put
data: {"path":"/","data":{ …cała tablica… }}

event: put
data: {"path":"/pointsA","data":12}          (możliwe także zmiany pojedynczych pól)

event: keep-alive
data: null
```

- `put` z `path` `/`: zastąp całą tablicę; z innym `path`: ustaw to jedno pole
  (np. `/sets/1/a`).
- `patch`: scal podane pola z tablicą pod `path`.
- `keep-alive`: nic nie rób (co ok. 30 s).
- `cancel` / `auth_revoked`: zamknij i połącz ponownie.
- Po zerwaniu (brak internetu) połącz ponownie po 2–5 s. Pierwsze zdarzenie zawsze niesie
  całą tablicę.

Na Androidzie wystarczy `HttpURLConnection` (albo OkHttp) i czytanie linia po linii w wątku w tle.
Zamiast SSE można też co 2–3 s robić `GET` (prostsze, ale wolniejsze i droższe dla bazy).

Uwaga na limit darmowego planu Firebase: 100 jednoczesnych połączeń na cały serwis. Jeden telefon
z kamerą to jedno połączenie; kibice na stronie też je zajmują.

## Pola tablicy (wersja `v: 1`)

```json
{
  "v": 1,
  "at": 1792769700000,
  "tournament": "Albatros CUP 2026",
  "court": "1",
  "status": "live",
  "stage": "Grupa 1 · Dwójki",
  "a": "MKS Sasvolley Stargard 1",
  "b": "SGS Goleniów 2",
  "sets": [{ "a": 25, "b": 20 }, { "a": 12, "b": 14 }],
  "setsA": 1,
  "setsB": 0,
  "pointsA": 12,
  "pointsB": 14,
  "scoring": "sets",
  "setsToWin": 2,
  "setPoints": 25,
  "lastSetPoints": 15,
  "start": "2026-10-23T15:30",
  "next": { "a": "UKS Opty Mielno 1", "b": "UKS Pogodno Szczecin 2", "start": "2026-10-23T15:45" },
  "previous": { "a": "…", "b": "…", "setsA": 2, "setsB": 0, "sets": [{ "a": 25, "b": 18 }, { "a": 25, "b": 21 }] }
}
```

| Pole | Znaczenie |
|------|-----------|
| `v` | Wersja formatu. Inna niż 1: pokaż „zaktualizuj aplikację” i nie zgaduj. |
| `at` | Kiedy zapisano (ms od 1970, zegar telefonu sędziego – tylko informacyjnie). |
| `tournament`, `court`, `stage` | Nazwa turnieju, nazwa boiska („A”, „1”…), grupa/runda i kategoria. |
| `status` | `live` mecz trwa · `next` mecz jeszcze się nie zaczął (sędzia nie nacisnął „Rozpocznij”) · `finished` ostatni wynik, dalszych meczów brak albo jeszcze nie wywołane · `none` na boisku nie ma już meczów. |
| `a`, `b` | Nazwy drużyn (A = lewa w panelu sędziego). W fazie pucharowej, zanim drużyna jest znana: opis typu „Zwycięzca: Półfinał 1”. |
| `sets` | Wszystkie sety meczu; ostatni to set w trakcie (przy `live`). Przy `next` pusta lub brak pola. |
| `setsA`, `setsB` | Wygrane sety (liczą się tylko rozstrzygnięte). |
| `pointsA`, `pointsB` | Punkty ostatniego seta = seta w trakcie. W sportach „na jeden wynik” (`scoring: "score"`) to po prostu wynik (bramki). |
| `scoring` | `sets` (siatkówka, badminton…) albo `score` (piłka nożna, ręczna…: jeden wynik, bez setów). |
| `setsToWin`, `setPoints`, `lastSetPoints` | Zasady: do ilu wygranych setów, do ilu punktów set i set decydujący. |
| `start` | Planowany początek pokazanego meczu (czas lokalny hali, bez strefy). |
| `next` | Kolejny mecz na tym boisku (może go nie być). |
| `previous` | Tylko przy `status: "next"`: wynik meczu, który właśnie się skończył. Nakładka może go pokazać przez chwilę („Koniec: 2:0”), zanim przełączy się na nowe drużyny. |

Brakujące pole traktuj jak puste / 0 (Firebase nie zapisuje pustych list). Nowe pola mogą się
pojawić w przyszłości – ignoruj nieznane.

## Jak to się zmienia w trakcie meczu

1. Sędzia główny loguje się PIN-em → tablice wszystkich boisk dostają `next` z pierwszym meczem.
2. Sędzia boiska naciska „Rozpocznij mecz” → `live`, `sets: [{a:0,b:0}]`.
3. Każdy punkt → nowe `pointsA/pointsB` (i `sets`).
4. Koniec seta → w `sets` dochodzi nowy set, `setsA/setsB` rosną.
5. „Zakończ mecz i wyślij wynik” → `next` z kolejnym meczem i `previous` z wynikiem
   (albo `finished`, gdy na boisku nic już nie ma do zagrania).

Kto może pisać: tylko telefon zalogowany PIN-em tego boiska albo PIN-em sędziego głównego
(reguły w `database.rules.json`). Aplikacja z kamerą tylko czyta.
