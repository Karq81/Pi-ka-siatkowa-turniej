import { useState } from 'react'
import { TOURNAMENT_SLUG } from '../config'
import { MAX_COURTS, saveDraft, slugify, type TournamentDraft } from '../logic/newTournament'
import { store } from '../store/store'

const FORMATS: { value: TournamentDraft['format']; label: string; points: number }[] = [
  { value: 'one', label: 'Jeden set', points: 15 },
  { value: 'bo3', label: 'Do 2 wygranych setów', points: 25 },
  { value: 'bo5', label: 'Do 3 wygranych setów', points: 25 },
]

/**
 * "Załóż turniej" (#nowy-turniej): name, address, date, courts and rules. The settings
 * stay on this device until the organiser sets the PIN in the new tournament's panel,
 * which saves the tournament in the database.
 */
export function NewTournament() {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('09:00')
  const [dayEnd, setDayEnd] = useState('18:00')
  const [courts, setCourts] = useState(4)
  const [slotMinutes, setSlotMinutes] = useState(20)
  const [format, setFormat] = useState<TournamentDraft['format']>('bo3')
  const [setPoints, setSetPoints] = useState(25)
  const [categories, setCategories] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const address = slugEdited ? slug : slugify(name)
  const cats = categories.split(/[\n,;]/).map((c) => c.trim()).filter(Boolean)
  const validTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)
  const ready = name.trim().length >= 3 && TOURNAMENT_SLUG.test(address) && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && validTime(time) && validTime(dayEnd)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    setError('')
    try {
      if (address === 'main' || await store.tournamentExists(address)) {
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
      categories: cats.length ? cats : ['Turniej'], format, setPoints,
    })
    location.href = `${location.pathname}?t=${address}#panel`
  }

  return (
    <div className="page new-t">
      <header className="org-head">
        <div>
          <p className="eyebrow">Nowy turniej</p>
          <h1>Załóż turniej</h1>
        </div>
      </header>
      <form className="panel new-t-form" onSubmit={submit}>
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
          <label>Liczba boisk
            <input type="number" min={1} max={MAX_COURTS} value={courts}
              onChange={(e) => setCourts(Math.max(1, Math.min(MAX_COURTS, Number(e.target.value) || 1)))} />
          </label>
          <label>Mecz co ile minut
            <input type="number" min={5} max={120} step={5} value={slotMinutes}
              onChange={(e) => setSlotMinutes(Math.max(5, Math.min(120, Number(e.target.value) || 5)))} />
          </label>
        </div>
        <div className="form-row">
          <label>Mecz
            <select value={format} onChange={(e) => {
              const f = FORMATS.find((x) => x.value === e.target.value)!
              setFormat(f.value)
              setSetPoints(f.points)
            }}>
              {FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </label>
          <label>Set do punktów
            <input type="number" min={5} max={50} value={setPoints}
              onChange={(e) => setSetPoints(Math.max(5, Math.min(50, Number(e.target.value) || 25)))} />
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
    </div>
  )
}
