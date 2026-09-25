import { store, useSession } from '../store/store'

const TILES = [
  { href: '#sedzia', title: 'Sędziowie boisk', text: 'Wybór boiska: liczenie punktów na żywo albo wpisanie wyniku z kartki. Wymaga klucza boiska.' },
  { href: '#admin', title: 'Sędzia główny', text: 'Wszystkie boiska, wpisywanie i poprawianie wyników, klucze boisk, drużyny, terminarz, drabinka, ustawienia.' },
  { href: '#kartki', title: 'Kartki z kodami QR', text: 'Do wydruku i przyklejenia przy boiskach: kod QR do panelu boiska i klucz.' },
  { href: '#tv', title: 'Tryb TV', text: 'Na telewizor lub rzutnik na hali: boiska, tabele i drabinki zmieniają się same.' },
]

/**
 * Organiser entry point (#panel). Not linked from the public pages, so parents and
 * coaches only ever see results; every tool here still asks for a key.
 */
export function Organizer() {
  const session = useSession()
  return (
    <div className="page">
      <header className="bar">
        <h1>Panel organizatora</h1>
      </header>
      <p className="muted">
        Ta strona jest tylko dla organizatorów i sędziów. Rodzicom i trenerom dajemy adres strony głównej
        (albo kod QR z niej), gdzie są same wyniki, bez możliwości wpisywania.
      </p>
      <ul className="organizer">
        {TILES.map((t) => (
          <li key={t.href}>
            <a href={t.href}>
              <b>{t.title}</b>
              <span className="muted small">{t.text}</span>
            </a>
          </li>
        ))}
      </ul>
      <p className="small">
        <a href="#">Strona dla kibiców (tylko wyniki) →</a>
      </p>
      {session && (
        <p className="muted small">
          Ten telefon jest zalogowany jako {session.role === 'admin' ? 'sędzia główny' : `sędzia boiska ${session.court}`}.{' '}
          <button className="linklike" onClick={() => store.logout()}>Wyloguj</button>
        </p>
      )}
    </div>
  )
}
