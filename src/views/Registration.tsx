import { useEffect, useState } from 'react'
import { t } from '../i18n'
import { tournamentUrl } from '../config'
import { store, useStore } from '../store/store'
import type { Entry, State } from '../types'
import { BackBar } from '../ui'

/*
 * Sign-ups: teams (or players) send their name, category, squad, logo and a contact person
 * from the tournament's page (#zgloszenie); the organiser accepts them into the tournament.
 * Contact details are stored apart from the public data and only the organiser reads them.
 */

/** A picture made small (longest side 160 px, JPEG) so it fits in the sign-up. */
async function smallLogo(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    })
    const scale = Math.min(1, 160 / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.round(img.width * scale)
    c.height = Math.round(img.height * scale)
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.82)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function RegistrationPage() {
  const state = useStore()
  const open = !!state.tournament.registration
  const cats = state.categories
  const [f, setF] = useState({ name: '', categoryId: '', club: '', contact: '', phone: '', email: '', players: '', note: '' })
  const [logo, setLogo] = useState('')
  const [consent, setConsent] = useState(false)
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const categoryId = f.categoryId || (cats.length === 1 ? cats[0].id : '')
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const missing = {
    name: !f.name.trim() ? t('Wpisz nazwę drużyny albo zawodnika.') : '',
    categoryId: !categoryId ? t('Wybierz kategorię.') : '',
    contact: !f.contact.trim() ? t('Wpisz osobę do kontaktu (kapitan, trener).') : '',
    reach: !f.phone.trim() && !f.email.trim() ? t('Podaj telefon albo e-mail, żeby organizator mógł się odezwać.') : '',
    consent: !consent ? t('Zaznacz zgodę na przetwarzanie danych.') : '',
  }
  const problems = Object.values(missing).filter(Boolean)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (problems.length) return
    setBusy(true)
    setError('')
    try {
      await store.submitEntry({
        name: f.name.trim(), categoryId, club: f.club.trim(), contact: f.contact.trim(), phone: f.phone.trim(),
        email: f.email.trim(), players: f.players.trim(), note: f.note.trim(), logo: logo || undefined,
      })
      setDone(true)
    } catch {
      setError(t('Nie udało się wysłać. Sprawdź internet i spróbuj jeszcze raz.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <BackBar fallback="" />
      <main className="pf-wrap reg-page">
        <p className="eyebrow">{state.tournament.name}</p>
        <h1>{t('Zgłoś drużynę')}</h1>
        {!open ? (
          <p className="notice-inline">{t('Zgłoszenia do tego turnieju są zamknięte. Zapytaj organizatora.')}</p>
        ) : done ? (
          <section className="panel">
            <h2>✅ {t('Zgłoszenie wysłane')}</h2>
            <p>{t('Organizator dostał Twoje zgłoszenie. Gdy je przyjmie, drużyna pojawi się na liście turnieju.')}</p>
            <a className="btn" href="#">{t('Wróć do turnieju')}</a>
          </section>
        ) : (
          <form className="panel reg-form new-t-form" onSubmit={submit} noValidate>
            <label className={tried && missing.name ? 'field-bad' : undefined}>{t('Nazwa drużyny albo zawodnika')} <span className="req">*</span>
              <input value={f.name} onChange={set('name')} maxLength={80} />
              {tried && missing.name && <span className="error small">{missing.name}</span>}
            </label>
            {cats.length > 1 && (
              <label className={tried && missing.categoryId ? 'field-bad' : undefined}>{t('Kategoria')} <span className="req">*</span>
                <select value={f.categoryId} onChange={set('categoryId')}>
                  <option value="">—</option>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {tried && missing.categoryId && <span className="error small">{missing.categoryId}</span>}
              </label>
            )}
            <label>{t('Klub')} <span className="muted small">({t('nieobowiązkowo')})</span>
              <input value={f.club} onChange={set('club')} maxLength={80} />
            </label>
            <label>{t('Skład: jeden zawodnik w linii (nieobowiązkowo)')}
              <textarea rows={6} value={f.players} onChange={set('players')} maxLength={4000} placeholder={t('np. 7 Jan Kowalski\n10 Adam Nowak')} />
            </label>
            <label>{t('Logo (nieobowiązkowo)')}
              <input type="file" accept="image/*" onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                try { setLogo(await smallLogo(file)) } catch { setError(t('Nie udało się wczytać obrazka.')) }
              }} />
              {logo && <span className="reg-logo"><img src={logo} alt="" /> <button type="button" className="linklike small" onClick={() => setLogo('')}>{t('Usuń')}</button></span>}
            </label>
            <fieldset className="reg-contact">
              <legend>{t('Kontakt (widzi go tylko organizator)')}</legend>
              <label className={tried && missing.contact ? 'field-bad' : undefined}>{t('Osoba do kontaktu (kapitan, trener)')} <span className="req">*</span>
                <input value={f.contact} onChange={set('contact')} maxLength={80} autoComplete="name" />
                {tried && missing.contact && <span className="error small">{missing.contact}</span>}
              </label>
              <div className="form-row">
                <label className={tried && missing.reach ? 'field-bad' : undefined}>{t('Telefon')}
                  <input value={f.phone} onChange={set('phone')} maxLength={30} inputMode="tel" autoComplete="tel" />
                </label>
                <label className={tried && missing.reach ? 'field-bad' : undefined}>{t('E-mail')}
                  <input value={f.email} onChange={set('email')} maxLength={120} inputMode="email" autoComplete="email" />
                </label>
              </div>
              {tried && missing.reach && <span className="error small">{missing.reach}</span>}
            </fieldset>
            <label>{t('Uwagi dla organizatora (nieobowiązkowo)')}
              <textarea rows={2} value={f.note} onChange={set('note')} maxLength={1000} />
            </label>
            <label className={`check ${tried && missing.consent ? 'field-bad' : ''}`}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              {' '}{t('Zgadzam się, żeby organizator użył tych danych do organizacji turnieju (kontakt, lista drużyn). Nazwa drużyny, klub i logo mogą być widoczne na stronie turnieju.')}
            </label>
            {tried && problems.length > 0 && (
              <div className="error form-missing" role="alert"><b>{t('Uzupełnij pola zaznaczone na czerwono:')}</b><ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul></div>
            )}
            {error && <p className="error">{error}</p>}
            <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>{busy ? t('Wysyłam…') : t('Wyślij zgłoszenie')}</button>
          </form>
        )}
      </main>
    </div>
  )
}

