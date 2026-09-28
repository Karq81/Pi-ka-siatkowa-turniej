import { ConfirmDialog, NumberField } from '../ui'
import { locale, t, tk } from '../i18n'
import { useEffect, useState } from 'react'
import { ALBATROS_ALIAS, IS_PLATFORM_HOST } from '../config'
import {
  accountError, changePassword, createAccount, deleteTournament, forgetTournament, loadUsage, loginProblem, normalizeLogin, saveProfile, signInAccount, useAccount, type Account,
  type AccountProfile, type AccountTournament, type TournamentUsage,
} from '../store/accounts'
import { PlatformNav, Wordmark } from './Platform'
import {
  FREE_VIEWS_PER_DAY, PACKAGES, firebaseCostPln, formatPln, freeUsedPercent, isTestAccount, pricePln, READS_PER_VIEW,
} from '../logic/usage'

/** Address of one of the account's tournaments (Albatros CUP is "main" in the database). */
function tournamentLink(id: string, hash = ''): string {
  const slug = id === 'main' ? (IS_PLATFORM_HOST ? ALBATROS_ALIAS : '') : id
  return `${location.pathname}${slug ? `?t=${slug}` : ''}${hash}`
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
        {account.status === 'unavailable' && <p className="notice-inline">{t('Konta działają tylko na stronie z bazą danych.')}</p>}
        {account.status === 'loading' && <p className="muted">{t('Wczytuję…')}</p>}
        {account.status === 'signed-out' && (
          <div className="auth-grid">
            <aside className="auth-pitch">
              <Wordmark size="lg" />
              <h1>{t('Twoje turnieje w jednym miejscu')}</h1>
              <ul className="ab-checks">
                <li>{t('Zakładasz turniej w kilka minut')}</li>
                <li>{t('Panel organizatora jednym kliknięciem, bez PIN-u')}</li>
                <li>{t('Wyniki na żywo dla kibiców, w każdej dyscyplinie')}</li>
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
  const [tried, setTried] = useState(false)
  const creating = mode === 'new'

  // What still stops the form, in plain words. Shown next to the field (in red) once the
  // user tried to send the form, instead of a grey button that says nothing.
  const lp = loginProblem(login)
  const loginMsg = lp === 'empty' ? t('Wpisz login.')
    : lp === 'short' ? t('Login jest za krótki: co najmniej 3 znaki.')
      : lp === 'long' ? t('Login jest za długi: najwyżej 30 znaków.')
        : lp === 'email' ? t('To nie wygląda na adres e-mail.')
          : lp === 'chars' ? t('W loginie mogą być tylko litery, cyfry, kropka i myślnik (bez znaków typu ! ? / #).')
            : ''
  const passMsg = !password ? t('Wpisz hasło.') : creating && password.length < 6 ? t('Hasło jest za krótkie: co najmniej 6 znaków.') : ''
  const pass2Msg = creating && !passMsg && password !== password2 ? (password2 ? t('Hasła się różnią.') : t('Powtórz hasło.')) : ''
  const problems = [loginMsg, passMsg, pass2Msg].filter(Boolean)
  const normalized = normalizeLogin(login)
  const showLogin = creating && !lp && !login.includes('@') && normalized !== login.trim()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (problems.length) return
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
  const bad = (msg: string, typed: string) => (tried || (typed && msg !== t('Powtórz hasło.'))) && msg

  return (
    <form className="panel account-form" onSubmit={submit} noValidate>
      <h2>{creating ? t('Załóż konto') : t('Zaloguj się')}</h2>
      <div className="seg" role="tablist">
        <button type="button" role="tab" aria-selected={!creating} className={!creating ? 'on' : ''} onClick={() => { setMode('in'); setTried(false); setError(''); location.hash = 'konto' }}>{t('Mam konto')}</button>
        <button type="button" role="tab" aria-selected={creating} className={creating ? 'on' : ''} onClick={() => { setMode('new'); setTried(false); setError(''); location.hash = 'rejestracja' }}>{t('Nowe konto')}</button>
      </div>
      <label className={bad(loginMsg, tried ? login : '') ? 'field-bad' : undefined}>{t('Login')}
        <input value={login} onChange={(e) => { setLogin(e.target.value); setError('') }} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder={t('np. optymielno')} aria-invalid={!!(tried && loginMsg)} />
        {tried && loginMsg ? <span className="error small">{loginMsg}</span>
          : creating && <span className="muted small">{t('Np. nazwa klubu albo miasta. Może być też adres e-mail.')}</span>}
        {showLogin && <span className="ok small">{t('Twój login będzie: {login}', { login: normalized })}</span>}
      </label>
      {creating && (
        <label>{t('Nazwa klubu lub organizatora')} <span className="muted small">({t('nieobowiązkowo')})</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('np. UKS Opty Mielno')} />
        </label>
      )}
      <label className={tried && passMsg ? 'field-bad' : undefined}>{t('Hasło')}
        <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError('') }} autoComplete={creating ? 'new-password' : 'current-password'} aria-invalid={!!(tried && passMsg)} />
        {(tried || (creating && password)) && passMsg ? <span className="error small">{passMsg}</span>
          : creating && <span className="muted small">{t('Co najmniej 6 znaków.')}</span>}
      </label>
      {creating && (
        <label className={bad(pass2Msg, password2) ? 'field-bad' : undefined}>{t('Powtórz hasło')}
          <input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" aria-invalid={!!bad(pass2Msg, password2)} />
          {bad(pass2Msg, password2) && <span className="error small">{pass2Msg}</span>}
        </label>
      )}
      {tried && problems.length > 0 && (
        <p className="error" role="alert">{t('Popraw to, co jest zaznaczone na czerwono:')} {problems.join(' ')}</p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>
        {busy ? t('Chwileczkę…') : creating ? t('Załóż konto') : t('Zaloguj się')}
      </button>
    </form>
  )
}

function MyTournaments({ account }: { account: Account }) {
  const usage = useUsage(account)
  // Deleting a tournament: asked first; if the database refuses, it can still leave the list.
  const [asking, setAsking] = useState<AccountTournament | null>(null)
  const [busy, setBusy] = useState('')
  const [failed, setFailed] = useState<AccountTournament | null>(null)
  const [done, setDone] = useState('')
  const remove = async (tr: AccountTournament) => {
    setAsking(null)
    setFailed(null)
    setDone('')
    setBusy(tr.id)
    try {
      await deleteTournament(tr.id)
      setDone(t('Turniej „{name}” został usunięty.', { name: tr.name }))
    } catch (e) {
      console.warn('delete tournament', e)
      setFailed(tr)
    } finally {
      setBusy('')
    }
  }
  const forget = async (tr: AccountTournament) => {
    setFailed(null)
    await forgetTournament(tr.id)
    setDone(t('Turniej „{name}” zniknął z listy.', { name: tr.name }))
  }
  return (
    <>
      <header className="acc-head">
        <div>
          <p className="eyebrow">{t('Moje turnieje')}</p>
          <h1>{account.name || account.login}</h1>
          <span className="muted">{t('Login')}: {account.login} · <a href="#konto">{t('Dane konta i hasło')}</a></span>
        </div>
        <a className="btn btn-primary btn-lg" href="#nowy-turniej">+ {t('Załóż nowy turniej')}</a>
      </header>
      <UsageSummary account={account} usage={usage} />
      <section className="account-list">
        <h2>{t('Moje turnieje')}</h2>
        {done && <p className="ok" role="status">{done}</p>}
        {failed && (
          <div className="error" role="alert">
            <p>{t('Nie udało się usunąć turnieju „{name}”. Sprawdź internet. Jeśli PIN sędziego głównego był zmieniany na innym urządzeniu, wejdź do panelu turnieju i spróbuj jeszcze raz.', { name: failed.name })}</p>
            <button type="button" className="btn btn-sm" onClick={() => void forget(failed)}>{t('Usuń tylko z mojej listy')}</button>
          </div>
        )}
        {asking && (
          <ConfirmDialog
            question={<>
              <b>{t('Czy na pewno usunąć turniej „{name}”?', { name: asking.name })}</b>
              <p>{t('Znikną wszystkie mecze, wyniki, tabele i zgłoszenia. Strona turnieju przestanie działać. Tego nie da się cofnąć.')}</p>
            </>}
            yes={t('Tak, usuń turniej')}
            no={t('Nie, zostaw')}
            onYes={() => void remove(asking)}
            onNo={() => setAsking(null)}
          />
        )}
        {account.tournaments.length === 0 && (
          <p className="muted">{t('Nie masz jeszcze turniejów. Załóż pierwszy, zapisze się na tym koncie.')}</p>
        )}
        <div className="acc-grid">
          {account.tournaments.map((tr) => (
            <article key={tr.id} className="panel account-t">
              <h3>{tr.name}</h3>
              <div className="actions">
                <a className="btn btn-primary" href={tournamentLink(tr.id, '#panel')}>{t('Panel organizatora')}</a>
                <a className="btn" href={tournamentLink(tr.id)}>{t('Strona dla kibiców')}</a>
              </div>
              <p className="muted small">{t('PIN sędziego głównego:')} <b>{tr.pin}</b>. {t('Po wejściu z tego konta nie trzeba go wpisywać.')}</p>
              {usage && <TournamentChart usage={usage[tr.id]} test={isTestAccount(account)} />}
              {/* Albatros CUP ("main") stays. */}
              {tr.id !== 'main' && (
                <button type="button" className="btn btn-sm btn-danger account-delete" disabled={busy === tr.id} onClick={() => setAsking(tr)}>
                  🗑 {busy === tr.id ? t('Usuwam…') : t('Usuń turniej')}
                </button>
              )}
            </article>
          ))}
        </div>
      </section>
    </>
  )
}

const PROFILE_FIELDS: { key: Exclude<keyof AccountProfile, 'name' | 'about'>; label: string; type?: string; placeholder?: string }[] = [
  { key: 'contactName', label: tk('Osoba kontaktowa'), placeholder: tk('np. Krzysztof Rywak') },
  { key: 'phone', label: tk('Telefon'), type: 'tel', placeholder: tk('np. 600 100 200') },
  { key: 'email', label: tk('E-mail kontaktowy'), type: 'email', placeholder: tk('np. klub@example.pl') },
  { key: 'city', label: tk('Miejscowość'), placeholder: tk('np. Mielno') },
  { key: 'website', label: tk('Strona internetowa'), type: 'url', placeholder: tk('np. https://klub.pl') },
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
      setMsg(t('Zapisano.'))
    } catch {
      setMsg(t('Nie udało się zapisać. Sprawdź internet.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <header className="acc-head">
        <div>
          <p className="eyebrow">{t('Moje konto')}</p>
          <h1>{account.name || account.login}</h1>
          <span className="muted">{t('Login')}: <b>{account.login}</b> · <a href="#moje-turnieje">{t('Moje turnieje')} ({account.tournaments.length})</a></span>
        </div>
      </header>
      <div className="acc-cols">
        <form className="panel acc-form" onSubmit={save}>
          <h2>{t('Dane konta')}</h2>
          <p className="muted small">{t('Widoczne tylko dla Ciebie. Wypełnij, co chcesz, poza nazwą wszystko jest nieobowiązkowe.')}</p>
          <label>{t('Nazwa klubu lub organizatora')}
            <input value={form.name} onChange={(e) => set('name', e.target.value)} required />
          </label>
          <div className="acc-form-grid">
            {PROFILE_FIELDS.map((f) => (
              <label key={f.key}>{t(f.label)}
                <input type={f.type ?? 'text'} value={form[f.key] ?? ''} placeholder={f.placeholder && t(f.placeholder)}
                  onChange={(e) => set(f.key, e.target.value)} />
              </label>
            ))}
          </div>
          <label>{t('O klubie / notatki')}
            <textarea rows={3} value={form.about ?? ''} onChange={(e) => set('about', e.target.value)} />
          </label>
          <div className="actions">
            <button className="btn btn-primary" type="submit" disabled={busy || !form.name.trim()}>{busy ? t('Zapisuję…') : t('Zapisz dane')}</button>
            {msg && <span className={msg === t('Zapisano.') ? 'ok' : 'error'}>{msg}</span>}
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
        <h2>{t('Hasło do konta')}</h2>
        <p className="muted small">{t('Hasło, którym logujesz się na konto SportLiveArena. To nie jest PIN turnieju: PIN zmienisz w panelu organizatora turnieju.')}</p>
        <button className="btn" onClick={() => { setOpen(true); setMsg(null) }}>{t('Zmień hasło do konta')}</button>
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
      setMsg({ ok: true, text: t('Hasło zmienione. Od teraz loguj się nowym hasłem.') })
    } catch (err) {
      const code = (err as { code?: string }).code
      setMsg({ ok: false, text: code === 'auth/invalid-credential' || code === 'auth/wrong-password' ? t('Obecne hasło jest nieprawidłowe.') : accountError(err) })
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="panel account-form account-pass" onSubmit={submit}>
      <h2>{t('Zmień hasło do konta')}</h2>
      <label>{t('Obecne hasło')}
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
      </label>
      <label>{t('Nowe hasło')}
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        <span className="muted small">{t('Co najmniej 6 znaków.')}</span>
      </label>
      <label>{t('Powtórz nowe hasło')}
        <input type="password" value={next2} onChange={(e) => setNext2(e.target.value)} autoComplete="new-password" />
        {next2 && next !== next2 && <span className="error small">{t('Hasła się różnią.')}</span>}
      </label>
      {msg && !msg.ok && <p className="error">{msg.text}</p>}
      <div className="actions">
        <button className="btn btn-primary" type="submit" disabled={!ready || busy}>{busy ? t('Zapisuję…') : t('Zapisz nowe hasło')}</button>
        <button className="btn" type="button" onClick={() => setOpen(false)}>{t('Anuluj')}</button>
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
  if (isTestAccount(account)) return <TestAccountNote today={usage ? today : null} />
  return (
    <section className="usage">
      <div className="panel usage-card">
        <p className="eyebrow">{t('Zużycie dzisiaj')}</p>
        <div className="usage-big"><b>{usage ? `${pct}%` : '…'}</b><span className="muted">{t('darmowego limitu')}</span></div>
        <div className={`usage-bar ${level}`} role="progressbar" aria-valuenow={Math.min(pct, 100)} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
        <p className="muted small">
          {t('{used} z {free} darmowych wejść kibiców na dziś.', { used: today.toLocaleString(locale()), free: FREE_VIEWS_PER_DAY.toLocaleString(locale()) })}
          {over > 0 && <> {t('Ponad limit:')} <b>{over.toLocaleString(locale())}</b> {t('wejść (z kredytów).')}</>} {t('Limit odnawia się o północy.')}
        </p>
      </div>
      <div className="panel usage-card">
        <p className="eyebrow">{t('Kredyty')}</p>
        <div className="usage-big"><b>{credits.toLocaleString(locale())}</b><span className="muted">{t('wejść na zapas')}</span></div>
        <p className="muted small">{t('Używane dopiero po wyczerpaniu dziennego darmowego limitu. Nie przepadają.')}</p>
        <a className="btn btn-primary" href="#kredyty">{t('Doładuj kredyty')}</a>
      </div>
      <div className="panel usage-card">
        <p className="eyebrow">{t('Szacunkowy koszt dzisiaj')}</p>
        <div className="usage-big"><b>{formatPln(pricePln(over))}</b><span className="muted">{t('za wejścia ponad limit')}</span></div>
        <p className="muted small">
          {t('Koszt bazy Google Firebase za dzisiejszy ruch: ok. {cost} (ok. {reads} odczytów bazy na jedno wejście).', { cost: formatPln(firebaseCostPln(today)), reads: READS_PER_VIEW })}
        </p>
      </div>
    </section>
  )
}

/** A test tournament's organiser: free, without limits; visits only counted. */
function TestAccountNote({ today }: { today: number | null }) {
  return (
    <section className="usage">
      <div className="panel usage-card usage-test">
        <p className="eyebrow">{t('Turniej testowy')}</p>
        <div className="usage-big"><b>{t('Za darmo, bez limitu')}</b></div>
        <p className="muted small">{t('To pierwszy turniej testowy serwisu. Korzystasz ze wszystkiego za darmo, bez dziennego limitu i bez doładowywania kredytów. Liczymy tylko wejścia, żeby wiedzieć, ile ruchu robi prawdziwy turniej.')}</p>
        {today !== null && <p className="small"><b>{t('Dziś: {n} wejść', { n: today.toLocaleString(locale()) })}</b></p>}
      </div>
    </section>
  )
}

/** Visits per day for the last week, as small bars. */
function TournamentChart({ usage, test }: { usage: TournamentUsage | undefined; test?: boolean }) {
  if (!usage || usage.days.length === 0) return <p className="muted small">{t('Wejścia: jeszcze nikt nie otwierał strony turnieju.')}</p>
  const days = [...usage.days].reverse()
  const max = Math.max(...days.map((d) => d.views), 1)
  return (
    <div className="t-usage">
      <p className="small"><b>{t('Dziś: {n} wejść', { n: usage.today.toLocaleString(locale()) })}</b>{!test && <> · {t('{pct}% dziennego limitu', { pct: freeUsedPercent(usage.today) })}</>}</p>
      <div className="t-bars" aria-label={t('Wejścia w ostatnich dniach')}>
        {days.map((d) => (
          <div key={d.day} className="t-bar" title={`${d.day}: ${t('{n} wejść', { n: d.views })}`}>
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
  if (isTestAccount(account)) {
    return (
      <>
        <header className="acc-head">
          <div>
            <p className="eyebrow">{t('Kredyty')}</p>
            <h1>{t('Turniej testowy: za darmo, bez limitu')}</h1>
            <span className="muted">{t('Nic nie doładowujesz. Wszystkie wejścia kibiców są darmowe.')}</span>
          </div>
        </header>
      </>
    )
  }
  return (
    <>
      <header className="acc-head">
        <div>
          <p className="eyebrow">{t('Kredyty')}</p>
          <h1>{t('Masz {n} wejść na zapas', { n: (account.credits ?? 0).toLocaleString(locale()) })}</h1>
          <span className="muted">{t('Każdego dnia pierwsze {n} wejść kibiców jest za darmo. Kredyty pokrywają ruch ponad ten limit.', { n: FREE_VIEWS_PER_DAY.toLocaleString(locale()) })}</span>
        </div>
      </header>
      <section className="credit-packs">
        {PACKAGES.map((p, i) => (
          <article key={p.views} className={`panel credit-pack ${i === 1 ? 'popular' : ''}`}>
            {i === 1 && <span className="credit-badge">{t('Najczęściej wybierany')}</span>}
            <h3>{t('{n} wejść', { n: p.views.toLocaleString(locale()) })}</h3>
            <p className="credit-price">{p.pln} zł</p>
            <p className="muted small">{t('{price} za 1000 wejść', { price: formatPln(p.pln * 1000 / p.views) })}</p>
            <button className="btn btn-primary" disabled title={t('Płatności online wkrótce')}>{t('Doładuj')}</button>
          </article>
        ))}
      </section>
      <p className="notice-inline">
        {t('Płatności online (BLIK, karta) uruchomimy wkrótce. Do tego czasu kredyty doładowuje administrator serwisu po przelewie.')}
      </p>
      <section className="panel credit-calc">
        <h2>{t('Ile to będzie kosztować?')}</h2>
        <div className="form-row">
          <label>{t('Wejść kibiców dziennie')}
            <NumberField min={0} max={10000000} value={views} onChange={setViews} />
          </label>
          <label>{t('Dni turnieju')}
            <NumberField min={1} max={30} value={days} onChange={setDays} />
          </label>
        </div>
        <p>
          {t('Ponad darmowy limit:')} <b>{t('{n} wejść', { n: total.toLocaleString(locale()) })}</b> → {t('szacunkowo')} <b>{formatPln(pricePln(total))}</b>.
          {total === 0 && ` ${t('Taki turniej mieści się w darmowym limicie.')}`}
        </p>
        <p className="muted small">
          {t('Dla porównania: turniej na 60 drużyn z rodzicami to zwykle 2–5 tys. wejść dziennie. Koszt bazy Google za ten ruch: ok. {cost}.', { cost: formatPln(firebaseCostPln(views * days)) })}
        </p>
      </section>
    </>
  )
}
