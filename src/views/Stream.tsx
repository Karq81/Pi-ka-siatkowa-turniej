import { useState } from 'react'
import { t } from '../i18n'
import { streamEmbed } from '../logic/stream'
import { store } from '../store/store'
import type { State } from '../types'
import { courtLabel } from '../ui'

/** The live video, 16:9, with a link to open it in the app when embedding is refused. */
export function StreamPlayer({ link, title }: { link?: string; title: string }) {
  const src = streamEmbed(link)
  if (!link || !src) return null
  return (
    <section className="stream">
      <h2><span className="stream-dot" aria-hidden="true" /> {title}</h2>
      <div className="stream-frame">
        <iframe src={src} title={title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen loading="lazy" />
      </div>
      <a className="muted small" href={link} target="_blank" rel="noreferrer">{t('Nie działa? Otwórz transmisję w aplikacji')} ›</a>
    </section>
  )
}

/**
 * Organiser: the links of the live video. Three steps, written for someone who has never
 * streamed: YouTube app → Create → Go live, copy the link, paste it here.
 */
export function StreamSettings({ state }: { state: State }) {
  const tour = state.tournament
  const [all, setAll] = useState(tour.stream ?? '')
  const [courts, setCourts] = useState<Record<string, string>>(tour.courtStreams ?? {})
  const [perCourt, setPerCourt] = useState(Object.values(tour.courtStreams ?? {}).some(Boolean))
  const [msg, setMsg] = useState('')
  const bad = [all, ...Object.values(courts)].some((l) => l.trim() && !streamEmbed(l))
  const save = () => {
    const courtStreams = Object.fromEntries(Object.entries(courts).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v))
    store.updateTournament({ stream: all.trim(), courtStreams })
    setMsg(t('Zapisano. Kibice widzą transmisję na stronie turnieju.'))
  }
  return (
    <section className="panel stream-settings">
      <h2>📺 {t('Transmisja wideo na żywo')}</h2>
      <p>{t('Możesz nadawać mecz na żywo z telefonu (Facebook albo YouTube) i pokazać obraz kibicom na stronie turnieju, obok wyników. Nie jest to obowiązkowe.')}</p>
      <StreamGuide />
      <p className="muted small">{t('Gdy transmisja już trwa: skopiuj jej link i wklej go poniżej.')}</p>
      <label>{t('Link do transmisji całego turnieju')}
        <input value={all} onChange={(e) => { setAll(e.target.value); setMsg('') }} placeholder="https://youtube.com/live/…" inputMode="url" />
      </label>
      <label className="check">
        <input type="checkbox" checked={perCourt} onChange={(e) => setPerCourt(e.target.checked)} /> {t('Osobna kamera na wybranych boiskach')}
      </label>
      {perCourt && (
        <div className="stream-courts">
          {Array.from({ length: tour.courts }, (_, i) => String(i + 1)).map((c) => (
            <label key={c}>{t('Boisko {n}', { n: courtLabel(Number(c)) })}
              <input value={courts[c] ?? ''} inputMode="url" placeholder="https://youtube.com/live/…"
                onChange={(e) => { setCourts((x) => ({ ...x, [c]: e.target.value })); setMsg('') }} />
            </label>
          ))}
        </div>
      )}
      {bad && <p className="error small">{t('Ten link nie wygląda na transmisję z YouTube, Facebooka ani Twitcha.')}</p>}
      <div className="actions">
        <button className="btn btn-primary" disabled={bad} onClick={save}>{t('Zapisz transmisję')}</button>
        {msg && <span className="ok">{msg}</span>}
      </div>
    </section>
  )
}

type Way = 'facebook' | 'youtube' | 'studio'

/**
 * "How do I stream a match?": step-by-step instructions for the three ways that work from a
 * phone, written for someone who has never streamed. The YouTube key (third way) stays on
 * this device: it only builds the QR code that sets up the Larix app.
 */
