import QRCode from 'qrcode'
import { useEffect, useState, type ReactNode } from 'react'
import logo from '../assets/logo-opty-mielno.png'
import { info } from '../content/info'
import { useStore } from '../store/store'
import { MyTeams } from './Competition'

/** The tournament banner with the logo and the section tabs, on top of every public page. */
export function InfoHero({ nav }: { nav: ReactNode }) {
  return (
    <header className="info-hero">
      <div className="info-hero-inner">
        <img className="info-logo" src={logo} alt={info.organizer} width={96} height={98} />
        <div>
          <p className="eyebrow">{info.edition}</p>
          <h1>{info.name}</h1>
          <p className="info-when">{info.dates} · Mielno</p>
        </div>
      </div>
      {nav}
    </header>
  )
}

/** Start page for families and teams: key facts, schedule, costs and a QR code to live results. */
export function Info() {
  const state = useStore()
  // Team counts follow the entered team list; the announcement's numbers are the fallback.
  const teamsIn = (name: string) => {
    const cat = state.categories.find((c) => c.name === name)
    const n = cat ? state.teams.filter((t) => t.categoryId === cat.id).length : 0
    return n || info.categories.find((c) => c.name === name)?.teams || 0
  }
  const resultsUrl = `${location.origin}${location.pathname}#grupy`
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    QRCode.toString(resultsUrl, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }).then(setQr)
  }, [resultsUrl])

  const copyAccount = () => {
    navigator.clipboard?.writeText(info.payment.account.replace(/\s/g, '')).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000) },
      () => {},
    )
  }

  return (
    <div className="info">
      {state.teams.length > 0 && <MyTeams state={state} />}

      <section className="info-facts" aria-label="Najważniejsze">
        <div className="fact">
          <span className="fact-label">Termin</span>
          <b>{info.datesShort}</b>
          <span className="muted small">piątek–niedziela</span>
        </div>
        <div className="fact">
          <span className="fact-label">Miejsce gier</span>
          <b>{info.venue.name}</b>
          <a href={info.venue.maps} target="_blank" rel="noreferrer" className="small">{info.venue.address} · mapa</a>
        </div>
        {info.categories.map((c) => (
          <div key={c.name} className="fact">
            <span className="fact-label">{c.name}</span>
            <b><span className="fact-num">{teamsIn(c.name)}</span> zespołów</b>
            <span className="muted small">{c.note}</span>
          </div>
        ))}
      </section>

      <section className="info-live">
        <div className="info-live-text">
          <h2>Grupy, mecze i wyniki</h2>
          <p>
            Grupy, kto z kim i o której gra, tabele i wyniki na żywo zobaczysz w telefonie, na bieżąco w trakcie
            turnieju. Zeskanuj kod albo kliknij przycisk.
          </p>
          <div className="actions">
            <a className="btn btn-primary btn-lg" href="#grupy">Grupy i terminarz</a>
            <a className="btn btn-lg" href="#na-zywo">Wyniki na żywo</a>
            <ShareLink />
          </div>

        </div>
        <div className="info-qr" aria-label="Kod QR do wyników" dangerouslySetInnerHTML={{ __html: qr }} />
      </section>

      <section>
        <h2>Program</h2>
        <div className="days">
          {info.days.map((d) => (
            <article key={d.day} className="day">
              <header><b>{d.day}</b><span>{d.date}</span></header>
              <ol>
                {d.items.map((it, i) => (
                  <li key={i} className={it.highlight ? 'hl' : ''}>
                    <span className="t">{it.time}</span>
                    <span>{it.text}</span>
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </div>
      </section>

      <div className="info-cols">
        <section className="panel">
          <h2>Zakwaterowanie</h2>
          <p><b>{info.hotel.name}</b></p>
          <p><a href={info.hotel.maps} target="_blank" rel="noreferrer">{info.hotel.address}</a></p>
          <p className="muted">Przyjazd {info.hotel.checkIn}.</p>
        </section>

        <section className="panel">
          <h2>Uczestnicy</h2>
          <ul className="plain">
            {info.categories.map((c) => (
              <li key={c.name}><b>{c.name}</b>: {teamsIn(c.name)} zespołów, {c.note}</li>
            ))}
          </ul>
          <p className="muted small">{info.reserves}</p>
        </section>
      </div>

      <section>
        <h2>Koszty i płatność</h2>
        <div className="prices">
          {info.prices.map((p) => (
            <div key={p.label} className="price">
              <span className="fact-label">{p.label}</span>
              <b>{p.price}</b>
              <span className="muted small">{p.per}: {p.includes}</span>
            </div>
          ))}
        </div>
        <div className="panel pay">
          <p>Przelew do <b>{info.payment.deadline}</b> ({info.payment.alt}):</p>
          <p className="account">
            <span id="account">{info.payment.account}</span>
            <button className="btn" onClick={copyAccount}>{copied ? 'Skopiowano' : 'Kopiuj numer'}</button>
          </p>
          <p className="muted small">Dane do faktury: <span className="select">{info.payment.invoiceEmail}</span></p>
        </div>
      </section>

      <section className="reminders">
        <h2>Pamiętajcie</h2>
        <ul className="plain">
          {info.reminders.map((r) => <li key={r}>{r}</li>)}
        </ul>
      </section>

      <p className="muted small info-org">Organizator: {info.organizer}</p>
    </div>
  )
}

/**
 * Share the fans' link through the phone's share sheet (WhatsApp, Messenger, SMS…).
 * Browsers without one copy the link instead.
 */
function ShareLink() {
  const url = `${location.origin}${location.pathname}`
  const text = `${info.name} ${info.datesShort}, Mielno – grupy, mecze i wyniki na żywo:`
  const [copied, setCopied] = useState(false)
  const share = () => {
    if (typeof navigator.share === 'function') {
      navigator.share({ title: info.name, text, url }).catch(() => {})
      return
    }
    navigator.clipboard?.writeText(url).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000) },
      () => {},
    )
  }
  return <button className="btn btn-lg btn-share" onClick={share}>{copied ? 'Skopiowano ✓' : 'Udostępnij link'}</button>
}
