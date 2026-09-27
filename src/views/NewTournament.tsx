import { useState } from 'react'
import { ALBATROS_ALIAS, TOURNAMENT_SLUG } from '../config'
import { MAX_COURTS, saveDraft, slugify, type TournamentDraft } from '../logic/newTournament'
import { Assistant, type AssistantDraft } from './Assistant'
import { describeSets, SPORTS, sportById, sportRules } from '../logic/sports'
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
  const pickSport = (id: string) => {
    const next = sportById(id)
    setSportId(id)
    setFormat(next.formats[0].id)
    setSlotMinutes(next.slot)
  }
  const rules = sportRules(sport, format, setPoints)
  const score = rules.scoring === 'score'
  const [categories, setCategories] = useState('')
  const [preset, setPreset] = useState<TournamentDraft['preset']>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const address = slugEdited ? slug : slugify(name)
  const cats = categories.split(/[\n,;]/).map((c) => c.trim()).filter(Boolean)
  const validTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)
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
        setError('Ten adres jest już zajęty. Zmień nazwę albo adres turnieju.')
        return
      }
    } catch {
      setError('Brak połączenia z internetem. Spróbuj jeszcze raz.')
      return
    } finally {
      setBusy(false)
    }
    saveDraft(address, {
      name: name.trim(), start: `${date}T${time}`, courts, slotMinutes, dayEnd,
      categories: cats.length ? cats : ['Turniej'], sport: sportId, format, setPoints: sport.custom ? setPoints : undefined,
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
          <p className="eyebrow">Nowy turniej</p>
          <h1>Załóż turniej</h1>
        </div>
      </header>
      {account.status === 'signed-out' && (
        <p className="notice-inline">
          <a href="#konto">Zaloguj się albo załóż konto</a>, żeby turniej zapisał się na Twoim koncie i był zawsze pod ręką.
        </p>
      )}
      {account.status === 'signed-in' && (
        <p className="muted">Turniej zapisze się na koncie <b>{account.account.name || account.account.login}</b>. <a href="#moje-turnieje">Moje turnieje</a></p>
      )}
      <Assistant signedIn={account.status === 'signed-in'} onDraft={applyDraft} />
      {preset && preset.some((p) => p.teams.length) && (
        <p className="notice-inline">
          Z notatek: {preset.map((p) => `${p.category}: ${p.teams.length} drużyn${p.groups.length ? `, ${p.groups.length} grup` : ''}`).join(' · ')}.
          Zapiszą się razem z turniejem. <button className="linklike" onClick={() => setPreset(undefined)}>Nie używaj</button>
        </p>
      )}
      <form className="panel new-t-form" onSubmit={submit}>
        <label>Dyscyplina
          <select value={sportId} onChange={(e) => pickSport(e.target.value)}>
            {GROUPS.map((g) => (
              <optgroup key={g} label={g}>
                {SPORTS.filter((sp) => sp.group === g).map((sp) => <option key={sp.id} value={sp.id}>{sp.label}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <div className="form-row">
          <label>Format meczu
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              {sport.formats.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </label>
          {sport.custom && !score && (
            <label>Set do punktów
              <input type="number" min={3} max={99} value={setPoints}
                onChange={(e) => setSetPoints(Math.max(3, Math.min(99, Number(e.target.value) || 25)))} />
            </label>
          )}
        </div>
        <div className="sport-note">
          <p>{sport.note}</p>
          <p className="muted small">
            {score ? `Wynik: ${rules.unit}${rules.draws ? ', remis możliwy' : ', bez remisów'}.` : `Zasady: ${describeSets(rules)}.`}
            {' '}Tabela: wygrana {sport.table[0]} pkt{rules.draws || rules.setsMode === 'fixed' && rules.sets % 2 === 0 ? `, remis ${sport.table[1]} pkt` : ''}, porażka {sport.table[2]} pkt.
            {' '}Uczestnicy: {sport.entrants}.
          </p>
        </div>
        <label>Nazwa turnieju
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="np. Halówka Mielno 2027" required />
        </label>
        <label>Adres strony
          <span className="new-t-address">
            <span className="muted">{location.host}/?t=</span>
            <input value={address} onChange={(e) => { setSlugEdited(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40)) }} />
          </span>
          <span className="muted small">Małe litery, cyfry i myślniki. Ten adres wyślesz kibicom.</span>
        </label>
        <div className="form-row">
          <label>Dzień pierwszego meczu
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label>Godzina (GG:MM)
            <input inputMode="numeric" value={time} onChange={(e) => setTime(e.target.value)} placeholder="09:00" />
          </label>
          <label>Ostatni mecz dnia najpóźniej o
            <input inputMode="numeric" value={dayEnd} onChange={(e) => setDayEnd(e.target.value)} placeholder="18:00" />
          </label>
        </div>
        <div className="form-row">
          <label>Liczba boisk (kortów, stołów)
            <input type="number" min={1} max={MAX_COURTS} value={courts}
              onChange={(e) => setCourts(Math.max(1, Math.min(MAX_COURTS, Number(e.target.value) || 1)))} />
          </label>
          <label>Mecz co ile minut
            <input type="number" min={5} max={120} step={5} value={slotMinutes}
              onChange={(e) => setSlotMinutes(Math.max(5, Math.min(120, Number(e.target.value) || 5)))} />
          </label>
        </div>
        <label>Kategorie (każda w osobnej linii lub po przecinku)
          <textarea rows={3} value={categories} onChange={(e) => setCategories(e.target.value)}
            placeholder={'np. Dziewczęta U12\nChłopcy U12'} />
          <span className="muted small">Puste pole: jedna kategoria dla wszystkich drużyn.</span>
        </label>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button className="btn btn-primary btn-lg" type="submit" disabled={!ready || busy}>
            {busy ? 'Sprawdzam adres…' : 'Dalej: ustaw PIN'}
          </button>
        </div>
        <p className="muted small">
          W następnym kroku ustawisz PIN sędziego głównego, a potem wpiszesz zespoły i rozlosujesz grupy.
        </p>
      </form>
      </main>
    </div>
  )
}
