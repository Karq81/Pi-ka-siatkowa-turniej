import { NumberField } from '../ui'
import { t, tp } from '../i18n'
import { useState } from 'react'
import { checkCustom } from '../logic/custom'
import { ALBATROS_ALIAS, TOURNAMENT_SLUG } from '../config'
import { MAX_COURTS, saveDraft, slugify, type DraftSettings, type TournamentDraft } from '../logic/newTournament'
import { draftSettings } from '../logic/assistantPrompt'
import { TIEBREAK_NAMES } from '../logic/scoring'
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
  // "Inna dyscyplina": its real name, e.g. Zapasy.
  const [customName, setCustomName] = useState('')
  // Judo: contest minutes typed by the organiser ('' = the format's time).
  const [fightMinutes, setFightMinutes] = useState('')
  const pickSport = (id: string) => {
    const next = sportById(id)
    setSportId(id)
    setFormat(next.formats[0].id)
    setSlotMinutes(next.formats[0].slot ?? next.slot)
    setFightMinutes('')
  }
  const fightSeconds = fightMinutes ? Math.round(Number(fightMinutes.replace(',', '.')) * 60) || undefined : undefined
  const rules = sportRules(sport, format, setPoints, fightSeconds)
  // Judo and karate: a bout of fixed time, on mats.
  const judo = rules.scoring === 'judo' || rules.scoring === 'karate'
  const score = rules.scoring === 'score'
  // Runs, jumps, golf…: no matches, each participant has a result.
  const measuredEvent = rules.scoring === 'measured'
  const [categories, setCategories] = useState('')
  const [system, setSystem] = useState<'groups' | 'knockout' | 'double' | 'custom' | 'swiss' | 'stepladder' | 'consolation' | 'americano' | 'mexicano' | 'king' | 'ladder'>('groups')
  // Further settings read by the AI assistant (bracket options, play-off, two legs, tie-breakers…).
  const [settings, setSettings] = useState<DraftSettings | undefined>()
  const [thirdPlace, setThirdPlace] = useState(true)
  const [twice, setTwice] = useState(false)
  const [swissRounds, setSwissRounds] = useState(5)
  const [rest, setRest] = useState(0)
  const [breakFrom, setBreakFrom] = useState('')
  const [breakTo, setBreakTo] = useState('')
  const [preset, setPreset] = useState<TournamentDraft['preset']>()
  const planCount = preset?.reduce((n, p) => n + (p.matches?.length ?? 0), 0) ?? 0
  // Plan sides that do not match the list (a typo, a player left out): shown before saving.
  const planProblems = (preset ?? []).flatMap((p) => p.matches?.length
    ? checkCustom(p.matches, p.teams.map((x) => x.replace(/^[^:]*:\s*/, '')), p.groups.length ? p.groups.map((_, i) => ({ name: t('Grupa {letter}', { letter: 'ABCDEFGHIJKL'[i] ?? String(i + 1) }) })) : null, 12)
    : [])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const address = slugEdited ? slug : slugify(name)
  const cats = categories.split(/[\n,;]/).map((c) => c.trim()).filter(Boolean)
  const validTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v)
  const breaks = validTime(breakFrom) && validTime(breakTo) && breakFrom < breakTo ? [{ from: breakFrom, to: breakTo }] : []
  // What is still missing, in plain words; shown in red once "Dalej" was pressed.
  const [tried, setTried] = useState(false)
  const missing = {
    name: name.trim().length < 3 ? t('Wpisz nazwę turnieju (co najmniej 3 znaki).') : '',
    address: name.trim().length >= 3 && !TOURNAMENT_SLUG.test(address) ? t('Link dla kibiców: tylko małe litery, cyfry i myślniki (3–40 znaków).') : '',
    date: !/^\d{4}-\d{2}-\d{2}$/.test(date) ? t('Wybierz dzień pierwszego meczu.') : '',
    time: !validTime(time) ? t('Godzina startu w formacie GG:MM, np. 09:00.') : '',
    dayEnd: !validTime(dayEnd) ? t('Godzina ostatniego meczu w formacie GG:MM, np. 18:00.') : '',
  }
  const problems = Object.values(missing).filter(Boolean)
  const ready = problems.length === 0
  const bad = (k: keyof typeof missing) => (tried && missing[k] ? 'field-bad' : undefined)

  /** Fills the form with the AI assistant's draft; teams and groups go with the tournament. */
  const applyDraft = (d: AssistantDraft) => {
    const s = sportById(d.sport)
    setSportId(s.id)
    setFormat(s.formats.some((f) => f.id === d.format) ? d.format : s.formats[0].id)
    setCustomName(s.custom ? d.sportName?.trim() ?? '' : '')
    if (d.name) { setName(d.name); setSlugEdited(false) }
    if (/^\d{4}-\d{2}-\d{2}$/.test(d.date)) setDate(d.date)
    if (validTime(d.time)) setTime(d.time)
    if (validTime(d.dayEnd)) setDayEnd(d.dayEnd)
    if (d.courts > 0) setCourts(Math.min(MAX_COURTS, d.courts))
    setSlotMinutes(d.slotMinutes > 0 ? Math.min(120, d.slotMinutes) : s.slot)
    setCategories(d.categories.map((c) => c.name).join('\n'))
    setPreset(d.categories.map((c) => ({
      category: c.name, teams: c.teams, groups: c.groups,
      matches: (c.matches ?? []).filter((m) => m.name && m.a && m.b).map((m) => ({
        name: m.name, a: m.a, b: m.b, ...(m.place > 0 ? { place: m.place } : {}), ...(m.loserPlace > 0 ? { loserPlace: m.loserPlace } : {}),
      })),
    })))
    setTwice(!!d.twice)
    if (d.system && d.system !== 'measured') setSystem(d.system)
    if (typeof d.thirdPlace === 'boolean') setThirdPlace(d.thirdPlace)
    if (d.swissRounds && d.swissRounds > 0) setSwissRounds(Math.min(15, d.swissRounds))
    if (typeof d.restRounds === 'number') setRest(Math.max(0, Math.min(2, d.restRounds)))
    if (d.breakFrom && d.breakTo && validTime(d.breakFrom) && validTime(d.breakTo)) { setBreakFrom(d.breakFrom); setBreakTo(d.breakTo) }
    const extra = draftSettings({ ...d, system: s.formats[0].rules.scoring === 'measured' ? 'measured' : d.system })
    setSettings(Object.keys(extra).length ? extra : undefined)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
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
      sportName: sport.custom && customName.trim() ? customName.trim() : undefined,
      preset,
      system: measuredEvent ? 'measured' : system,
      thirdPlace: system === 'knockout' ? thirdPlace : undefined,
      twice: system === 'groups' && twice ? true : undefined,
      swissRounds: system === 'swiss' ? swissRounds : undefined,
      rest: rest || undefined,
      breaks: breaks.length ? breaks : undefined,
      settings,
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
        <p className="muted">{t('Turniej zapisze się na koncie:')} <b>{account.account.name || account.account.login}</b>. <a href="#lista-turniejow">{t('Moje turnieje')}</a></p>
      )}
      <Assistant signedIn={account.status === 'signed-in'} onDraft={applyDraft} />
      {preset && preset.some((p) => p.teams.length) && (
        <p className="notice-inline">
          {t('Z notatek:')} {preset.map((p) => `${p.category}: ${tp(p.teams.length, '{n} drużyna|{n} drużyny|{n} drużyn')}${p.groups.length ? `, ${tp(p.groups.length, '{n} grupa|{n} grupy|{n} grup')}` : ''}`).join(' · ')}.
          {' '}{t('Zapiszą się razem z turniejem.')} <button className="linklike" onClick={() => setPreset(undefined)}>{t('Nie używaj')}</button>
        </p>
      )}
      {settings && (
        <p className="notice-inline">
          {t('Asystent ustawił też:')} {settingsSummary(settings).join(' · ')}.
          {' '}{t('Wszystko zmienisz potem w panelu, w „1. Zespoły i losowanie”.')} <button className="linklike" onClick={() => setSettings(undefined)}>{t('Nie używaj')}</button>
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
        {sport.custom && (
          <label>{t('Nazwa dyscypliny')}
            <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder={t('np. Zapasy, Boks, Siatkonoga')} maxLength={40} />
            <span className="muted small">{t('Taka nazwa pokaże się na stronie turnieju.')}</span>
          </label>
        )}
        <div className="form-row">
          <label>{t('Format meczu')}
            <select value={format} onChange={(e) => {
              setFormat(e.target.value)
              setFightMinutes('')
              const f = sport.formats.find((x) => x.id === e.target.value)
              setSlotMinutes(f?.slot ?? sport.slot)
            }}>
              {sport.formats.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </label>
          {judo && (
            <label>{t('Czas walki (minuty)')}
              <input inputMode="decimal" value={fightMinutes || String((rules.fightSeconds ?? 240) / 60).replace('.', ',')}
                onChange={(e) => setFightMinutes(e.target.value.replace(/[^\d.,]/g, '').slice(0, 4))} />
              <span className="muted small">{rules.scoring === 'judo' ? t('Np. 4, 3, 2 albo 1,5. Po czasie przy remisie: golden score.') : t('Np. 3, 2 albo 1,5.')}</span>
            </label>
          )}
          {sport.custom && !score && !judo && (
            <label>{t('Set do punktów')}
              <NumberField min={3} max={99} value={setPoints} onChange={setSetPoints} />
            </label>
          )}
        </div>
        <div className="sport-note">
          <p>{sport.note}</p>
          <p className="muted small">
            {rules.scoring === 'judo'
              ? `${t('Czas walki: {time}, przy remisie golden score (bez limitu czasu).', { time: clock(rules.fightSeconds ?? 240) })}`
              : rules.scoring === 'karate'
                ? `${t('Czas walki: {time}, przy remisie senshu albo decyzja sędziów.', { time: clock(rules.fightSeconds ?? 180) })}`
                : rules.scoring === 'chess'
                  ? t('Wynik partii: 1–0, ½–½ albo 0–1.')
                : measuredEvent
                  ? t('Bez meczów: każdy uczestnik ma swój wynik. Najpierw serie albo rundy, potem finał lub klasyfikacja.')
              : score
                ? `${t('Wynik:')} ${t(rules.unit ?? 'punkty')}, ${rules.draws ? t('remis możliwy') : t('bez remisów')}.`
                : `${t('Zasady:')} ${describeSets(rules)}.`}
            {!measuredEvent && <>
            {' '}{t('Tabela:')} {t('wygrana {n} pkt', { n: sport.table[0] })}
            {rules.draws || rules.setsMode === 'fixed' && rules.sets % 2 === 0 ? `, ${t('remis {n} pkt', { n: sport.table[1] })}` : ''}
            , {t('porażka {n} pkt', { n: sport.table[2] })}.
            </>}
            {' '}{t('Uczestnicy:')} {t(sport.entrants)}.
          </p>
        </div>
        <label className={bad('name')}>{t('Nazwa turnieju')} <span className="req">*</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('np. Halówka Mielno 2027')} />
          {tried && missing.name && <span className="error small">{missing.name}</span>}
        </label>
        {slugEdited ? (
          <label className={bad('address')}>{t('Link dla kibiców')}
            <span className="new-t-address">
              <span className="muted">{location.host}/?t=</span>
              <input value={address} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40))} />
            </span>
            {tried && missing.address ? <span className="error small">{missing.address}</span> : <span className="muted small">{t('Małe litery, cyfry i myślniki.')}</span>}
          </label>
        ) : (
          <p className="new-t-link muted small">
            {t('Link dla kibiców utworzy się sam z nazwy turnieju:')}{' '}
            <b>{location.host}/?t={address || '…'}</b>{' '}
            <button type="button" className="linklike" onClick={() => { setSlug(address); setSlugEdited(true) }}>{t('zmień')}</button>
          </p>
        )}
        <div className="form-row">
          <label className={bad('date')}>{t('Dzień pierwszego meczu')} <span className="req">*</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            {tried && missing.date && <span className="error small">{missing.date}</span>}
          </label>
          <label className={bad('time')}>{t('Godzina (GG:MM)')} <span className="req">*</span>
            <input inputMode="numeric" value={time} onChange={(e) => setTime(e.target.value)} placeholder="09:00" />
            {tried && missing.time && <span className="error small">{missing.time}</span>}
          </label>
          <label className={bad('dayEnd')}>{t('Ostatni mecz dnia najpóźniej o')} <span className="req">*</span>
            <input inputMode="numeric" value={dayEnd} onChange={(e) => setDayEnd(e.target.value)} placeholder="18:00" />
            {tried && missing.dayEnd && <span className="error small">{missing.dayEnd}</span>}
          </label>
        </div>
        <div className="form-row">
          <label>{judo ? t('Liczba mat') : t('Liczba boisk (kortów, stołów)')}
            <NumberField min={1} max={MAX_COURTS} value={courts} onChange={setCourts} />
          </label>
          <label>{judo ? t('Walka co ile minut (z przerwą)') : t('Mecz co ile minut')}
            <NumberField min={2} max={120} value={slotMinutes} onChange={setSlotMinutes} />
            {judo && <span className="muted small">{t('Czas walki z zatrzymaniami i przerwą na zmianę zawodników. Zwykle 5–7 minut.')}</span>}
          </label>
        </div>
        <SlotCalc onSlot={setSlotMinutes} />
        <div className="form-row">
          <label>{t('Odpoczynek drużyny')}
            <select value={rest} onChange={(e) => setRest(Number(e.target.value))}>
              <option value={0}>{t('Może grać mecz po meczu')}</option>
              <option value={1}>{t('Co najmniej 1 runda przerwy')}</option>
              <option value={2}>{t('Co najmniej 2 rundy przerwy')}</option>
            </select>
          </label>
          <label>{t('Przerwa w planie (np. obiad), od–do')}
            <span className="time-range">
              <input inputMode="numeric" placeholder="12:00" value={breakFrom} onChange={(e) => setBreakFrom(e.target.value)} aria-label={t('Przerwa od')} />
              <span>–</span>
              <input inputMode="numeric" placeholder="13:00" value={breakTo} onChange={(e) => setBreakTo(e.target.value)} aria-label={t('Przerwa do')} />
            </span>
          </label>
        </div>
        {!measuredEvent && <fieldset className="system-pick">
          <legend>{t('System turnieju')}</legend>
          {([
            ['groups', t('Grupy (każdy z każdym), potem drabinka'), t('Najpierw grupy, w których każdy gra z każdym; potem mecze o miejsca.')],
            ['knockout', t('Drabinka pucharowa'), t('Od razu drabinka: przegrany odpada. Przy nieparzystej liczbie część dostaje wolny los.')],
            ['double', t('Podwójna eliminacja (drabinka przegranych)'), t('Po pierwszej porażce spada się do drabinki przegranych, po drugiej odpada. Na koniec wielki finał (z rewanżem, gdy wygra ten z drabinki przegranych).')],
            ['stepladder', t('Drabinka schodkowa (od najsłabszego do najlepszego)'), t('Wpisz zawodników od najlepszego do najsłabszego. Dwóch najsłabszych gra pierwsze spotkanie, zwycięzca gra z kolejnym wyżej, aż do finału z numerem 1.')],
            ['consolation', t('Drabinka pucharowa z turniejem pocieszenia'), t('Przegrany odpada z głównej drabinki, ale przegrani z pierwszej rundy grają swoją drabinkę pocieszenia, więc każdy rozegra co najmniej dwa spotkania.')],
            ['swiss', t('System szwajcarski (szachy, darts)'), t('Wszyscy grają w każdej rundzie, z rywalami o podobnej liczbie punktów, nigdy dwa razy z tym samym. Kolejną rundę losujesz po zakończeniu poprzedniej.')],
            ['americano', t('Americano (co rundę inny partner)'), t('Co rundę inny partner. Każdy zbiera punkty zdobyte przez swoją parę.')],
            ['mexicano', t('Mexicano (pary według tabeli)'), t('Każdy zbiera punkty zdobyte przez swoją parę. Od 2. rundy pary według tabeli: 1. i 4. przeciw 2. i 3.')],
            ['king', t('Król kortu (zwycięzca zostaje)'), t('Zwycięzca zostaje na korcie, przegrany idzie na koniec kolejki. Liczą się wygrane, potem najdłuższa seria.')],
            ['ladder', t('Drabinka rankingowa (wyzwania)'), t('Wpisz zawodników w kolejności rankingu. Zawodnik wyzywa kogoś najwyżej 3 miejsca wyżej i zajmuje jego miejsce, gdy wygra.')],
          ] as const).map(([id, label, hint]) => (
            <label key={id} className={`system-opt ${system === id ? 'on' : ''}`}>
              <input type="radio" name="system" checked={system === id} onChange={() => setSystem(id)} />
              <span><b>{label}</b><span className="muted small">{hint}</span></span>
            </label>
          ))}
          {system === 'knockout' && (
            <label className="check"><input type="checkbox" checked={thirdPlace} onChange={(e) => setThirdPlace(e.target.checked)} /> {t('Spotkanie o 3. miejsce')}</label>
          )}
          {system === 'swiss' && (
            <label>{t('Liczba rund')}
              <NumberField min={1} max={15} value={swissRounds} onChange={setSwissRounds} />
            </label>
          )}
          {system === 'groups' && (
            <label className="check"><input type="checkbox" checked={twice} onChange={(e) => setTwice(e.target.checked)} /> {t('Każdy z każdym dwa razy (rewanże)')}</label>
          )}
          {planCount > 0 && (
            <label className={`system-opt ${system === 'custom' ? 'on' : ''}`}>
              <input type="radio" name="system" checked={system === 'custom'} onChange={() => setSystem('custom')} />
              <span><b>{t('Plan własny (z opisu turnieju)')}</b><span className="muted small">{t('Asystent ułożył {n} spotkań według Twojego opisu. Kolejne spotkania wypełnią się same po wpisaniu wyników.', { n: planCount })}</span></span>
            </label>
          )}
          {planCount > 0 && planProblems.length > 0 && (
            <div className="error small"><b>{t('W planie coś się nie zgadza (te spotkania zostaną pominięte):')}</b><ul>{planProblems.slice(0, 8).map((x) => <li key={x}>{x}</li>)}</ul></div>
          )}
        </fieldset>}
        <label>{t('Kategorie (każda w osobnej linii lub po przecinku)')}
          <textarea rows={3} value={categories} onChange={(e) => setCategories(e.target.value)}
            placeholder={t('np. Dziewczęta U12\nChłopcy U12')} />
          <span className="muted small">{t('Puste pole: jedna kategoria dla wszystkich drużyn.')}</span>
        </label>
        {tried && problems.length > 0 && (
          <div className="error form-missing" role="alert">
            <b>{t('Zanim przejdziesz dalej, uzupełnij pola zaznaczone na czerwono:')}</b>
            <ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        )}
        {error && <p className="error">{error}</p>}
        <p className="muted small"><span className="req">*</span> {t('pole obowiązkowe')}</p>
        <div className="actions">
          <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>
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

