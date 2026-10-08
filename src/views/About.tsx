import { locale, t } from '../i18n'
import { useEffect, useState, type ReactNode } from 'react'
import { BRAND } from '../config'
import { SPORTS, sportName } from '../logic/sports'
import { countSiteVisit, useAccount } from '../store/accounts'
import { Demo } from './Demo'
import { StreamDemo } from './StreamDemo'
import { PlatformNav } from './Platform'
import contact from '../content/contact.json'

/**
 * The service's front page (sportlivearena.com, and #o-systemie elsewhere): a product
 * landing page for organisers. Only true facts: no invented statistics, prices or quotes.
 */
export function About() {
  const account = useAccount()
  const start = account.status === 'signed-in' ? '#nowy-turniej' : '#rejestracja'
  const disciplines = SPORTS.filter((s) => !s.custom)
  const visits = useSiteVisits()
  // A link to one part of the page (#transmisja from the organiser's guide) scrolls there.
  useEffect(() => {
    const id = location.hash.slice(1)
    if (id === 'transmisja') setTimeout(() => document.getElementById(id)?.scrollIntoView(), 50)
  }, [])

  return (
    <div className="ab">
      <PlatformNav />
      <header className="ab-hero">
        <div className="ab-hero-bg" aria-hidden="true" />
        <div className="pf-wrap ab-hero-grid">
          <div className="ab-hero-text">
            <p className="ab-badge"><span className="ab-dot" /> {t('Z asystentem AI · dowolny sport · za darmo')}</p>
            <h1>
              {t('Napisz, jaki turniej chcesz.')} <span>{t('Resztę zrobimy za Ciebie.')}</span>
            </h1>
            <p className="ab-lead">
              {t('Nie musisz znać żadnego programu. Opisz turniej swoimi słowami albo przepisz go z kartki, a asystent AI ułoży drużyny, grupy i terminarz. Kibice oglądają wyniki na żywo w telefonie.')}
            </p>
            <ul className="ab-checks">
              <li>{t('Piszesz po swojemu, bez formularzy i tabelek')}</li>
              <li>{t('Pełna kontrola: każdą rzecz zmienisz sam')}</li>
              <li>{t('{n} dyscyplin z gotowymi zasadami, a do tego dowolna inna', { n: disciplines.length })}</li>
              <li>{t('Transmisja na żywo z wynikiem na obrazie')} (<a href="#transmisja" onClick={(e) => { e.preventDefault(); document.getElementById('transmisja')?.scrollIntoView({ behavior: 'smooth' }) }}>{t('zobacz')}</a>)</li>
            </ul>
            <div className="ab-cta">
              <a className="ab-btn primary" href={start}>{t('Załóż turniej za darmo')}</a>
              <a className="ab-btn light" href="#jak-to-dziala">▶ {t('Zobacz, jak to działa')}</a>
            </div>
            <div className="ab-visits" aria-live="polite">
              <span className="ab-visits-icon" aria-hidden="true">👀</span>
              <span>
                <b>{visits === null ? '…' : visits.toLocaleString(locale())}</b>
                <small>{t('odwiedzin strony')}</small>
              </span>
            </div>
          </div>
          <HeroArt />
        </div>
      </header>

      <section className="ab-sports" aria-label="Dyscypliny">
        <div className="pf-wrap">
          <p className="ab-sports-title">{t('Gotowe wzorce turniejów')}</p>
          <ul className="ab-chips">
            {disciplines.map((s) => <li key={s.id}>{sportName(s)}</li>)}
            <li className="more">+ {t('dowolna inna dyscyplina')}</li>
          </ul>
        </div>
      </section>

      <section className="ab-sec" id="jak-to-dziala">
        <div className="pf-wrap">
          <h2>{t('Zobacz, jak to działa')}</h2>
          <p className="ab-sub">{t('Od pomysłu do turnieju na żywo w kilka minut. Bez szkoleń i bez instrukcji.')}</p>
          <Demo />
        </div>
      </section>

      <section className="ab-sec alt">
        <div className="pf-wrap">
          <h2>{t('Napisz, co chcesz i jak chcesz')}</h2>
          <p className="ab-sub">
            {t('Asystent AI rozumie zwykły język. Wystarczy, że odpowiesz mu na trzy pytania, w dowolnej kolejności i dowolnymi słowami.')}
          </p>
          <div className="ab-talk">
            <div className="ab-grid3">
              <Card icon="📅" title={t('Co to za turniej?')}>
                {t('Dyscyplina, dzień, godzina startu i ile masz boisk, kortów albo stołów.')}
              </Card>
              <Card icon="👥" title={t('Kto gra?')}>
                {t('Lista drużyn albo zawodników. Wklej ją z kartki, maila, Excela czy WhatsAppa.')}
              </Card>
              <Card icon="🧩" title={t('Jak ma wyglądać?')}>
                {t('Grupy, kategorie wiekowe, ile trwa mecz, do ilu się gra. Nie wiesz? Asystent zaproponuje.')}
              </Card>
            </div>
            <figure className="ab-note">
              <figcaption>{t('Na przykład tak:')}</figcaption>
              <blockquote>
                {t('„Sobota od 9:00, siatkówka dziewcząt, 3 boiska, jeden set do 25. Młodziczki: Orzeł, Fala, Sokół, Iskra. Kadetki: Orzeł, Fala, Wicher, Kometa, Sokół, podzielić na dwie grupy.”')}
              </blockquote>
              <p>
                {t('To wszystko. Asystent przepisze drużyny, ułoży grupy i terminarz, a na koniec powie, czego mu zabrakło.')}{' '}
                <b>{t('Nie musisz pisać ładnie. Wystarczy, że wiesz, czego chcesz.')}</b>
              </p>
            </figure>
          </div>
        </div>
      </section>

      <section className="ab-sec">
        <div className="pf-wrap">
          <h2>{t('Co dostajesz')}</h2>
          <p className="ab-sub">{t('Asystent przygotowuje, a Ty decydujesz. To wciąż Twój turniej.')}</p>
          <div className="ab-grid3">
            <Card icon="🎛️" title={t('Pełna kontrola')}>
              {t('Drużyny, grupy, kategorie, boiska, godziny i zasady ustawiasz tak, jak lubisz. Asystent tylko podpowiada, ostatnie słowo zawsze należy do Ciebie.')}
            </Card>
            <Card icon="🏅" title={t('Każdy sport, każdy format')}>
              {t('Siatkówka, piłka, tenis, padel, koszykówka, ping-pong i wiele innych, z gotową punktacją. Twojego sportu nie ma? Ustawisz własne zasady.')}
            </Card>
            <Card icon="📺" title={t('Wyniki na żywo')}>
              {t('Kibic widzi, co gra teraz, jaki jest wynik i kiedy następny mecz. Tabele liczą się same.')}
            </Card>
            <Card icon="📱" title={t('Sędzia z telefonem')}>
              {t('Każde boisko dostaje swój link. Sędzia wpisuje wynik dużymi przyciskami, a pomyłkę poprawia jednym kliknięciem.')}
            </Card>
            <Card icon="🔳" title={t('Link i kod QR')}>
              {t('Jeden kod na plakacie w hali i jeden link na grupę rodziców. Nikt nic nie instaluje.')}
            </Card>
            <Card icon="👤" title={t('Wszystko w jednym miejscu')}>
              {t('Twoje turnieje na koncie, gotowe do otwarcia jednym kliknięciem, razem z liczbą odwiedzin kibiców.')}
            </Card>
          </div>
        </div>
      </section>

      <section className="ab-sec alt" id="transmisja">
        <div className="pf-wrap">
          <h2>{t('Transmisja na żywo z wynikiem na obrazie')}</h2>
          <p className="ab-sub">
            {t('Postaw telefon na statywie i nadawaj mecz na YouTube albo Facebooku. Nasza aplikacja SportCast sama rysuje na obrazie tablicę wyników. Wynik bierze prosto od sędziego, więc operator kamery niczego nie klika.')}
          </p>
          <div className="ab-grid3 ab-stream-cards">
            <Card icon="🔳" title={t('Jeden kod od organizatora')}>
              {t('Organizator pokazuje kod QR w swoim panelu. Operator skanuje go telefonem w aplikacji i wybiera boisko. Bez wpisywania adresów i haseł.')}
            </Card>
            <Card icon="🏐" title={t('Wynik prosto od sędziego')}>
              {t('Sędzia liczy punkty na stronie jak zwykle. Po sekundzie ten sam wynik jest na obrazie: drużyny, sety i punkty. Po meczu aplikacja sama przechodzi do następnego.')}
            </Card>
            <Card icon="🔒" title={t('Tylko dla organizatora')}>
              {t('Kod widzi wyłącznie organizator. Kibice oglądają transmisję na stronie turnieju, obok wyników, i nic nie instalują.')}
            </Card>
          </div>
          <h3 className="ab-demo-title">▶ {t('Zobacz, jak to działa')}</h3>
          <StreamDemo />
          <p className="ab-note-small">
            {t('Aplikacja SportCast działa na telefonach z Androidem i jest w wersji testowej. Bez niej też nadasz mecz: z Facebooka albo YouTube. Instrukcja krok po kroku jest w panelu organizatora: Więcej → Transmisja wideo na żywo.')}
          </p>
        </div>
      </section>

      <section className="ab-sec">
        <div className="pf-wrap">
          <h2>{t('Ile to kosztuje?')}</h2>
          <p className="ab-sub">
            {t('Zaczynasz za darmo, razem z asystentem AI. Zwykły turniej mieści się w darmowym limicie odsłon. Dopiero przy bardzo dużej liczbie kibiców dokupujesz pakiet.')}
          </p>
        </div>
      </section>

      <section className="ab-sec">
        <div className="pf-wrap">
          <div className="ab-final-inner">
            <div>
              <h2>{t('Masz pomysł na turniej? Napisz go.')}</h2>
              <p>{t('Ty wiesz, jak ma wyglądać. My zrobimy z tego turniej na żywo.')}</p>
            </div>
            <a className="ab-btn primary" href={start}>{t('Załóż turniej za darmo')}</a>
          </div>
        </div>
      </section>

      <section className="ab-sec">
        <div className="pf-wrap">
          <h2>{t('Organizacja turniejów sportowych dla klubów i szkół')}</h2>
          <p className="ab-sub">{t('Strona turnieju dla Twojego klubu, wyniki na żywo dla rodziców i kibiców, panel dla sędziów. Wszystko w telefonie, bez instalowania aplikacji.')}</p>
        </div>
      </section>

      <footer className="ab-foot">
        <div className="pf-wrap">© {new Date().getFullYear()} {BRAND}{contact.email && <> · {t('Kontakt')}: <a href={`mailto:${contact.email}`}>{contact.email}</a></>}</div>
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
    <div className="ab-art" aria-label={t('Przykład ekranu dla kibiców')}>
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
          <p className="ab-ph-title">{t('Turniej')} · {t('Na żywo')}</p>
          <div className="ab-ph-card">
            <p className="ab-ph-top"><span className="ab-live">● {t('NA ŻYWO')}</span> {t('Boisko {n}', { n: 2 })} · {t('Grupa {letter}', { letter: 'A' })}</p>
            <div className="ab-ph-row"><span>{t('Orły')}</span><b>2</b></div>
            <div className="ab-ph-row"><span>{t('Sokoły')}</span><b>1</b></div>
          </div>
          <div className="ab-ph-card">
            <p className="ab-ph-top">{t('Kort {n}', { n: 1 })} · {t('następny mecz')}</p>
            <p className="ab-ph-soon">{t('Zaczyna się za {n} min', { n: 4 })}</p>
          </div>
          <div className="ab-ph-table">
            <p className="ab-ph-top">{t('Tabela')} · {t('Grupa {letter}', { letter: 'A' })}</p>
            {[t('Orły'), t('Sokoły'), t('Jastrzębie')].map((team, i) => (
              <div className="ab-ph-row" key={team}><span>{i + 1}. {team}</span><b>{t('{n} pkt', { n: 6 - 3 * i })}</b></div>
            ))}
          </div>
        </div>
      </div>
      <div className="ab-float f1"><span>🎾 {t('Padel')}</span><b>6:4 3:6 10:8</b></div>
      <div className="ab-float f2"><span>🏐 {t('Siatkówka')}</span><b>2:1</b></div>
      <div className="ab-float f3"><span>🏀 {t('Koszykówka')}</span><b>78:74</b></div>
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
