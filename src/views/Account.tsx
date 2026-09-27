import { useEffect, useState } from 'react'
import { ALBATROS_ALIAS, IS_PLATFORM_HOST } from '../config'
import {
  accountError, changePassword, createAccount, loadUsage, LOGIN_PATTERN, saveProfile, signInAccount, useAccount, type Account,
  type AccountProfile, type TournamentUsage,
} from '../store/accounts'
import { PlatformNav, Wordmark } from './Platform'
import {
  FREE_VIEWS_PER_DAY, PACKAGES, firebaseCostPln, formatPln, freeUsedPercent, pricePln, READS_PER_VIEW,
} from '../logic/usage'

/** Address of one of the account's tournaments (Albatros CUP is "main" in the database). */
function tournamentLink(id: string, hash = ''): string {
  const t = id === 'main' ? (IS_PLATFORM_HOST ? ALBATROS_ALIAS : '') : id
  return `${location.pathname}${t ? `?t=${t}` : ''}${hash}`
}

/**
 * The organiser's pages. Signed out: signing in (#konto, #moje-turnieje) or up (#rejestracja)
 * next to a short pitch. Signed in: "Moje turnieje" (#moje-turnieje) or the account's
 * details and password (#konto).
 */
export function AccountPage({ view }: { view: 'konto' | 'rejestracja' | 'moje-turnieje' | 'kredyty' }) {
  const register = view === 'rejestracja'
  const account = useAccount()
  return (
    <div className="pf-page">
      <PlatformNav />
      <main className="pf-wrap pf-main">
        {account.status === 'unavailable' && <p className="notice-inline">Konta działają tylko na stronie z bazą danych.</p>}
        {account.status === 'loading' && <p className="muted">Wczytuję…</p>}
        {account.status === 'signed-out' && (
          <div className="auth-grid">
            <aside className="auth-pitch">
              <Wordmark size="lg" />
              <h1>Twoje turnieje w jednym miejscu</h1>
              <ul className="ab-checks">
                <li>Zakładasz turniej w kilka minut</li>
                <li>Panel organizatora jednym kliknięciem, bez PIN-u</li>
                <li>Wyniki na żywo dla kibiców, w każdej dyscyplinie</li>
              </ul>
            </aside>
            <SignIn key={register ? 'new' : 'in'} initial={register ? 'new' : 'in'} />
          </div>
        )}
        {account.status === 'signed-in' && (view === 'konto'
          ? <Profile key={`${account.account.uid}-${account.account.loaded ? 1 : 0}`} account={account.account} />
          : view === 'kredyty' ? <Credits account={account.account} />
          : <MyTournaments account={account.account} />)}
      </main>
    </div>
  )
}