export function StreamGuide() {
  const [open, setOpen] = useState(false)
  const [way, setWay] = useState<Way>('facebook')
  const ways: [Way, string][] = [
    ['facebook', t('Facebook (najprościej)')],
    ['youtube', t('YouTube: kanał z 50+ subskrybentami')],
    ['studio', t('YouTube bez subskrybentów')],
  ]
  return (
    <>
      <button type="button" className="btn btn-primary btn-guide" onClick={() => setOpen(true)}>
        📖 {t('Jak nadawać mecz na żywo? Instrukcja krok po kroku')}
      </button>
      {open && (
        <div className="confirm-back" role="presentation" onClick={() => setOpen(false)}>
          <div className="guide-box" role="dialog" aria-modal="true" aria-label={t('Jak nadawać mecz na żywo?')} onClick={(e) => e.stopPropagation()}>
            <header>
              <h2>📺 {t('Jak nadawać mecz na żywo?')}</h2>
              <button type="button" className="linklike" aria-label={t('Zamknij')} onClick={() => setOpen(false)}>✕</button>
            </header>
            <p className="muted">{t('Wybierz, gdzie chcesz nadawać. Wystarczy telefon. Kibice zobaczą obraz na stronie turnieju, obok wyników.')}</p>
            <div className="seg guide-tabs" role="tablist">
              {ways.map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={way === id} className={way === id ? 'on' : ''} onClick={() => setWay(id)}>{label}</button>
              ))}
            </div>
            {way === 'facebook' && <FacebookSteps />}
            {way === 'youtube' && <YouTubeAppSteps />}
            {way === 'studio' && <StudioSteps />}
            <GoodTips />
            <button type="button" className="btn btn-lg" onClick={() => setOpen(false)}>{t('Zamknij instrukcję')}</button>
          </div>
        </div>
      )}
    </>
  )
}

function Steps({ items }: { items: string[] }) {
  return <ol className="guide-steps">{items.map((s) => <li key={s}>{s}</li>)}</ol>
}

function FacebookSteps() {
  return (
    <section>
      <p className="guide-lead">{t('Bez żadnych limitów i bez czekania. Potrzebne jest konto na Facebooku (Twoje albo strony klubu).')}</p>
      <Steps items={[
        t('Otwórz aplikację Facebook w telefonie.'),
        t('Na górze naciśnij „Co słychać?” (albo „Utwórz post”), a potem „Na żywo” (ikona kamery).'),
        t('Ustaw, kto może oglądać: „Publiczne”. Inaczej kibice nie zobaczą obrazu na naszej stronie.'),
        t('Obróć telefon poziomo, ustaw kamerę na boisko i naciśnij „Rozpocznij transmisję na żywo”.'),
        t('Gdy transmisja trwa, naciśnij „Udostępnij” → „Kopiuj link”.'),
        t('Wróć do tej strony, wklej link w pole „Link do transmisji całego turnieju” (albo przy boisku) i naciśnij „Zapisz transmisję”.'),
      ]} />
    </section>
  )
}

function YouTubeAppSteps() {
  return (
    <section>
      <p className="guide-lead">{t('Tylko gdy Twój kanał YouTube ma co najmniej 50 subskrybentów. Jeśli ma mniej, wybierz „YouTube bez subskrybentów”.')}</p>
      <Steps items={[
        t('Otwórz aplikację YouTube w telefonie i zaloguj się na swój kanał.'),
        t('Naciśnij „+” na dole ekranu, a potem „Transmisja na żywo”.'),
        t('Wpisz tytuł, np. nazwę turnieju i boiska. Widoczność: „Publiczny” albo „Niepubliczny” (niepubliczny też działa na naszej stronie, a nie pojawia się w wyszukiwarce).'),
        t('Na pytanie o treści dla dzieci wybierz „Nie, nie są przeznaczone dla dzieci”. Inaczej YouTube może nie pozwolić pokazać obrazu na naszej stronie.'),
        t('Obróć telefon poziomo i naciśnij „Rozpocznij transmisję”.'),
        t('Naciśnij „Udostępnij” → „Kopiuj link”, wróć tutaj, wklej link i naciśnij „Zapisz transmisję”.'),
      ]} />
    </section>
  )
}

