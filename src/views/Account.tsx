import { useState } from 'react'
import { ALBATROS_ALIAS, IS_PLATFORM_HOST } from '../config'
import {
  accountError, changePassword, createAccount, LOGIN_PATTERN, saveProfile, signInAccount, useAccount, type Account,
  type AccountProfile,
} from '../store/accounts'
import { PlatformNav, Wordmark } from './Platform'

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
export function AccountPage({ view }: { view: 'konto' | 'rejestracja' | 'moje-turnieje' }) {
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
