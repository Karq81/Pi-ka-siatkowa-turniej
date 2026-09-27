import { useEffect, useState, type ReactNode } from 'react'
import { BRAND } from '../config'
import { SPORTS } from '../logic/sports'
import { countSiteVisit, useAccount } from '../store/accounts'
import { PlatformNav } from './Platform'

/**
 * The service's front page (sportlivearena.com, and #o-systemie elsewhere): a product
 * landing page for organisers. Only true facts: no invented statistics, prices or quotes.
 */
export function About() {
  const account = useAccount()
  const start = account.status === 'signed-in' ? '#nowy-turniej' : '#rejestracja'
  const disciplines = SPORTS.filter((s) => !s.custom)
  const visits = useSiteVisits()

  return (
    <div className="ab">
      <PlatformNav />
      <header className="ab-hero">
        <div className="ab-hero-bg" aria-hidden="true" />
        <div className="pf-wrap ab-hero-grid">
          <div className="ab-hero-text">
            <p className="ab-badge"><span className="ab-dot" /> Wyniki na żywo · dla organizatorów turniejów</p>
            <h1>
              Twój turniej na żywo <span>w telefonie każdego kibica.</span>
            </h1>
            <p className="ab-lead">
              {BRAND} to strona Twojego turnieju: grupy, terminarz, tabele i wyniki, które sędziowie wpisują prosto z
              boiska, kortu czy stołu. Kibice widzą wszystko od razu, bez instalowania aplikacji.
            </p>
            <ul className="ab-checks">
              <li>Działa w przeglądarce: wystarczy link lub kod QR</li>
              <li>Wynik na stronie kilka sekund po końcu meczu</li>
              <li>{disciplines.length} dyscyplin z gotowymi zasadami, a do tego dowolna inna</li>
            </ul>
            <div className="ab-cta">
              <a className="ab-btn primary" href={start}>Załóż turniej za darmo</a>
              <a className="ab-btn light" href="#jak-to-dziala">Jak to działa?</a>
            </div>
            <div className="ab-visits" aria-live="polite">
              <span className="ab-visits-icon" aria-hidden="true">👀</span>
              <span>
                <b>{visits === null ? '…' : visits.toLocaleString('pl-PL')}</b>
                <small>odwiedzin strony</small>
              </span>
            </div>
          </div>
          <HeroArt />
        </div>
      </header>

      <section className="ab-sports" aria-label="Dyscypliny">
        <div className="pf-wrap">
          <p className="ab-sports-title">Gotowe wzorce turniejów</p>
          <ul className="ab-chips">
            {disciplines.map((s) => <li key={s.id}>{s.label}</li>)}
            <li className="more">+ dowolna inna dyscyplina</li>
          </ul>
        </div>
      </section>

      <section className="ab-sec">
        <div className="pf-wrap">
          <h2>Dla każdego formatu</h2>
          <p className="ab-sub">Od jednodniowego turnieju po weekendowy festiwal na kilkunastu boiskach.</p>
          <div className="ab-grid3">
            <Card icon="🏅" title="Każda dyscyplina">
              Sety, gemy z tie-breakiem, bramki albo punkty. Gotowe zasady i punktacja tabeli dla każdego sportu.
            </Card>
            <Card icon="⚡" title="Turniej weekendowy">
              Faza grupowa, drugi etap i finały. Terminarz sam przesuwa się, gdy mecze trwają dłużej.
            </Card>
            <Card icon="🏆" title="Kilka kategorii naraz">
              Osobne grupy i tabele dla każdej kategorii wiekowej, a kibic śledzi tylko swoje drużyny.
            </Card>
          </div>
        </div>
      </section>

      <section className="ab-sec alt">
        <div className="pf-wrap">
          <h2>Wyniki na kartce, tabela w Excelu, pytania na WhatsAppie?</h2>
          <p className="ab-sub">Tak wygląda większość turniejów amatorskich i młodzieżowych. I to kosztuje.</p>
          <div className="ab-grid3">
            <Card icon="⏳" title="Organizator bez przerwy">
              Zamiast pilnować turnieju, przepisujesz wyniki i odpowiadasz, kto gra następny.
            </Card>
            <Card icon="📣" title="Kibice nie wiedzą, co się dzieje">
              Rodzice krążą między boiskami i tablicą ogłoszeń, żeby sprawdzić, kiedy gra ich dziecko.
            </Card>
            <Card icon="🪞" title="Słabszy wizerunek klubu">
              Profesjonalna oprawa przyciąga drużyny na kolejną edycję i pomaga w rozmowach ze sponsorami.
            </Card>
          </div>
        </div>
      </section>

      <section className="ab-sec" id="jak-to-dziala">
        <div className="pf-wrap">
          <h2>Od listy drużyn do turnieju na żywo</h2>
          <div className="ab-steps">
            <Step n={1} title="Załóż konto i turniej">
              Wybierasz dyscyplinę, liczbę boisk i kategorie. Wpisujesz drużyny, losujesz grupy, terminarz układa się sam.
            </Step>
            <Step n={2} title="Sędziowie wpisują wyniki">
              Każde boisko ma swój link i klucz. Sędzia wpisuje wynik w telefonie, pomyłkę poprawia jednym kliknięciem.
            </Step>
            <Step n={3} title="Turniej żyje">
              Tabele liczą się same, a kibice widzą, co gra teraz i o której zaczyna się kolejny mecz.
            </Step>
          </div>
        </div>
      </section>

      <section className="ab-sec alt">
        <div className="pf-wrap">
          <h2>Co dostajesz</h2>
          <div className="ab-grid3">
            <Card icon="📺" title="Na żywo">
              Wszystkie boiska na jednym ekranie: trwający mecz, wynik i odliczanie do kolejnego.
            </Card>
            <Card icon="⭐" title="Moje drużyny">
              Kibic zaznacza swoje drużyny, a ich mecze są wyróżnione w terminarzu i na boiskach.
            </Card>
            <Card icon="⏱️" title="Terminarz, który nadąża">
              Kolejny mecz zaczyna się 2 minuty po zakończeniu poprzedniego, a godziny przeliczają się same.
            </Card>
            <Card icon="📱" title="Panel sędziego">
              Duże przyciski, wpisywanie punktów z klawiatury, cofnięcie i korekta wyniku.
            </Card>
            <Card icon="🔳" title="Kod QR i udostępnianie">
              Jeden kod na plakacie w hali i link do wysłania rodzicom na grupę.
            </Card>
            <Card icon="👤" title="Konto organizatora">
              Wszystkie Twoje turnieje w jednym miejscu, wejście do panelu jednym kliknięciem.
            </Card>
          </div>
        </div>
      </section>

      <section className="ab-sec">
        <div className="pf-wrap">
          <h2>Ile to kosztuje?</h2>
          <p className="ab-sub">
            Na start za darmo. Strona działa na infrastrukturze Vercel i Google Firebase, a zwykły weekendowy turniej
            mieści się w darmowych limitach.
          </p>
        </div>
      </section>

      <section className="ab-final">
        <div className="pf-wrap">
          <div className="ab-final-inner">
            <div>
              <h2>Gotowy na swój turniej?</h2>
              <p>Załóż konto, wybierz dyscyplinę i po kilku minutach wyślij kibicom link.</p>
            </div>
            <a className="ab-btn primary" href={start}>Załóż turniej za darmo</a>
          </div>
        </div>
      </section>

      <footer className="ab-foot">
        <div className="pf-wrap">© {new Date().getFullYear()} {BRAND}</div>
      </footer>
    </div>
  )
}