function SignIn({ initial }: { initial: 'in' | 'new' }) {
  const [mode, setMode] = useState<'in' | 'new'>(initial)
  const [login, setLogin] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const creating = mode === 'new'
  const loginOk = login.includes('@') || LOGIN_PATTERN.test(login.trim().toLowerCase())
  const ready = loginOk && password.length >= 6 && (!creating || password === password2)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    setError('')
    try {
      if (creating) await createAccount(login, password, name.trim())
      else await signInAccount(login, password)
      location.hash = 'moje-turnieje'
    } catch (err) {
      setError(accountError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="panel account-form" onSubmit={submit}>
      <h2>{creating ? 'Załóż konto' : 'Zaloguj się'}</h2>
      <div className="seg" role="tablist">
        <button type="button" role="tab" aria-selected={!creating} className={!creating ? 'on' : ''} onClick={() => { setMode('in'); location.hash = 'konto' }}>Mam konto</button>
        <button type="button" role="tab" aria-selected={creating} className={creating ? 'on' : ''} onClick={() => { setMode('new'); location.hash = 'rejestracja' }}>Nowe konto</button>
      </div>
      <label>Login
        <input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" autoCapitalize="none" placeholder="np. optymielno" />
        {creating && <span className="muted small">Małe litery, cyfry, kropka lub myślnik (3–30 znaków). Może być też adres e-mail.</span>}
      </label>
      {creating && (
        <label>Nazwa klubu lub organizatora
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="np. UKS Opty Mielno" />
        </label>
      )}
      <label>Hasło
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={creating ? 'new-password' : 'current-password'} />
        {creating && <span className="muted small">Co najmniej 6 znaków.</span>}
      </label>
      {creating && (
        <label>Powtórz hasło
          <input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" />
          {password2 && password !== password2 && <span className="error small">Hasła się różnią.</span>}
        </label>
      )}
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primary btn-lg" type="submit" disabled={!ready || busy}>
        {busy ? 'Chwileczkę…' : creating ? 'Załóż konto' : 'Zaloguj się'}
      </button>
    </form>
  )
}

function MyTournaments({ account }: { account: Account }) {
  const usage = useUsage(account)
  return (
    <>
      <header className="acc-head">
        <div>
          <p className="eyebrow">Moje turnieje</p>
          <h1>{account.name || account.login}</h1>
          <span className="muted">Login: {account.login} · <a href="#konto">Dane konta i hasło</a></span>
        </div>
        <a className="btn btn-primary btn-lg" href="#nowy-turniej">+ Załóż nowy turniej</a>
      </header>
      <UsageSummary account={account} usage={usage} />
      <section className="account-list">
        <h2>Moje turnieje</h2>
        {account.tournaments.length === 0 && (
          <p className="muted">Nie masz jeszcze turniejów. Załóż pierwszy, zapisze się na tym koncie.</p>
        )}
        <div className="acc-grid">
          {account.tournaments.map((t) => (
            <article key={t.id} className="panel account-t">
              <h3>{t.name}</h3>
              <div className="actions">
                <a className="btn btn-primary" href={tournamentLink(t.id, '#panel')}>Panel organizatora</a>
                <a className="btn" href={tournamentLink(t.id)}>Strona dla kibiców</a>
              </div>
              <p className="muted small">PIN sędziego głównego: <b>{t.pin}</b>. Po wejściu z tego konta nie trzeba go wpisywać.</p>
              {usage && <TournamentChart usage={usage[t.id]} />}
            </article>
          ))}
        </div>
      </section>
    </>
  )
}

const PROFILE_FIELDS: { key: Exclude<keyof AccountProfile, 'name' | 'about'>; label: string; type?: string; placeholder?: string }[] = [
  { key: 'contactName', label: 'Osoba kontaktowa', placeholder: 'np. Krzysztof Rywak' },
  { key: 'phone', label: 'Telefon', type: 'tel', placeholder: 'np. 600 100 200' },
  { key: 'email', label: 'E-mail kontaktowy', type: 'email', placeholder: 'np. klub@example.pl' },
  { key: 'city', label: 'Miejscowość', placeholder: 'np. Mielno' },
  { key: 'website', label: 'Strona internetowa', type: 'url', placeholder: 'np. https://klub.pl' },
]

/** "Moje konto": the account's details (all but the name optional) and its password. */
function Profile({ account }: { account: Account }) {
  const [form, setForm] = useState<AccountProfile>({
    name: account.name ?? '', contactName: account.contactName ?? '', phone: account.phone ?? '',
    email: account.email ?? '', city: account.city ?? '', website: account.website ?? '', about: account.about ?? '',
  })
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (key: keyof AccountProfile, value: string) => { setForm((f) => ({ ...f, [key]: value })); setMsg('') }
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await saveProfile({ ...form, name: form.name.trim() })
      setMsg('Zapisano.')
    } catch {
      setMsg('Nie udało się zapisać. Sprawdź internet.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <header className="acc-head">
        <div>
          <p className="eyebrow">Moje konto</p>
          <h1>{account.name || account.login}</h1>
          <span className="muted">Login: <b>{account.login}</b> · <a href="#moje-turnieje">Moje turnieje ({account.tournaments.length})</a></span>
        </div>
      </header>
      <div className="acc-cols">
        <form className="panel acc-form" onSubmit={save}>
          <h2>Dane konta</h2>
          <p className="muted small">Widoczne tylko dla Ciebie. Wypełnij, co chcesz, poza nazwą wszystko jest nieobowiązkowe.</p>
          <label>Nazwa klubu lub organizatora
            <input value={form.name} onChange={(e) => set('name', e.target.value)} required />
          </label>
          <div className="acc-form-grid">
            {PROFILE_FIELDS.map((f) => (
              <label key={f.key}>{f.label}
                <input type={f.type ?? 'text'} value={form[f.key] ?? ''} placeholder={f.placeholder}
                  onChange={(e) => set(f.key, e.target.value)} />
              </label>
            ))}
          </div>
          <label>O klubie / notatki
            <textarea rows={3} value={form.about ?? ''} onChange={(e) => set('about', e.target.value)} />
          </label>
          <div className="actions">
            <button className="btn btn-primary" type="submit" disabled={busy || !form.name.trim()}>{busy ? 'Zapisuję…' : 'Zapisz dane'}</button>
            {msg && <span className={msg === 'Zapisano.' ? 'ok' : 'error'}>{msg}</span>}
          </div>
        </form>
        <ChangePassword />
      </div>
    </>
  )
}

/** Change the account's password: the current one, then the new one twice. */
function ChangePassword() {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [next2, setNext2] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const ready = current.length > 0 && next.length >= 6 && next === next2 && next !== current

  if (!open) {
    return (
      <section className="panel account-pass">
        <h2>Hasło do konta</h2>
        <p className="muted small">Hasło, którym logujesz się na konto SportLiveArena. To nie jest PIN turnieju: PIN zmienisz w panelu organizatora turnieju.</p>
        <button className="btn" onClick={() => { setOpen(true); setMsg(null) }}>Zmień hasło do konta</button>
        {msg?.ok && <p className="ok">{msg.text}</p>}
      </section>
    )
  }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    try {
      await changePassword(current, next)
      setCurrent(''); setNext(''); setNext2('')
      setOpen(false)
      setMsg({ ok: true, text: 'Hasło zmienione. Od teraz loguj się nowym hasłem.' })
    } catch (err) {
      const code = (err as { code?: string }).code
      setMsg({ ok: false, text: code === 'auth/invalid-credential' || code === 'auth/wrong-password' ? 'Obecne hasło jest nieprawidłowe.' : accountError(err) })
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="panel account-form account-pass" onSubmit={submit}>
      <h2>Zmień hasło do konta</h2>
      <label>Obecne hasło
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
      </label>
      <label>Nowe hasło
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        <span className="muted small">Co najmniej 6 znaków.</span>
      </label>
      <label>Powtórz nowe hasło
        <input type="password" value={next2} onChange={(e) => setNext2(e.target.value)} autoComplete="new-password" />
        {next2 && next !== next2 && <span className="error small">Hasła się różnią.</span>}
      </label>
      {msg && !msg.ok && <p className="error">{msg.text}</p>}
      <div className="actions">
        <button className="btn btn-primary" type="submit" disabled={!ready || busy}>{busy ? 'Zapisuję…' : 'Zapisz nowe hasło'}</button>
        <button className="btn" type="button" onClick={() => setOpen(false)}>Anuluj</button>
      </div>
    </form>
  )
}

/** Visits of the account's tournaments, read once when the page opens (and on "Odśwież"). */
function useUsage(account: Account): Record<string, TournamentUsage> | null {
  const [usage, setUsage] = useState<Record<string, TournamentUsage> | null>(null)
  const ids = account.tournaments.map((t) => t.id).join(',')
  useEffect(() => {
    let live = true
    loadUsage(ids ? ids.split(',') : []).then((u) => { if (live) setUsage(u) })
    return () => { live = false }
  }, [ids])
  return usage
}

/** Today's visits against the free daily allowance, and the account's credits. */
function UsageSummary({ account, usage }: { account: Account; usage: Record<string, TournamentUsage> | null }) {
  const today = usage ? Object.values(usage).reduce((n, u) => n + u.today, 0) : 0
  const pct = freeUsedPercent(today)
  const over = Math.max(0, today - FREE_VIEWS_PER_DAY)
  const credits = account.credits ?? 0
  const level = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok'
  return (
    <section className="usage">
      <div className="panel usage-card">
        <p className="eyebrow">Zużycie dzisiaj</p>
        <div className="usage-big"><b>{usage ? `${pct}%` : '…'}</b><span className="muted">darmowego limitu</span></div>
        <div className={`usage-bar ${level}`} role="progressbar" aria-valuenow={Math.min(pct, 100)} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
        <p className="muted small">
          {today.toLocaleString('pl-PL')} z {FREE_VIEWS_PER_DAY.toLocaleString('pl-PL')} darmowych wejść kibiców na dziś.
          {over > 0 && <> Ponad limit: <b>{over.toLocaleString('pl-PL')}</b> wejść (z kredytów).</>} Limit odnawia się o północy.
        </p>
      </div>
      <div className="panel usage-card">
        <p className="eyebrow">Kredyty</p>
        <div className="usage-big"><b>{credits.toLocaleString('pl-PL')}</b><span className="muted">wejść na zapas</span></div>
        <p className="muted small">Używane dopiero po wyczerpaniu dziennego darmowego limitu. Nie przepadają.</p>
        <a className="btn btn-primary" href="#kredyty">Doładuj kredyty</a>
      </div>
      <div className="panel usage-card">
        <p className="eyebrow">Szacunkowy koszt dzisiaj</p>
        <div className="usage-big"><b>{formatPln(pricePln(over))}</b><span className="muted">za wejścia ponad limit</span></div>
        <p className="muted small">
          Koszt bazy Google Firebase za dzisiejszy ruch: ok. {formatPln(firebaseCostPln(today))}
          {' '}(ok. {READS_PER_VIEW} odczytów bazy na jedno wejście).
        </p>
      </div>
    </section>
  )
}

/** Visits per day for the last week, as small bars. */
function TournamentChart({ usage }: { usage: TournamentUsage | undefined }) {
  if (!usage || usage.days.length === 0) return <p className="muted small">Wejścia: jeszcze nikt nie otwierał strony turnieju.</p>
  const days = [...usage.days].reverse()
  const max = Math.max(...days.map((d) => d.views), 1)
  return (
    <div className="t-usage">
      <p className="small"><b>Dziś: {usage.today.toLocaleString('pl-PL')} wejść</b> · {freeUsedPercent(usage.today)}% dziennego limitu</p>
      <div className="t-bars" aria-label="Wejścia w ostatnich dniach">
        {days.map((d) => (
          <div key={d.day} className="t-bar" title={`${d.day}: ${d.views} wejść`}>
            <span style={{ height: `${Math.max(4, d.views * 100 / max)}%` }} />
            <small>{d.day.slice(8)}.{d.day.slice(5, 7)}</small>
          </div>
        ))}
      </div>
    </div>
  )
}

/** "Kredyty" (#kredyty): balance, packages and a cost calculator. Online payment comes next. */
export function Credits({ account }: { account: Account }) {
  const [views, setViews] = useState(3000)
  const [days, setDays] = useState(2)
  const perDayOver = Math.max(0, views - FREE_VIEWS_PER_DAY)
  const total = perDayOver * days
  return (
    <>
      <header className="acc-head">
        <div>
          <p className="eyebrow">Kredyty</p>
          <h1>Masz {(account.credits ?? 0).toLocaleString('pl-PL')} wejść na zapas</h1>
          <span className="muted">Każdego dnia pierwsze {FREE_VIEWS_PER_DAY.toLocaleString('pl-PL')} wejść kibiców jest za darmo. Kredyty pokrywają ruch ponad ten limit.</span>
        </div>
      </header>
      <section className="credit-packs">
        {PACKAGES.map((p, i) => (
          <article key={p.views} className={`panel credit-pack ${i === 1 ? 'popular' : ''}`}>
            {i === 1 && <span className="credit-badge">Najczęściej wybierany</span>}
            <h3>{p.views.toLocaleString('pl-PL')} wejść</h3>
            <p className="credit-price">{p.pln} zł</p>
            <p className="muted small">{(p.pln * 1000 / p.views).toFixed(2).replace('.', ',')} zł za 1000 wejść</p>
            <button className="btn btn-primary" disabled title="Płatności online wkrótce">Doładuj</button>
          </article>
        ))}
      </section>
      <p className="notice-inline">
        Płatności online (BLIK, karta) uruchomimy wkrótce. Do tego czasu kredyty doładowuje administrator serwisu po
        przelewie.
      </p>
      <section className="panel credit-calc">
        <h2>Ile to będzie kosztować?</h2>
        <div className="form-row">
          <label>Wejść kibiców dziennie
            <input type="number" min={0} step={500} value={views} onChange={(e) => setViews(Math.max(0, Number(e.target.value) || 0))} />
          </label>
          <label>Dni turnieju
            <input type="number" min={1} max={30} value={days} onChange={(e) => setDays(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} />
          </label>
        </div>
        <p>
          Ponad darmowy limit: <b>{total.toLocaleString('pl-PL')}</b> wejść → szacunkowo <b>{formatPln(pricePln(total))}</b>.
          {total === 0 && ' Taki turniej mieści się w darmowym limicie.'}
        </p>
        <p className="muted small">
          Dla porównania: turniej na 60 drużyn z rodzicami to zwykle 2–5 tys. wejść dziennie. Koszt bazy Google za ten
          ruch: ok. {formatPln(firebaseCostPln(views * days))}.
        </p>
      </section>
    </>
  )
}