/**
 * "Mecz co ile minut" from its parts: playing time + the break inside the match + changing
 * teams on the court. Fills in the interval when all three are typed.
 */
export function SlotCalc({ onSlot }: { onSlot: (minutes: number) => void }) {
  const [play, setPlay] = useState('')
  const [pause, setPause] = useState('')
  const [change, setChange] = useState('')
  const num = (s: string) => Number(s.replace(',', '.')) || 0
  const total = Math.round(num(play) + num(pause) + num(change))
  return (
    <details className="slot-calc">
      <summary>{t('Policz „co ile minut” z czasu gry')}</summary>
      <div className="form-row">
        <label>{t('Czas gry (min), np. 2 × 12 = 24')}<input inputMode="decimal" value={play} onChange={(e) => setPlay(e.target.value)} /></label>
        <label>{t('Przerwa w meczu (min)')}<input inputMode="decimal" value={pause} onChange={(e) => setPause(e.target.value)} /></label>
        <label>{t('Zmiana drużyn na boisku (min)')}<input inputMode="decimal" value={change} onChange={(e) => setChange(e.target.value)} /></label>
      </div>
      {total > 0 && (
        <p className="small">{t('Slot meczu: {n} min, czyli ok. {m} meczów na godzinę na jednym boisku.', { n: total, m: (60 / total).toFixed(1).replace('.', ',') })}{' '}
          <button type="button" className="btn btn-sm btn-primary" onClick={() => onSlot(Math.min(240, Math.max(2, total)))}>{t('Ustaw {n} min', { n: total })}</button>
        </p>
      )}
    </details>
  )
}

