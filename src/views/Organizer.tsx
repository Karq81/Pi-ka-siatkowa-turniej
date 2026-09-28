import { EntriesPanel } from './Registration'
import { currentSwissRound, hasSwiss, pairNextRound, swissOpen, swissRounds } from '../logic/swiss'
import { SlotCalc } from './NewTournament'
import { STAGE2 } from '../content/stage2'
import { openFirstStageMatches, openStage2Matches, stage2Groups } from '../logic/stage2'
import { downloadResults } from '../logic/export'
import { sportLabelOf } from '../logic/sports'
import { StreamSettings } from './Stream'
import { t, tk, tp } from '../i18n'
import { useState } from 'react'
import { scheduleOf } from '../logic/newTournament'
import { clubOf } from '../logic/draw'
import { retimeSchedule } from '../logic/schedule'
import { store, useSession, useStore, useSync } from '../store/store'
import { AdminPinForm, PinSettings, ResetPanel, setupTournament } from './Admin'
import type { Category, State } from '../types'
import { ConfirmDialog, NumberField, courtLabel, formatDay, formatTime, PinGate, useLookups } from '../ui'
import { CourtList } from './Court'
import { Setup } from './Setup'
import { IS_ALBATROS, IS_PLATFORM_HOST, TOURNAMENT_ID } from '../config'
import { deleteTournamentData, forgetTournament, useAccount } from '../store/accounts'
import { Competition } from './Competition'
import { isElimination } from '../logic/elimination'

const TABS = [
  { route: 'panel', label: tk('1. Zespoły i grupy') },
  { route: 'panel-grupy', label: tk('2. Grupy') },
  { route: 'panel-sedziowie', label: tk('3. Na żywo') },
  { route: 'panel-wiecej', label: tk('Więcej') },
]

/**
 * Organiser panel (#panel). Not linked from the public pages: teams and the organiser's
 * fixed groups → groups with the schedule → refereeing. There is no draw: the groups
 * come from the organiser's list.
 */
export function Organizer({ route }: { route: string }) {
  const state = useStore()
  const tab = TABS.some((x) => x.route === route) ? route : 'panel'
  const account = useAccount()
  const tabs = IS_ALBATROS ? TABS : TABS.map((x) => (x.route === 'panel' ? { ...x, label: tk('1. Zespoły i losowanie') }
    : x.route === 'panel-wiecej' ? { ...x, label: tk('Ustawienia i PIN') }
    : x.route === 'panel-grupy' && isElimination(state.tournament) ? { ...x, label: tk('2. Drabinka') } : x))
  return (
    <div className="page page-wide">
      <header className="org-head">
        <div>
          <p className="eyebrow">
            {t('Panel organizatora')}{state.tournament.rules.sport ? ` · ${sportLabelOf(state.tournament.rules)}` : ''}
            {account.status === 'signed-in' && <> · <a className="plain-link" href={IS_PLATFORM_HOST ? '/#lista-turniejow' : '#lista-turniejow'}>← {t('Moje turnieje')}</a></>}
          </p>
          <h1>{state.tournament.name}</h1>
          <button type="button" className="btn btn-sm export-btn" onClick={() => downloadResults(state)}
            title={t('Mecze, wyniki, tabele grup i klasyfikacja w pliku Excel (stan na teraz)')}>
            📊 {t('Pobierz wyniki do Excela')}
          </button>
        </div>
        <nav className="tabs" aria-label={t('Panel organizatora')}>
          {tabs.map((x) => (
            <a key={x.route} href={`#${x.route}`} className={tab === x.route ? 'active' : ''}>{t(x.label)}</a>
          ))}
        </nav>
      </header>
      {tab === 'panel' && !IS_ALBATROS && <PinGate label={t('Zgłoszenia drużyn (sędzia główny)')}><EntriesPanel state={state} /></PinGate>}
      {tab === 'panel' && (IS_ALBATROS ? <TeamsAndDraw state={state} /> : <Setup state={state} />)}
      {tab === 'panel-grupy' && state.categories.some((c) => hasSwiss(state, c.id)) && (
        <PinGate label={t('Kolejne rundy (sędzia główny)')}><SwissPanel state={state} /></PinGate>
      )}
      {tab === 'panel-grupy' && state.categories.some((c) => STAGE2[c.id]) && (
        <PinGate label={t('Mecze do rozegrania (sędzia główny)')}><Stage2Panel state={state} /></PinGate>
      )}
      {tab === 'panel-grupy' && (
        state.groups.length || state.matches.some((m) => m.ko?.bracket) ? <Competition state={state} route="grupy" /> : <Empty />
      )}
      {tab === 'panel-sedziowie' && (
        <>
          <CourtList />
          <MatchInterval state={state} />
          <PinGate label={t('Zerowanie wyników (sędzia główny)')}><ResetPanel state={state} /></PinGate>
        </>
      )}
      {tab === 'panel-wiecej' && <More />}
      {/* Albatros CUP keeps its PIN 1234 (the organisers agreed on it); other tournaments can change theirs. */}
      {tab === 'panel-wiecej' && <PinGate label={t('Transmisja wideo (sędzia główny)')}><StreamSettings state={state} /></PinGate>}
      {tab === 'panel-wiecej' && !IS_ALBATROS && <PinGate label={t('Zmiana PIN-u (sędzia główny)')}><PinSettings /></PinGate>}
      {tab === 'panel-wiecej' && !IS_ALBATROS && <PinGate label={t('Usuwanie turnieju (sędzia główny)')}><DeleteTournament state={state} /></PinGate>}
    </div>
  )
}

