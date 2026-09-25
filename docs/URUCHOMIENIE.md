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
2. Ustaw PIN sędziego głównego → **Utwórz turniej**. Wczytują się zespoły z listy zakwalifikowanych.
   Klucze dla każdego boiska generują się same: **Klucze boisk** (tam też kartki z kodami QR do wydruku).
3. **Panel organizatora** (`#panel`) → **1. Zespoły i losowanie** → „Losuj grupy” osobno dla dwójek
   i trójek (drużyny jednego klubu nigdy w tej samej grupie). Losowanie można powtarzać.
4. **Ustawienia** → zasady meczu (sety, punkty, punktacja tabeli).

## Adresy

**Dla rodziców i trenerów (tylko oglądanie, bez żadnych przycisków do wpisywania):**

| Co | Adres |
|---|---|
| Strona startowa z informacjami i kodem QR | `adres-strony/` |
| Wyniki meczów (tabela, tu prowadzi kod QR) | `adres-strony/#wyniki` |
| Boiska na żywo | `adres-strony/#na-zywo` |
| Tabele grup, drabinka, terminarz | `#tabele`, `#drabinka`, `#terminarz` |

**Dla organizatora (niepodlinkowane ze strony publicznej, wszystko wymaga klucza):**

| Co | Adres |
|---|---|
| Panel organizatora | `adres-strony/#panel` |
| Sędzia główny | `adres-strony/#admin` |
| Sędziowie boisk (lista boisk) | `adres-strony/#sedzia` |
| Boisko nr 3: liczenie na żywo / wynik z kartki | `#boisko-3` / `#wynik-3` |
| Kartki z kodami QR i kluczami | `adres-strony/#kartki` |
| Telewizor na hali | `adres-strony/#tv` |

## Jak działa bezpieczeństwo

- Wyniki może czytać każdy.
- Zapis wymaga klucza. Każde boisko ma swój klucz; z kluczem boiska 3 można prowadzić tylko mecze na boisku 3.
  PIN sędziego głównego otwiera wszystko. Telefon wysyła klucz raz, reguły Firestore porównują go z kluczami
  w bazie (które widzi tylko sędzia główny).
- Sędzia boiska może prowadzić mecz, ale **zakończonego wyniku nie zmieni**. Poprawia tylko sędzia główny.
- „Nowy klucz” dla boiska odcina telefon, który miał stary klucz.
- Bez zasięgu telefon zapisuje punkty u siebie i wysyła je, gdy wróci internet.

## Testy lokalne

```bash
npm test             # logika: sety, tabele, terminarz, import
npm run test:rules   # reguły bezpieczeństwa na emulatorze Firebase (wymaga Javy)
npm run dev:emulator # cała aplikacja na lokalnym emulatorze, bez prawdziwego projektu
```
