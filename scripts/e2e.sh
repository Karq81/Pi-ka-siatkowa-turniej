#!/bin/bash
# Browser tests (e2e/*.mjs): each one clicks through the site like an organiser, a referee
# and a fan, against the Firebase emulators (never the real database) and a local dev server.
#
#   npm run e2e                               – all of them (01-albatros-board first: it seeds Albatros CUP)
#   npm run e2e -- e2e/17-measured-events.mjs – only these
#
# Needs Java (emulators) and a Chromium for Playwright: `npx playwright install chromium`,
# or CHROMIUM=/path/to/chrome. Screenshots go to e2e/out.
set -u
cd "$(dirname "$0")/.."
# Local services never go through an HTTP proxy (some CI and cloud machines have one).
export NO_PROXY="127.0.0.1,localhost${NO_PROXY:+,$NO_PROXY}" no_proxy="127.0.0.1,localhost${no_proxy:+,$no_proxy}"
OUT=${E2E_OUT:-e2e/out}
mkdir -p "$OUT"
up() { (echo > "/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
started=()
cleanup() { for pid in "${started[@]}"; do kill "$pid" 2>/dev/null; done; }
trap cleanup EXIT

if ! up 8080 || ! up 9099; then
  echo "Uruchamiam emulatory Firebase…"
  npx firebase emulators:start --only firestore,auth --project demo-siatkalive > "$OUT/emulators.log" 2>&1 &
  started+=($!)
fi
if ! up 9000; then
  # The Realtime Database emulator on its own: its rules are loaded below (the CLI cannot load them
  # behind some proxies). The jar is the one the Firebase CLI downloaded; without it, the CLI.
  jar=$(ls ~/.cache/firebase/emulators/firebase-database-emulator-*.jar 2>/dev/null | tail -1)
  if [ -n "$jar" ]; then
    java -jar "$jar" --host 127.0.0.1 --port 9000 > "$OUT/database.log" 2>&1 &
  else
    npx firebase emulators:start --only database --project demo-siatkalive > "$OUT/database.log" 2>&1 &
  fi
  started+=($!)
fi
if ! up 5191; then
  echo "Uruchamiam stronę (vite, tryb emulatora)…"
  npx vite --mode emulator --port 5191 --strictPort > "$OUT/vite.log" 2>&1 &
  started+=($!)
fi
for _ in $(seq 1 90); do up 8080 && up 9099 && up 9000 && up 5191 && break; sleep 2; done
if ! up 8080 || ! up 9000 || ! up 5191; then echo "Emulatory albo strona nie wystartowały (zobacz $OUT/*.log)."; exit 1; fi
# Realtime Database rules (live scores), the same as in production.
curl -s --noproxy '*' -X PUT -H "Authorization: Bearer owner" \
  "http://127.0.0.1:9000/.settings/rules.json?ns=demo-siatkalive-default-rtdb" --data-binary @database.rules.json > /dev/null

files=("$@")
[ ${#files[@]} -eq 0 ] && files=(e2e/*.mjs)
failed=()
for f in "${files[@]}"; do
  log="$OUT/$(basename "$f" .mjs).log"
  E2E_OUT="$OUT" timeout 900 node "$f" > "$log" 2>&1
  result=$(grep -E '^WYNIK' "$log" | tail -1)
  if [[ "$result" =~ WYNIK:\ ([0-9]+)/([0-9]+) ]] && [ "${BASH_REMATCH[1]}" = "${BASH_REMATCH[2]}" ]; then
    echo "✓ $(basename "$f"): ${result#WYNIK: }"
  else
    echo "✗ $(basename "$f"): ${result:-przerwany}"
    grep -E '^BŁĄD|Error|waiting for' "$log" | head -5 | sed 's/^/    /'
    failed+=("$f")
  fi
done
echo
if [ ${#failed[@]} -eq 0 ]; then echo "Wszystkie testy w przeglądarce przeszły."; else echo "Nie przeszło: ${#failed[@]} (logi w $OUT)."; exit 1; fi