/** Counts this visit once per page load and returns the total, or null when unknown. */
let visitCount: Promise<number | null> | null = null
function useSiteVisits(): number | null {
  const [visits, setVisits] = useState<number | null>(null)
  useEffect(() => {
    visitCount ??= countSiteVisit()
    let live = true
    visitCount.then((v) => { if (live) setVisits(v) })
    return () => { live = false }
  }, [])
  return visits
}

/**
 * Hero picture: a floodlit pitch, a phone with the live board, and floating results
 * from different sports. Example data only.
 */
function HeroArt() {
  return (
    <div className="ab-art" aria-label="Przykład ekranu dla kibiców">
      <svg className="ab-pitch" viewBox="0 0 400 260" aria-hidden="true">
        <defs>
          <linearGradient id="pitch-g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2f8f5b" />
            <stop offset="1" stopColor="#1f6b43" />
          </linearGradient>
        </defs>
        <rect x="10" y="10" width="380" height="240" rx="14" fill="url(#pitch-g)" />
        {Array.from({ length: 6 }, (_, i) => (
          <rect key={i} x={10 + i * 63.3} y="10" width="31.7" height="240" fill="#fff" opacity="0.05" />
        ))}
        <g fill="none" stroke="#fff" strokeWidth="2.5" opacity="0.85">
          <rect x="26" y="26" width="348" height="208" rx="4" />
          <line x1="200" y1="26" x2="200" y2="234" />
          <circle cx="200" cy="130" r="34" />
          <rect x="26" y="82" width="52" height="96" />
          <rect x="322" y="82" width="52" height="96" />
        </g>
        <circle cx="200" cy="130" r="4" fill="#fff" />
      </svg>
      <div className="ab-phone">
        <div className="ab-phone-screen">
          <p className="ab-ph-title">Turniej · Na żywo</p>
          <div className="ab-ph-card">
            <p className="ab-ph-top"><span className="ab-live">● NA ŻYWO</span> Boisko 2 · Grupa A</p>
            <div className="ab-ph-row"><span>Orły</span><b>2</b></div>
            <div className="ab-ph-row"><span>Sokoły</span><b>1</b></div>
          </div>
          <div className="ab-ph-card">
            <p className="ab-ph-top">Kort 1 · następny mecz</p>
            <p className="ab-ph-soon">Zaczyna się za 4 min</p>
          </div>
          <div className="ab-ph-table">
            <p className="ab-ph-top">Tabela · Grupa A</p>
            {['Orły', 'Sokoły', 'Jastrzębie'].map((t, i) => (
              <div className="ab-ph-row" key={t}><span>{i + 1}. {t}</span><b>{6 - 3 * i} pkt</b></div>
            ))}
          </div>
        </div>
      </div>
      <div className="ab-float f1"><span>🎾 Padel</span><b>6:4 3:6 10:8</b></div>
      <div className="ab-float f2"><span>🏐 Siatkówka</span><b>2:1</b></div>
      <div className="ab-float f3"><span>🏀 Koszykówka</span><b>78:74</b></div>
    </div>
  )
}

function Card({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <article className="ab-card">
      <span className="ab-icon" aria-hidden="true">{icon}</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </article>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="ab-step">
      <span className="ab-step-n">{n}</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  )
}