function StudioSteps() {
  return (
    <section>
      <p className="guide-lead">{t('Działa przy 0 subskrybentów. YouTube stawia limit 50 tylko dla przycisku w swojej aplikacji; nadawanie „kluczem transmisji” go nie ma. Za pierwszym razem trzeba potwierdzić kanał i odczekać do 24 godzin, więc zrób część A dzień przed turniejem.')}</p>
      <h3>{t('A. Dzień przed turniejem (raz na zawsze)')}</h3>
      <Steps items={[
        t('Na komputerze wejdź na studio.youtube.com i zaloguj się na swój kanał.'),
        t('W prawym górnym rogu naciśnij „Utwórz” (kamera z plusem) → „Transmisja na żywo”.'),
        t('YouTube poprosi o potwierdzenie kanału: podaj numer telefonu i wpisz kod z SMS-a.'),
        t('Poczekaj, aż YouTube włączy transmisje (zwykle kilka minut, najdłużej 24 godziny).'),
        t('Zainstaluj w telefonie darmową aplikację „Larix Broadcaster” (Sklep Play albo App Store).'),
      ]} />
      <h3>{t('B. W dniu turnieju')}</h3>
      <Steps items={[
        t('Na komputerze otwórz studio.youtube.com → „Utwórz” → „Transmisja na żywo” → „Transmisja” (u góry po lewej).'),
        t('Wpisz tytuł. Widoczność: „Publiczny” albo „Niepubliczny”. Treści dla dzieci: „Nie”.'),
        t('Znajdź „Klucz transmisji” i naciśnij „Kopiuj”. Wklej go poniżej: strona pokaże kod QR dla aplikacji Larix.'),
        t('W telefonie otwórz aparat albo Larix i zeskanuj kod QR. Larix sam doda połączenie z YouTube.'),
        t('Obróć telefon poziomo, ustaw kamerę na boisko i w Larixie naciśnij duży czerwony przycisk. Po kilku sekundach obraz pojawi się w YouTube Studio.'),
        t('W YouTube Studio naciśnij „Udostępnij” (strzałka u góry) → skopiuj link. Wklej go na tej stronie w „Link do transmisji…” i naciśnij „Zapisz transmisję”.'),
      ]} />
      <LarixHelper />
    </section>
  )
}

/** The YouTube stream key → the Larix app's connection (QR code and link). Nothing is saved. */
function LarixHelper() {
  const [key, setKey] = useState('')
  const [qr, setQr] = useState('')
  const clean = key.trim().replace(/^rtmps?:\/\/[^ ]*\/live2\//, '')
  const url = `rtmp://a.rtmp.youtube.com/live2/${clean}`
  const larix = `larix://set/v1?conn[][url]=${encodeURIComponent(url)}&conn[][name]=${encodeURIComponent('YouTube')}`
  const valid = /^[\w-]{8,}$/.test(clean)
  const show = async () => {
    const QRCode = (await import('qrcode')).default
    setQr(await QRCode.toString(larix, { type: 'svg', margin: 1 }))
  }
  return (
    <div className="larix">
      <label>{t('Klucz transmisji z YouTube Studio')}
        <input value={key} onChange={(e) => { setKey(e.target.value); setQr('') }} placeholder="abcd-efgh-ijkl-mnop-qrst" autoComplete="off" />
      </label>
      <p className="muted small">{t('Klucz zostaje tylko na tym urządzeniu. Nie pokazuj go nikomu: kto go ma, może nadawać na Twoim kanale.')}</p>
      {valid && (
        <>
          <div className="actions">
            <button type="button" className="btn" onClick={() => void show()}>{t('Pokaż kod QR dla Larix')}</button>
            <a className="btn" href={larix}>{t('Otwórz w Larix (na telefonie)')}</a>
          </div>
          {qr && <div className="larix-qr" dangerouslySetInnerHTML={{ __html: qr }} />}
          <p className="muted small">
            {t('Gdy kod nie zadziała, dodaj połączenie ręcznie: Larix → koło zębate (Ustawienia) → „Connections” (Połączenia) → „+” → Name: YouTube, URL:')}{' '}
            <code className="larix-url">{url}</code> → {t('zapisz i zaznacz to połączenie.')}
          </p>
        </>
      )}
    </div>
  )
}

function GoodTips() {
  return (
    <section className="guide-tips">
      <h3>💡 {t('Dobre rady')}</h3>
      <ul>
        <li>{t('Postaw telefon na statywie albo oprzyj stabilnie, wysoko, z widokiem na całe boisko.')}</li>
        <li>{t('Podłącz ładowarkę albo powerbank: transmisja szybko zużywa baterię.')}</li>
        <li>{t('Najlepiej przez Wi-Fi hali. Na danych komórkowych godzina transmisji to ok. 1–2 GB.')}</li>
        <li>{t('Włącz w telefonie tryb „Nie przeszkadzać”, żeby telefon nie przerywał nadawania.')}</li>
        <li>{t('Filmujesz dzieci? Uprzedź rodziców i zapisz w regulaminie turnieju, że mecze są transmitowane (RODO).')}</li>
      </ul>
    </section>
  )
}
