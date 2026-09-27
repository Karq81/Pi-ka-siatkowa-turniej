import { useEffect, useState, type ReactNode } from 'react'
import { BRAND } from '../config'
import { SPORTS } from '../logic/sports'
import { countSiteVisit, useAccount } from '../store/accounts'
import { Demo } from './Demo'
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
            <p className="ab-badge"><span className="ab-dot" /> Z asystentem AI · dowolny sport · za darmo</p>
            <h1>
              Napisz, jaki turniej chcesz. <span>Resztę zrobimy za Ciebie.</span>
            </h1>
            <p className="ab-lead">
              Nie musisz znać żadnego programu. Opisz turniej swoimi słowami albo przepisz go z kartki, a asystent AI
              ułoży drużyny, grupy i terminarz. Kibice oglądają wyniki na żywo w telefonie.
            </p>
            <ul className="ab-checks">
              <li>Piszesz po swojemu, bez formularzy i tabelek</li>
              <li>Pełna kontrola: każdą rzecz zmienisz sam</li>
              <li>{disciplines.length} dyscyplin z gotowymi zasadami, a do tego dowolna inna</li>
            </ul>
            <div className="ab-cta">
              <a className="ab-btn primary" href={start}>Załóż turniej za darmo</a>
              <a className="ab-btn light" href="#jak-to-dziala">▶ Zobacz, jak to działa</a>
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

      <section className="ab-sec" id="jak-to-dziala">
        <div className="pf-wrap">
          <h2>Zobacz, jak to działa</h2>
          <p className="ab-sub">Od pomysłu do turnieju na żywo w kilka minut. Bez szkoleń i bez instrukcji.</p>
          <Demo />
        </div>
      </section>

      <section className="ab-sec alt">
        <div className="pf-wrap">
          <h2>Napisz, co chcesz i jak chcesz</h2>
          <p className="ab-sub">
            Asystent AI rozumie zwykły język. Wystarczy, że odpowiesz mu na trzy pytania, w dowolnej kolejności i
            dowolnymi słowami.
          </p>
          <div className="ab-talk">
            <div className="ab-grid3">
              <Card icon="📅" title="Co to za turniej?">
                Dyscyplina, dzień, godzina startu i ile masz boisk, kortów albo stołów.
              </Card>
              <Card icon="👥" title="Kto gra?">
                Lista drużyn albo zawodników. Wklej ją z kartki, maila, Excela czy WhatsAppa.
              </Card>
              <Card icon="🧩" title="Jak ma wyglądać?">
                Grupy, kategorie wiekowe, ile trwa mecz, do ilu się gra. Nie wiesz? Asystent zaproponuje.
              </Card>
            </div>
            <figure className="ab-note">
              <figcaption>Na przykład tak:</figcaption>
              <blockquote>
                „Sobota od 9:00, siatkówka dziewcząt, 3 boiska, jeden set do 25. Młodziczki: Orzeł, Fala, Sokół, Iskra.
                Kadetki: Orzeł, Fala, Wicher, Kometa, Sokół, podzielić na dwie grupy.”
              </blockquote>
              <p>
                To wszystko. Asystent przepisze drużyny, ułoży grupy i terminarz, a na koniec powie, czego mu
                zabrakło. <b>Nie musisz pisać ładnie. Wystarczy, że wiesz, czego chcesz.</b>
              </p>
            </figure>
          </div>
        </div>
      </section>

      <section className="ab-sec">
        <div className="pf-wrap">
          <h2>Co dostajesz</h2>
          <p className="ab-sub">Asystent przygotowuje, a Ty decydujesz. To wciąż Twój turniej.</p>
          <div className="ab-grid3">
            <Card icon="🎛️" title="Pełna kontrola">
              Drużyny, grupy, kategorie, boiska, godziny i zasady ustawiasz tak, jak lubisz. Asystent tylko podpowiada,
              ostatnie słowo zawsze należy do Ciebie.
            </Card>
            <Card icon="🏅" title="Każdy sport, każdy format">
              Siatkówka, piłka, tenis, padel, koszykówka, ping-pong i wiele innych, z gotową punktacją. Twojego sportu
              nie ma? Ustawisz własne zasady.
            </Card>
            <Card icon="📺" title="Wyniki na żywo">
              Kibic widzi, co gra teraz, jaki jest wynik i kiedy następny mecz. Tabele liczą się same.
            </Card>
            <Card icon="📱" title="Sędzia z telefonem">
              Każde boisko dostaje swój link. Sędzia wpisuje wynik dużymi przyciskami, a pomyłkę poprawia jednym
              kliknięciem.
            </Card>
            <Card icon="🔳" title="Link i kod QR">
              Jeden kod na plakacie w hali i jeden link na grupę rodziców. Nikt nic nie instaluje.
            </Card>
            <Card icon="👤" title="Wszystko w jednym miejscu">
              Twoje turnieje na koncie, gotowe do otwarcia jednym kliknięciem, razem z liczbą
              odwiedzin kibiców.
            </Card>
          </div>
        </div>
      </section>

      <section className="ab-sec alt">
        <div className="pf-wrap">
          <h2>Ile to kosztuje?</h2>
          <p className="ab-sub">
            Zaczynasz za darmo, razem z asystentem AI. Zwykły turniej mieści się w darmowym limicie odsłon. Dopiero przy
            bardzo dużej liczbie kibiców dokupujesz pakiet.
          </p>
        </div>
      </section>

      <section className="ab-sec">
        <div className="pf-wrap">
          <div className="ab-final-inner">
            <div>
              <h2>Masz pomysł na turniej? Napisz go.</h2>
              <p>Ty wiesz, jak ma wyglądać. My zrobimy z tego turniej na żywo.</p>
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