/** Organiser: sign-ups open or closed, the link to share, and the sign-ups to accept. */
export function EntriesPanel({ state }: { state: State }) {
  const open = !!state.tournament.registration
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [error, setError] = useState('')
  const link = `${tournamentUrl()}#zgloszenie`
  const load = async () => {
    try { setEntries(await store.listEntries()) } catch { setError(t('Nie udało się wczytać zgłoszeń.')) }
  }
  useEffect(() => { void load() }, [])
  const catName = (id: string) => state.categories.find((c) => c.id === id)?.name ?? '—'
  const accept = async (e: Entry) => {
    const id = `${e.categoryId}-z${Date.now().toString(36)}`
    await store.addTeams([{ id, name: e.name, categoryId: e.categoryId, ...(e.club ? { club: e.club } : {}) }])
    await store.setEntryStatus(e.id, 'przyjęte')
    await load()
  }
  const reject = async (e: Entry) => { await store.setEntryStatus(e.id, 'odrzucone'); await load() }
  const fresh = entries?.filter((e) => e.status === 'nowe') ?? []
  const drawn = state.groups.length > 0
  return (
    <section className="panel entries">
      <h2>📝 {t('Zgłoszenia drużyn')}{fresh.length ? <span className="pill pill-live"> {fresh.length}</span> : null}</h2>
      <p className="muted">{t('Drużyny same zgłaszają się przez formularz: nazwa, kategoria, skład, logo i kontakt do kapitana. Ty tylko przyjmujesz zgłoszenia.')}</p>
      <label className="check">
        <input type="checkbox" checked={open} onChange={(e) => store.updateTournament({ registration: e.target.checked })} />
        {' '}{t('Zgłoszenia otwarte')}
      </label>
      {open && (
        <p className="small">{t('Link do formularza (wyślij go klubom):')} <a href={link} target="_blank" rel="noreferrer">{link}</a>{' '}
          <button type="button" className="linklike small" onClick={() => navigator.clipboard?.writeText(link)}>{t('Kopiuj')}</button>
        </p>
      )}
      {drawn && <p className="muted small">{t('Grupy są już rozlosowane: przyjęta drużyna trafi na listę, a do grupy dopiszesz ją, losując ponownie.')}</p>}
      {error && <p className="error">{error}</p>}
      {entries && !entries.length && <p className="muted">{t('Na razie brak zgłoszeń.')}</p>}
      <ul className="entry-list">
        {entries?.map((e) => (
          <li key={e.id} className={`entry entry-${e.status === 'przyjęte' ? 'ok' : e.status === 'odrzucone' ? 'no' : 'new'}`}>
            <div className="entry-head">
              {e.logo && <img src={e.logo} alt="" className="entry-logo" />}
              <div>
                <b>{e.name}</b>{e.club ? <span className="muted"> · {e.club}</span> : null}
                <div className="muted small">{catName(e.categoryId)} · {new Date(e.createdAt).toLocaleString()}</div>
              </div>
              <span className="pill">{e.status === 'nowe' ? t('nowe') : e.status === 'przyjęte' ? t('przyjęte') : t('odrzucone')}</span>
            </div>
            <p className="small">👤 {e.contact}{e.phone ? <> · <a href={`tel:${e.phone}`}>{e.phone}</a></> : null}{e.email ? <> · <a href={`mailto:${e.email}`}>{e.email}</a></> : null}</p>
            {e.players && <details><summary className="small">{t('Skład')}</summary><pre className="entry-players">{e.players}</pre></details>}
            {e.note && <p className="small muted">💬 {e.note}</p>}
            {e.status === 'nowe' && (
              <div className="actions">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void accept(e)}>{t('Przyjmij do turnieju')}</button>
                <button type="button" className="btn btn-sm" onClick={() => void reject(e)}>{t('Odrzuć')}</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