/** The assistant's further settings in plain words, for the organiser to see before saving. */
function settingsSummary(x: DraftSettings): string[] {
  const out: string[] = []
  if (x.advance) out.push(x.advance.best ? t('drabinka dla {n} najlepszych z każdej grupy i {b} z kolejnego miejsca', { n: x.advance.perGroup, b: x.advance.best }) : t('drabinka dla {n} najlepszych z każdej grupy', { n: x.advance.perGroup }))
  if (x.bronzes) out.push(t('dwa brązowe medale'))
  if (x.allPlaces) out.push(t('wszyscy grają o miejsca'))
  if (x.seeding === 'list') out.push(t('rozstawienie z listy'))
  if (x.separateClubs) out.push(t('kluby w różnych połówkach drabinki'))
  if (x.ties?.kind === 'two') out.push(x.ties.awayGoals ? t('dwumecze (bramki na wyjeździe)') : t('dwumecze'))
  if (x.ties?.kind === 'series') out.push(t('serie do {n} meczów', { n: x.ties.n ?? 3 }))
  if (x.measured?.mode === 'heats') out.push(t('serie i finał (Q {Q}, q {q})', { Q: x.measured.Q ?? 0, q: x.measured.q ?? 0 }))
  if (x.measured?.mode === 'rounds') out.push(t('rundy z punktami za miejsca'))
  if (x.tiebreak?.length) out.push(`${t('przy równych punktach:')} ${x.tiebreak.map((k) => t(TIEBREAK_NAMES[k]).toLowerCase()).join(' → ')}`)
  if (x.h2hReapply) out.push(t('mecze bezpośrednie liczone od nowa'))
  if (x.withdrawal) out.push(x.withdrawal === 'A' ? t('wycofanie: opcja A') : t('wycofanie: zawsze walkowery'))
  return out
}
