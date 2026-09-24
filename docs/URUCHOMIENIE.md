# Uruchomienie online (Firebase + hosting)

Bez tej konfiguracji aplikacja działa w trybie lokalnym (dane tylko w jednej przeglądarce).
Po niej wyniki z telefonów sędziów trafiają na żywo do wszystkich. Wszystko mieści się w darmowych planach.

## 1. Projekt Firebase (ok. 5 minut)

1. Wejdź na https://console.firebase.google.com i zaloguj się kontem Google.
2. **Dodaj projekt** → nazwa np. `siatkalive` → Google Analytics możesz wyłączyć → **Utwórz projekt**.
3. Menu po lewej **Build → Authentication** → **Get started** → zakładka **Sign-in method** →
   **Anonymous** → włącz → **Save**.
4. **Build → Firestore Database** → **Create database** → lokalizacja `eur3 (europe-west)` →
   **Start in production mode** → **Create**.
5. W Firestore zakładka **Rules** → usuń to, co tam jest, wklej całą zawartość pliku
   [`firestore.rules`](../firestore.rules) → **Publish**.
6. Koło zębate obok „Project Overview” → **Project settings** → na dole **Your apps** → ikona `</>` (Web) →
   nazwa `siatkalive` → **Register app**. Pokaże się `firebaseConfig`. Potrzebne są 4 wartości:
   `apiKey`, `authDomain`, `projectId`, `appId`.

Te wartości nie są tajne (i tak trafiają do przeglądarki). O dostępie decydują reguły z punktu 5 i PIN-y.

## 2. Konfiguracja w projekcie

Wpisz te 4 wartości do pliku `.env.production` (wzór w `.env.example`):

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
```

## 3. Hosting (Vercel, darmowy)

1. https://vercel.com → **Sign up with GitHub**.
2. **Add New → Project** → wybierz repozytorium → Vercel sam rozpozna Vite → **Deploy**.
3. Dostajesz adres typu `siatkalive.vercel.app`. Każdy push na GitHub aktualizuje stronę sam.

## 4. Pierwsze uruchomienie

1. Wejdź na `adres-strony/#admin`. Pokaże się **Pierwsze uruchomienie**.
2. Ustaw PIN sędziego głównego i PIN sędziów boisk → **Utwórz turniej** (startuje z danymi przykładowymi).
3. **Drużyny i terminarz** → wklej drużyny z Excela → **Wczytaj i ułóż terminarz**.
4. **Ustawienia** → zasady meczu (sety, punkty, punktacja tabeli).

## Adresy

| Co | Adres |
|---|---|
| Wyniki dla kibiców | `adres-strony/` |
| Panel boiska nr 3 (na kod QR przy boisku) | `adres-strony/#boisko-3` |
| Lista boisk dla sędziów | `adres-strony/#sedzia` |
| Sędzia główny | `adres-strony/#admin` |
| Telewizor na hali | `adres-strony/#tv` |

## Jak działa bezpieczeństwo

- Wyniki może czytać każdy.
- Zapis wymaga PIN-u. Telefon wysyła PIN raz, reguły Firestore porównują go z PIN-em zapisanym w bazie
  (którego aplikacja nie może odczytać).
- Sędzia boiska może prowadzić mecz, ale **zakończonego wyniku nie zmieni**. Poprawia tylko sędzia główny.
- Po zmianie PIN-ów stare telefony tracą dostęp.
- Bez zasięgu telefon zapisuje punkty u siebie i wysyła je, gdy wróci internet.

## Testy lokalne

```bash
npm test             # logika: sety, tabele, terminarz, import
npm run test:rules   # reguły bezpieczeństwa na emulatorze Firebase (wymaga Javy)
npm run dev:emulator # cała aplikacja na lokalnym emulatorze, bez prawdziwego projektu
```