/** The chief referee deletes the whole tournament (asked first); then back to "Moje turnieje". */
function DeleteTournament({ state }: { state: State }) {
  const account = useAccount()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const remove = async () => {
    setAsking(false)
    setBusy(true)
    setError('')
    try {
      const pins = await store.getPins()
      if (!pins) throw new Error('no pins')
      await deleteTournamentData(TOURNAMENT_ID, pins.adminPin)
      if (account.status === 'signed-in') await forgetTournament(TOURNAMENT_ID).catch(() => {})
      location.href = `${location.origin}${location.pathname}${account.status === 'signed-in' ? '#lista-turniejow' : ''}`
    } catch (e) {
      console.warn('delete tournament', e)
      setError(t('Nie udało się usunąć turnieju. Sprawdź internet i spróbuj jeszcze raz.'))
      setBusy(false)
    }
  }
  return (
    <section className="panel danger-zone">
      <h2>🗑 {t('Usuń turniej')}</h2>
      <p className="muted">{t('Usuwa cały turniej: mecze, wyniki, tabele, zgłoszenia i PIN-y. Adres strony znów będzie wolny. Tego nie da się cofnąć, więc najpierw możesz pobrać wyniki do Excela (przycisk na górze panelu).')}</p>
      {error && <p className="error">{error}</p>}
      <button type="button" className="btn btn-danger" disabled={busy} onClick={() => setAsking(true)}>
        🗑 {busy ? t('Usuwam…') : t('Usuń turniej')}
      </button>
      {asking && (
        <ConfirmDialog
          question={<>
            <b>{t('Czy na pewno usunąć turniej „{name}”?', { name: state.tournament.name })}</b>
            <p>{t('Znikną wszystkie mecze, wyniki, tabele i zgłoszenia. Strona turnieju przestanie działać. Tego nie da się cofnąć.')}</p>
          </>}
          yes={t('Tak, usuń turniej')}
          no={t('Nie, zostaw')}
          onYes={() => void remove()}
          onNo={() => setAsking(false)}
        />
      )}
    </section>
  )
}

/**
 * Albatros CUP: starts the second stage of each category once its groups are played –
 * the ranking of group places makes the new groups and their timetable.
 */
