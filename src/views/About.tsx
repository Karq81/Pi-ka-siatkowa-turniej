import type { ReactNode } from 'react'
import logo from '../assets/logo-opty-mielno.png'
import { tournamentUrl } from '../config'
import { useStore } from '../store/store'

/**
 * "O systemie" — a presentation page for SiatkaLive aimed at other organisers, laid out like a
 * product landing page: hero with a phone preview, formats, the problem it solves, three steps,
 * real numbers from Albatros CUP, features, costs, opinions and a call to action.
 * Only true facts go here: no invented statistics, prices or quotes.
 */
export function About() {
  const state = useStore()
  const teams = state.teams.length || 58
  const courts = state.tournament.courts || 9
  const matches = state.matches.length || 159
  const live = `${tournamentUrl()}#na-zywo`

  return (
    <div className="ab">
      <header className="ab-hero">
        <div className="ab-wrap ab-hero-grid">
          <div>
            <p className="ab-badge">Dla organizatorów turniejów siatkówki</p>
            <h1>
              Twój turniej na żywo w telefonie <span>każdego rodzica i trenera.</span>
            </h1>
            <p className="ab-lead">
              SiatkaLive to strona z grupami, terminarzem, tabelami i wynikami, które sędziowie wpisują prosto z boiska.
              Kibice widzą wszystko od razu, bez instalowania aplikacji i bez zakładania kont.
            </p>
            <ul className="ab-checks">
              <li>Działa w przeglądarce, wystarczy link lub kod QR</li>
              <li>Wynik na stronie kilka sekund po ostatniej piłce</li>
            </ul>
            <div className="ab-cta">
              <a className="ab-btn primary" href="#nowy-turniej">Załóż turniej za darmo</a>
              <a className="ab-btn ghost" href={live}>Zobacz turniej na żywo</a>
            </div>
          </div>
          <PhonePreview />
        </div>
      </header>

      <section className="ab-sec">
        <div className="ab-wrap">
          <h2>Dla każdego formatu</h2>
          <p className="ab-sub">Od jednodniowego turnieju po weekendowy festiwal na kilkunastu boiskach.</p>
          <div className="ab-grid3">
            <Card icon="🏐" title="Mini siatkówka">
              Dwójki, trójki i czwórki, sety do 15 lub 25 punktów, dowolna liczba boisk.
            </Card>
            <Card icon="⚡" title="Turniej weekendowy">
              Faza grupowa, drugi etap i finały. Terminarz sam przesuwa się, gdy mecze trwają dłużej.
            </Card>
            <Card icon="🏆" title="Kilka kategorii naraz">
              Osobne grupy, tabele i boiska dla każdej kategorii, a kibic filtruje tylko swoje drużyny.
            </Card>
          </div>
        </div>
      </section>

      <section className="ab-sec alt">
        <div className="ab-wrap">
          <h2>Wyniki na kartce, tabela w Excelu, pytania na WhatsAppie?</h2>
          <p className="ab-sub">Tak wygląda większość turniejów młodzieżowych. I to kosztuje.</p>
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

      <section className="ab-sec">
        <div className="ab-wrap">
          <h2>Od listy drużyn do turnieju na żywo</h2>
          <div className="ab-steps">
            <Step n={1} title="Wpisz drużyny i grupy">
              Kategorie, grupy i boiska ustawiasz w panelu organizatora. Terminarz układa się sam.
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

      <section className="ab-stats">
        <div className="ab-wrap">
          <h2>Pierwszy sprawdzian: Albatros CUP 2026</h2>
          <p className="ab-sub">Turniej mini siatkówki dziewcząt, Mielno, 23–25 października 2026.</p>
          <div className="ab-grid4">
            <Stat value={teams} label="drużyn" />
            <Stat value={courts} label="boisk jednocześnie" />
            <Stat value={matches} label="meczów w grupach" />
            <Stat value="2" label="kategorie: dwójki i trójki" />
          </div>
        </div>
      </section>

      <section className="ab-sec">
        <div className="ab-wrap">
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
            <Card icon="🍽️" title="Informacje dla drużyn">
              Program, posiłki, zakwaterowanie i opłaty w jednym miejscu, obok wyników.
            </Card>
          </div>
        </div>
      </section>

      <section className="ab-sec alt">
        <div className="ab-wrap">
          <h2>Ile to kosztuje?</h2>
          <p className="ab-sub">
            Strona działa na darmowych planach Vercel i Google Firebase. Turniej wielkości Albatros CUP mieści się w
            dziennych limitach, a przy większym ruchu płaci się tylko za faktyczne zużycie, zwykle kilka złotych za
            weekend.
          </p>
        </div>
      </section>

      <section className="ab-sec" id="opinie">
        <div className="ab-wrap">
          <h2>Opinie organizatorów i kibiców</h2>
          <p className="ab-sub">Pierwsze opinie zbierzemy po Albatros CUP 2026. Tu pojawią się ich słowa.</p>
        </div>
      </section>

      <section className="ab-final">
        <div className="ab-wrap ab-final-inner">
          <img src={logo} alt="UKS Opty Mielno" width={72} height={74} />
          <div>
            <h2>Stworzone w Mielnie, dla klubów siatkarskich</h2>
            <p>
              SiatkaLive powstał na potrzeby turnieju Albatros CUP organizowanego przez UKS Opty Mielno. Chcesz
              takiej strony dla swojego turnieju? Załóż go w kilka minut, za darmo.
            </p>
            <div className="ab-cta">
              <a className="ab-btn primary" href="#nowy-turniej">Załóż turniej</a>
              <a className="ab-btn ghost" href={live}>Zobacz turniej na żywo</a>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

/** A still picture of the live board in a phone frame; it shows what fans see, not real data. */
function PhonePreview() {
  return (
    <div className="ab-phone" aria-label="Przykład ekranu dla kibiców">
      <div className="ab-phone-screen">
        <p className="ab-ph-title">Albatros CUP · Na żywo</p>
        <div className="ab-ph-card">
          <p className="ab-ph-top"><span className="ab-live">● NA ŻYWO</span> Boisko 3 · Grupa 3</p>
          <div className="ab-ph-row"><span>Drużyna A</span><b>12</b></div>
          <div className="ab-ph-row"><span>Drużyna B</span><b>9</b></div>
        </div>
        <div className="ab-ph-card">
          <p className="ab-ph-top">Boisko 5 · następny mecz</p>
          <p className="ab-ph-soon">Zaczyna się za 4 min</p>
        </div>
        <div className="ab-ph-table">
          <p className="ab-ph-top">Tabela · Grupa 3</p>
          {['Drużyna A', 'Drużyna B', 'Drużyna C'].map((t, i) => (
            <div className="ab-ph-row" key={t}><span>{i + 1}. {t}</span><b>{6 - 2 * i} pkt</b></div>
          ))}
        </div>
      </div>
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

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="ab-stat">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  )
}
