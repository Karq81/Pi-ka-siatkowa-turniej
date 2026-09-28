import { t, tp } from '../i18n'
import { useState } from 'react'
import { ALBATROS_ALIAS, TOURNAMENT_SLUG } from '../config'
import { MAX_COURTS, saveDraft, slugify, type TournamentDraft } from '../logic/newTournament'
import { Assistant, type AssistantDraft } from './Assistant'
import { clock } from '../logic/judo'
import { describeSets, SPORTS, sportById, sportName, sportRules } from '../logic/sports'
import { store } from '../store/store'
import { useAccount } from '../store/accounts'
import { PlatformNav } from './Platform'

const GROUPS = [...new Set(SPORTS.map((s) => s.group))]

/**
 * "Załóż turniej" (#nowy-turniej): name, address, date, courts and rules. The settings
 * stay on this device until the organiser sets the PIN in the new tournament's panel,
 * which saves the tournament in the database.
 */
export function NewTournament() {
  const account = useAccount()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('09:00')
  const [dayEnd, setDayEnd] = useState('18:00')
  const [courts, setCourts] = useState(4)
  const [slotMinutes, setSlotMinutes] = useState(SPORTS[0].slot)
  const [sportId, setSportId] = useState(SPORTS[0].id)
  const sport = sportById(sportId)
  const [format, setFormat] = useState(sport.formats[0].id)
  const [setPoints, setSetPoints] = useState(25)
  // Judo: contest minutes typed by the organiser ('' = the format's time).
  const [fightMinutes, setFightMinutes] = useState('')
  const pickSport = (id: string) => {
    const next = sportById(id)
    setSportId(id)
    setFormat(next.formats[0].id)
    setSlotMinutes(next.slot)
    setFightMinutes('')
  }
  const fightSeconds = fightMinutes ? Math.round(Number(fightMinutes.replace(',', '.')) * 60) || undefined : undefined
  const rules = sportRules(sport, format, setPoints, fightSeconds)
  const judo = rules.scoring === 'judo'
  const score = rules.scoring === 'score'
  const [categories, setCategories] = useState('')
  const [preset, setPreset] = useState<TournamentDraft['preset']>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const address = slugEdited ? slug : slugify(name)
  const cats = categories.split(/[\n,;]/).map((c) => c.trim()).filter(Boolean)
  const validTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v)
  const ready = name.trim().length >= 3 && TOURNAMENT_SLUG.test(address) && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && validTime(time) && validTime(dayEnd)

  /** Fills the form with the AI assistant's draft; teams and groups go with the tournament. */
  const applyDraft = (d: AssistantDraft) => {
    const s = sportById(d.sport)
    setSportId(s.id)
    setFormat(s.formats.some((f) => f.id === d.format) ? d.format : s.formats[0].id)
    if (d.name) { setName(d.name); setSlugEdited(false) }
    if (/^\d{4}-\d{2}-\d{2}$/.test(d.date)) setDate(d.date)
    if (validTime(d.time)) setTime(d.time)
    if (validTime(d.dayEnd)) setDayEnd(d.dayEnd)
    if (d.courts > 0) setCourts(Math.min(MAX_COURTS, d.courts))
    setSlotMinutes(d.slotMinutes > 0 ? Math.min(120, d.slotMinutes) : s.slot)
    setCategories(d.categories.map((c) => c.name).join('\n'))
    setPreset(d.categories.map((c) => ({ category: c.name, teams: c.teams, groups: c.groups })))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    setError('')
    try {
      if (address === 'main' || address === ALBATROS_ALIAS || await store.tournamentExists(address)) {
        setError(t('Ten adres jest już zajęty. Zmień nazwę albo adres turnieju.'))
        return
      }
    } catch {
      setError(t('Brak połączenia z internetem. Spróbuj jeszcze raz.'))
      return
    } finally {
      setBusy(false)
    }
    saveDraft(address, {
      name: name.trim(), start: `${date}T${time}`, courts, slotMinutes, dayEnd,
      categories: cats.length ? cats : [t('Turniej')], sport: sportId, format, setPoints: sport.custom ? setPoints : undefined,
      fightSeconds: judo ? rules.fightSeconds : undefined,
      preset,
    })
    location.href = `${location.pathname}?t=${address}#panel`
  }

  return (
    <div className="pf-page">
      <PlatformNav />
      <main className="pf-wrap pf-main new-t">
      <header className="org-head">
        <div>
          <p className="eyebrow">{t('Nowy turniej')}</p>
          <h1>{t('Załóż turniej')}</h1>
        </div>
      </header>
      {account.status === 'signed-out' && (
        <p className="notice-inline">
          <a href="#konto">{t('Zaloguj się albo załóż konto')}</a>{t(', żeby turniej zapisał się na Twoim koncie i był zawsze pod ręką.')}
        </p>
      )}
      {account.status === 'signed-in' && (
        <p className="muted">{t('Turniej zapisze się na koncie:')} <b>{account.account.name || account.account.login}</b>. <a href="#moje-turnieje">{t('Moje turnieje')}</a></p>
      )}
      <Assistant signedIn={account.status === 'signed-in'} onDraft={applyDraft} />
      {preset && preset.some((p) => p.teams.length) && (
        <p className="notice-inline">
          {t('Z notatek:')} {preset.map((p) => `${p.category}: ${tp(p.teams.length, '{n} drużyna|{n} drużyny|{n} drużyn')}${p.groups.length ? `, ${tp(p.groups.length, '{n} grupa|{n} grupy|{n} grup')}` : ''}`).join(' · ')}.
          {' '}{t('Zapiszą się razem z turniejem.')} <button className="linklike" onClick={() => setPreset(undefined)}>{t('Nie używaj')}</button>
        </p>
      )}
      <form className="panel new-t-form" onSubmit={submit}>
        <label>{t('Dyscyplina')}
          <select value={sportId} onChange={(e) => pickSport(e.target.value)}>
            {GROUPS.map((g) => (
              <optgroup key={g} label={t(g)}>
                {SPORTS.filter((sp) => sp.group === g).map((sp) => <option key={sp.id} value={sp.id}>{sportName(sp)}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <div className="form-row">
          <label>{t('Format meczu')}
            <select value={format} onChange={(e) => { setFormat(e.target.value); setFightMinutes('') }}>
              {sport.formats.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </label>
          {judo && (
            <label>{t('Czas walki (minuty)')}
              <input inputMode="decimal" value={fightMinutes || String((rules.fightSeconds ?? 240) / 60).replace('.', ',')}
                onChange={(e) => setFightMinutes(e.target.value.replace(/[^\d.,]/g, '').slice(0, 4))} />
              <span className="muted small">{t('Np. 4, 3, 2 albo 1,5. Po czasie przy remisie: golden score.')}</span>
            </label>
          )}
          {sport.custom && !score && !judo && (
            <label>{t('Set do punktów')}
              <input type="number" min={3} max={99} value={setPoints}
                onChange={(e) => setSetPoints(Math.max(3, Math.min(99, Number(e.target.value) || 25)))} />
            </label>
          )}
        </div>
        <div className="sport-note">
          <p>{sport.note}</p>
          <p className="muted small">
            {judo
              ? `${t('Czas walki: {time}, przy remisie golden score (bez limitu czasu).', { time: clock(rules.fightSeconds ?? 240) })}`
              : score
                ? `${t('Wynik:')} ${t(rules.unit ?? 'punkty')}, ${rules.draws ? t('remis możliwy') : t('bez remisów')}.`
                : `${t('Zasady:')} ${describeSets(rules)}.`}
            {' '}{t('Tabela:')} {t('wygrana {n} pkt', { n: sport.table[0] })}
            {rules.draws || rules.setsMode === 'fixed' && rules.sets % 2 === 0 ? `, ${t('remis {n} pkt', { n: sport.table[1] })}` : ''}
            , {t('porażka {n} pkt', { n: sport.table[2] })}.
            {' '}{t('Uczestnicy:')} {t(sport.entrants)}.
          </p>
        </div>
        <label>{t('Nazwa turnieju')}
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('np. Halówka Mielno 2027')} required />
        </label>
        {slugEdited ? (
          <label>{t('Link dla kibiców')}
            <span className="new-t-address">
              <span className="muted">{location.host}/?t=</span>
              <input value={address} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40))} />
            </span>
            <span className="muted small">{t('Małe litery, cyfry i myślniki.')}</span>
          </label>
        ) : (
          <p className="new-t-link muted small">
            {t('Link dla kibiców utworzy się sam z nazwy turnieju:')}{' '}
            <b>{location.host}/?t={address || '…'}</b>{' '}
            <button type="button" className="linklike" onClick={() => { setSlug(address); setSlugEdited(true) }}>{t('zmień')}</button>
          </p>
        )}
        <div className="form-row">
          <label>{t('Dzień pierwszego meczu')}
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label>{t('Godzina (GG:MM)')}
            <input inputMode="numeric" value={time} onChange={(e) => setTime(e.target.value)} placeholder="09:00" />
          </label>
          <label>{t('Ostatni mecz dnia najpóźniej o')}
            <input inputMode="numeric" value={dayEnd} onChange={(e) => setDayEnd(e.target.value)} placeholder="18:00" />
          </label>
        </div>
        <div className="form-row">
          <label>{judo ? t('Liczba mat') : t('Liczba boisk (kortów, stołów)')}
            <input type="number" min={1} max={MAX_COURTS} value={courts}
              onChange={(e) => setCourts(Math.max(1, Math.min(MAX_COURTS, Number(e.target.value) || 1)))} />
          </label>
          <label>{judo ? t('Walka co ile minut (z przerwą)') : t('Mecz co ile minut')}
            <input type="number" min={2} max={120} step={1} value={slotMinutes}
              onChange={(e) => setSlotMinutes(Math.max(2, Math.min(120, Number(e.target.value) || 2)))} />
            {judo && <span className="muted small">{t('Czas walki z zatrzymaniami i przerwą na zmianę zawodników. Zwykle 5–7 minut.')}</span>}
          </label>
        </div>
        <label>{t('Kategorie (każda w osobnej linii lub po przecinku)')}
          <textarea rows={3} value={categories} onChange={(e) => setCategories(e.target.value)}
            placeholder={t('np. Dziewczęta U12\nChłopcy U12')} />
          <span className="muted small">{t('Puste pole: jedna kategoria dla wszystkich drużyn.')}</span>
        </label>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button className="btn btn-primary btn-lg" type="submit" disabled={!ready || busy}>
            {busy ? t('Sprawdzam adres…') : t('Dalej: ustaw PIN')}
          </button>
        </div>
        <p className="muted small">
          {t('W następnym kroku ustawisz PIN sędziego głównego, a potem wpiszesz zespoły i rozlosujesz grupy.')}
        </p>
      </form>
      </main>
    </div>
  )
}