function Stage2Panel({ state }: { state: State }) {
  const { teamName, groupName } = useLookups(state)
  const [show, setShow] = useState(false)
  const cats = state.categories.filter((c) => STAGE2[c.id]).map((c) => {
    const has2 = stage2Groups(state, c.id).length > 0
    return { c, phase: has2 ? t('drugi etap') : t('faza grupowa'), open: has2 ? openStage2Matches(state, c.id) : openFirstStageMatches(state, c.id) }
  })
  const total = cats.reduce((n, x) => n + x.open.length, 0)
  return (
    <section className="panel stage2-panel">
      <h2>🏐 {t('Mecze do rozegrania')}</h2>
      {cats.map(({ c, phase, open }) => (
        <p key={c.id} className="stage2-cat"><b>{c.name}</b> · {phase}: {open.length ? tp(open.length, 'został {n} mecz|zostały {n} mecze|zostało {n} meczów') : t('wszystkie mecze rozegrane')}</p>
      ))}
      {total > 0 && (
        <button type="button" className="btn btn-primary" aria-expanded={show} onClick={() => setShow(!show)}>
          {show ? t('Ukryj listę') : t('Które mecze zostały?')} ({total})
        </button>
      )}
      {show && cats.filter((x) => x.open.length).map(({ c, phase, open }) => (
        <div key={c.id} className="open-by-cat">
          <h3>{c.name} <span className="muted small">· {phase} · {tp(open.length, 'został {n} mecz|zostały {n} mecze|zostało {n} meczów')}</span></h3>
          <ul className="stage2-open">
            {open.map((m) => (
              <li key={m.id}>
                <span>{groupName(m.groupId)} · {t('Boisko {n}', { n: courtLabel(m.court) })} · {formatTime(m.start)}: <b>{teamName(m.teamA)}</b> – <b>{teamName(m.teamB)}</b></span>
                <a className="btn btn-sm btn-primary" href={`#korekta-${m.id}`}>{t('Wpisz wynik')}</a>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="muted small">{t('Kolejny etap uruchamiasz przyciskiem pod napisem „Faza grupowa” albo „Drugi etap” niżej.')}</p>
    </section>
  )
}

/**
 * Swiss system: the round being played, the games still open, and the button that pairs
 * the next round from the table (it pulses once every game of the round has a result).
 */
function SwissPanel({ state }: { state: State }) {
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const next = async (categoryId: string) => {
    setBusy(categoryId)
    const made = pairNextRound(state, categoryId)
    const ok = await store.replace({ ...state, matches: [...state.matches, ...made] })
    setBusy('')
    setMsg(ok ? t('Runda {r} rozlosowana: {n} spotkań.', { r: made[0]?.swissRound ?? '', n: made.filter((m) => !m.bye).length }) : t('Nie udało się zapisać. Sprawdź internet i spróbuj jeszcze raz.'))
  }
  return (
    <section className="panel stage2-panel">
      <h2>♟️ {t('System szwajcarski')}</h2>
      {state.categories.filter((c) => hasSwiss(state, c.id)).map((c) => {
        const round = currentSwissRound(state, c.id)
        const total = swissRounds(state, c.id)
        const open = swissOpen(state, c.id).length
        const done = round >= total && !open
        return (
          <div key={c.id} className="stage2-cat">
            <p><b>{c.name}</b> · {t('runda {r} z {n}', { r: round, n: total })} · {open ? tp(open, 'został {n} mecz|zostały {n} mecze|zostało {n} meczów') : t('wszystkie mecze rozegrane')}</p>
            {done ? <p className="phase-done">🏆 {t('Wszystkie rundy rozegrane. Tabela jest klasyfikacją końcową.')}</p> : (
              <button type="button" className={`btn btn-primary ${open ? '' : 'btn-pulse'}`} disabled={!!open || busy === c.id} onClick={() => void next(c.id)}>
                {busy === c.id ? t('Zapisuję…') : t('Losuj rundę {r}', { r: round + 1 })}
              </button>
            )}
          </div>
        )
      })}
      {msg && <p className="ok" role="status">{msg}</p>}
    </section>
  )
}

function Empty() {
  return (
    <p className="notice-inline">
      {t('Grupy nie są jeszcze zapisane w bazie. Ustaw PIN w zakładce')} <a href="#panel">{t('1. Zespoły i grupy')}</a>.
    </p>
  )
}

/** Step 1: every team by category and club, and the organiser's fixed groups. */
function TeamsAndDraw({ state }: { state: State }) {
  const sync = useSync()
  return (
    <>
      <div className="org-intro">
        <p className="muted">
          {t('Zespoły i grupy według listy organizatora. Grupy są ustalone na stałe (bez losowania): dwójki w 4 grupach po 7 zespołów, trójki w 5 grupach po 6 zespołów.')}
        </p>
      </div>
      {sync.empty && (
        <section className="panel">
          <h2>{t('Pierwsze uruchomienie')}</h2>
          <p>
            {t('Ustaw swój PIN sędziego głównego (co najmniej 4 cyfry). Zapisze on w bazie zespoły, grupy i terminarz. Będzie potrzebny do wpisywania i poprawiania wyników.')}
          </p>
          <AdminPinForm saveLabel={t('Ustaw PIN i zapisz turniej')} onSave={setupTournament} />
        </section>
      )}
      {!sync.empty && <MatchInterval state={state} />}
      <div className="org-cats">
        {state.categories.map((c) => <CategoryTeams key={c.id} state={state} category={c} />)}
      </div>
      <section className="panel">
        <h2>{t('Grupy')}</h2>
        <div className="org-draws">
          {state.categories.map((c) => <CategoryGroups key={c.id} state={state} category={c} />)}
        </div>
        {state.groups.length > 0 && (
          <div className="actions">
            <a className="btn btn-primary" href="#panel-grupy">{t('Zobacz grupy i terminarz')}</a>
            <a className="btn" href="#panel-sedziowie">{t('Na żywo')}</a>
          </div>
        )}
      </section>
    </>
  )
}

/**
 * How many minutes from one match to the next. Changing it re-times every match still
 * to be played (the next round keeps its time), so it also works during the tournament.
 */
function MatchInterval({ state }: { state: State }) {
  const plan = scheduleOf(state.tournament)
  const current = plan.slotMinutes
  const [minutes, setMinutes] = useState(current)
  const [rest, setRest] = useState(state.tournament.rest ?? 0)
  const [breakFrom, setBreakFrom] = useState(state.tournament.breaks?.[0]?.from ?? '')
  const [breakTo, setBreakTo] = useState(state.tournament.breaks?.[0]?.to ?? '')
  const okTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v)
  const breaks = okTime(breakFrom) && okTime(breakTo) && breakFrom < breakTo ? [{ from: breakFrom, to: breakTo }] : []
  const changed = minutes !== current || rest !== (state.tournament.rest ?? 0)
    || JSON.stringify(breaks) !== JSON.stringify(state.tournament.breaks ?? [])
  const [msg, setMsg] = useState('')
  const next = [...new Set(state.matches.filter((m) => m.status === 'scheduled').map((m) => m.start))].sort()[0]
  const save = async () => {
    const matches = retimeSchedule(state.matches, { slotMinutes: minutes, dayEnd: plan.dayEnd, dayStart: plan.dayStart, breaks })
    const { breaks: _b, rest: _r, ...base } = state.tournament
    void _b; void _r
    await store.replace({ ...state, tournament: { ...base, slotMinutes: minutes, ...(rest ? { rest } : {}), ...(breaks.length ? { breaks } : {}) }, matches })
    const last = matches.map((m) => m.start).sort().at(-1)
    setMsg(t('Zapisano: mecz co {n} min. Ostatni mecz: {last}.', { n: minutes, last: last ? `${formatDay(last)} ${formatTime(last)}` : '–' }))
  }
  return (
    <section className="panel">
      <h2>{t('Co ile minut mecze')}</h2>
      <p className="muted">
        {t('Teraz:')} <b>{t('mecz co {n} minut', { n: current })}</b> {t('na każdym boisku (mecz + przerwa).')}{' '}
        {next
          ? t('Zmiana przelicza godziny wszystkich meczów, które się jeszcze nie zaczęły, od najbliższej rundy ({when}), która zostaje o swojej godzinie.', { when: `${formatDay(next)} ${formatTime(next)}` })
          : t('Zmiana przelicza godziny wszystkich meczów, które się jeszcze nie zaczęły.')}{' '}
        {t('Rozegrane mecze się nie zmieniają. Po {end} gry przechodzą na następny dzień od {start}.', { end: plan.dayEnd, start: plan.dayStart })}
      </p>
      <PinGate label={t('Zmiana godzin meczów (sędzia główny)')}>
        <div className="form-row">
          <label>{t('Minut od meczu do meczu')}
            <NumberField id="slot-minutes" min={2} max={240} value={minutes} onChange={setMinutes} />
          </label>
          <label>{t('Przerwa w planie (np. obiad), od–do')}
            <span className="time-range">
              <input inputMode="numeric" placeholder="12:00" value={breakFrom} onChange={(e) => setBreakFrom(e.target.value)} aria-label={t('Przerwa od')} />
              <span>–</span>
              <input inputMode="numeric" placeholder="13:00" value={breakTo} onChange={(e) => setBreakTo(e.target.value)} aria-label={t('Przerwa do')} />
            </span>
          </label>
          <label>{t('Odpoczynek drużyny')}
            <select value={rest} onChange={(e) => setRest(Number(e.target.value))}>
              <option value={0}>{t('Może grać mecz po meczu')}</option>
              <option value={1}>{t('Co najmniej 1 runda przerwy')}</option>
              <option value={2}>{t('Co najmniej 2 rundy przerwy')}</option>
            </select>
            <span className="muted small">{t('Odpoczynek liczy się przy następnym losowaniu.')}</span>
          </label>
        </div>
        <SlotCalc onSlot={setMinutes} />
        <button className="btn btn-primary" disabled={!changed} onClick={save}>{t('Zapisz i przelicz godziny')}</button>
        {msg && <p className="ok">{msg}</p>}
      </PinGate>
    </section>
  )
}

function CategoryTeams({ state, category }: { state: State; category: Category }) {
  const teams = state.teams.filter((t) => t.categoryId === category.id)
  const clubs = [...new Set(teams.map(clubOf))]
  const groups = state.groups.filter((g) => g.categoryId === category.id)
  return (
    <section className="org-cat">
      <header>
        <h2>{category.name}</h2>
        <span className={`pill ${groups.length ? 'pill-done' : ''}`}>{groups.length ? tp(groups.length, '{n} grupa|{n} grupy|{n} grup') : t('Bez grup')}</span>
      </header>
      <p className="muted small">{t('Zespoły: {teams}, kluby: {clubs}', { teams: teams.length, clubs: clubs.length })}</p>
      <ul className="org-clubs">
        {clubs.map((club) => {
          const own = teams.filter((t) => clubOf(t) === club)
          return (
            <li key={club}>
              <span>{club}</span>
              <b title={t('Liczba zespołów')}>{tp(own.length, '{n} zespół|{n} zespoły|{n} zespołów')}</b>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** The fixed groups of one category, read-only. */
export function CategoryGroups({ state, category }: { state: State; category: Category }) {
  const { teamName } = useLookups(state)
  const groups = state.groups.filter((g) => g.categoryId === category.id)
  return (
    <div className="org-draw">
      <h3>{category.name}</h3>
      {groups.length ? (
        <div className="org-result">
          {groups.map((g) => (
            <div key={g.id} className="org-group">
              <b>{g.name}</b>
              <ol>{g.teamIds.map((id) => <li key={id}>{teamName(id)}</li>)}</ol>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">{t('Brak grup w bazie.')}</p>
      )}
    </div>
  )
}

const TILES = [
  { href: '#admin', title: tk('Sędzia główny'), text: tk('Wpisywanie i poprawianie wyników, klucze boisk, terminarz, drabinka, ustawienia punktacji.') },
  { href: '#kartki', title: tk('Kartki z kodami QR'), text: tk('Do wydruku i przyklejenia przy boiskach: kod QR do panelu boiska i klucz.') },
  { href: '#tv', title: tk('Tryb TV'), text: tk('Na telewizor lub rzutnik na hali: boiska, tabele i drabinki zmieniają się same.') },
  { href: '#', title: tk('Strona dla kibiców'), text: tk('To, co widzą rodzice i trenerzy: informacje, wyniki, grupy. Bez możliwości wpisywania.') },
]

function More() {
  const session = useSession()
  return (
    <>
      <ul className="organizer">
        {TILES.map((x) => (
          <li key={x.href}>
            <a href={x.href}>
              <b>{t(x.title)}</b>
              <span className="muted small">{t(x.text)}</span>
            </a>
          </li>
        ))}
      </ul>
      {session && (
        <p className="muted small">
          {session.role === 'admin'
            ? t('Ten telefon jest zalogowany jako sędzia główny.')
            : t('Ten telefon jest zalogowany jako sędzia boiska {court}.', { court: courtLabel(session.court ?? 0) })}{' '}
          <button className="linklike" onClick={() => store.logout()}>{t('Wyloguj')}</button>
        </p>
      )}
    </>
  )
}
