import { TOURNAMENT_ID } from '../config'
import { AttachButtons, PhotoTip } from './Attach'
import { t, tk } from '../i18n'
import { useState, useSyncExternalStore } from 'react'
import { tournamentUrl } from '../config'
import { clubOf, drawCategory, shuffle } from '../logic/draw'
import { createElimination, hasElimination, isElimination, systemOf } from '../logic/elimination'
import { parseTeamList, scheduleOf, suspiciousNames } from '../logic/newTournament'
import { SPORTS } from '../logic/sports'
import { store, useSync } from '../store/store'
import type { Category, State } from '../types'
import { NumberField, formatDay, formatTime, PinGate } from '../ui'
import { AdminPinForm, setupTournament } from './Admin'
import { CategoryGroups } from './Organizer'

/**
 * Step 1 of the organiser panel for a tournament created on "Załóż turniej":
 * save the PIN, enter each category's teams and draw them into groups. The draw
 * keeps teams of one club apart and builds the whole group-stage timetable.
 */
export function Setup({ state }: { state: State }) {
  const sync = useSync()
  if (sync.empty) {
    return (
      <section className="panel">
        <h2>{t('Ostatni krok: PIN sędziego głównego')}</h2>
        <p>
          {t('Ustaw PIN (co najmniej 4 cyfry) i zapisz go. Tylko nim można wpisywać zespoły, losować grupy i poprawiać wyniki. Klucze dla sędziów boisk wygenerują się same.')}
        </p>
        <AdminPinForm saveLabel={t('Utwórz turniej')} onSave={setupTournament} />
      </section>
    )
  }
  const last = state.matches.map((m) => m.start).sort().at(-1)
  return (
    <>
      <TournamentLinks />
      <div className="org-intro">
        {isElimination(state.tournament) ? (
          <p className="muted">
            {t('Wpisz uczestników i rozlosuj drabinkę. Terminarz ułoży się sam: start {start}, stanowisk: {courts}, co {slot} min.', {
              start: `${formatDay(scheduleOf(state.tournament).start)} ${formatTime(scheduleOf(state.tournament).start)}`,
              courts: state.tournament.courts,
              slot: scheduleOf(state.tournament).slotMinutes,
            })}
          </p>
        ) : (
        <p className="muted">
          {t('Wpisz zespoły każdej kategorii i rozlosuj je do grup. Losowanie rozdziela zespoły z tego samego klubu i od razu układa terminarz: start {start}, boisk: {courts}, mecz co {slot} min.', {
            start: `${formatDay(scheduleOf(state.tournament).start)} ${formatTime(scheduleOf(state.tournament).start)}`,
            courts: state.tournament.courts,
            slot: scheduleOf(state.tournament).slotMinutes,
          })}
          {last && <> {t('Ostatni mecz grupowy:')} <b>{formatDay(last)} {formatTime(last)}</b>.</>}
        </p>
        )}
      </div>
      <PinGate label={t('Zespoły i losowanie (sędzia główny)')}>
        <SystemSetting state={state} />
        <div className="setup-cats">
          {state.categories.map((c) => <CategorySetup key={`${c.id}:${state.teams.filter((x) => x.categoryId === c.id).length}`} state={state} category={c} />)}
        </div>
      </PinGate>
      {isElimination(state.tournament) && state.categories.some((c) => hasElimination(state, c.id)) && (
        <section className="panel">
          <h2>{t('Drabinka')}</h2>
          <p className="muted">{t('Drabinka jest rozlosowana, terminarz gotowy. Kolejne rundy wypełniają się same po wpisaniu wyników.')}</p>
          <div className="actions">
            <a className="btn btn-primary" href="#panel-grupy">{t('Zobacz drabinkę i terminarz')}</a>
            <a className="btn" href="#panel-sedziowie">{t('Na żywo')}</a>
          </div>
        </section>
      )}
      {!isElimination(state.tournament) && state.groups.length > 0 && (
        <section className="panel">
          <h2>{t('Grupy')}</h2>
          <div className="org-draws">
            {state.categories.map((c) => <CategoryGroups key={c.id} state={state} category={c} />)}
          </div>
          <div className="actions">
            <a className="btn btn-primary" href="#panel-grupy">{t('Zobacz grupy i terminarz')}</a>
            <a className="btn" href="#panel-sedziowie">{t('Na żywo')}</a>
          </div>
        </section>
      )}
    </>
  )
}

/** How the tournament is played; changing it needs a new draw. */
function SystemSetting({ state }: { state: State }) {
  const system = systemOf(state.tournament)
  const options = [
    ['groups', t('Grupy (każdy z każdym), potem drabinka')],
    ['knockout', t('Drabinka pucharowa')],
    ['double', t('Podwójna eliminacja (drabinka przegranych)')],
  ] as const
  return (
    <section className="panel system-setting">
      <label>{t('System turnieju')}
        <select value={system} onChange={(e) => store.updateTournament({ system: e.target.value as 'groups' | 'knockout' | 'double' })}>
          {options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      {system === 'knockout' && (
        <label className="check"><input type="checkbox" checked={!!state.tournament.thirdPlace} onChange={(e) => store.updateTournament({ thirdPlace: e.target.checked })} /> {t('Spotkanie o 3. miejsce')}</label>
      )}
      <p className="muted small">
        {system === 'groups' ? t('Najpierw grupy, w których każdy gra z każdym; potem mecze o miejsca.')
          : system === 'knockout' ? t('Od razu drabinka: przegrany odpada. Przy nieparzystej liczbie część dostaje wolny los.')
            : t('Po pierwszej porażce spada się do drabinki przegranych, po drugiej odpada. Na koniec wielki finał (z rewanżem, gdy wygra ten z drabinki przegranych).')}
        {' '}{t('Po zmianie systemu kliknij losowanie jeszcze raz.')}
      </p>
    </section>
  )
}

/** "Zespoły", "Zawodnicy", "Pary"… for the tournament's discipline. */
function entrantsLabel(state: State): string {
  const e = SPORTS.find((s) => s.label === state.tournament.rules.sport)?.entrants ?? 'drużyny'
  return t({ 'drużyny': tk('Zespoły'), zawodnicy: tk('Zawodnicy'), pary: tk('Pary'), 'zawodnicy lub pary': tk('Zawodnicy lub pary') }[e])
}

/** The last draw's message per category: it stays when the list redraws after the draw. */
const drawMessages = new Map<string, string>()
const drawListeners = new Set<() => void>()
function setDrawMessage(key: string, m: string) {
  drawMessages.set(key, m)
  drawListeners.forEach((l) => l())
}
/** Read live, so the list drawn again after the draw (a new component) shows the final message too. */
function useDrawMessage(key: string): string {
  return useSyncExternalStore((l) => { drawListeners.add(l); return () => drawListeners.delete(l) }, () => drawMessages.get(key) ?? '')
}


/** One category: its team list and the draw into groups. */
function CategorySetup({ state, category }: { state: State; category: Category }) {
  const current = state.teams.filter((t) => t.categoryId === category.id)
  // What is typed stays on this device until the draw, so a reload (or the panel redrawing
  // while the tournament is being created) never loses the list.
  const draftKey = `sla:teams:${TOURNAMENT_ID}:${category.id}:${current.length}`
  const [text, setTextState] = useState(() => {
    try { const d = sessionStorage.getItem(draftKey); if (d !== null) return d } catch { /* no storage */ }
    // "Klub: Drużyna" only where the club is not already part of the team's name.
    return current.map((t) => (t.name.startsWith(clubOf(t)) ? t.name : `${clubOf(t)}: ${t.name}`)).join('\n')
  })
  const setText = (v: string) => {
    setTextState(v)
    try { sessionStorage.setItem(draftKey, v) } catch { /* no storage */ }
  }
  const teams = parseTeamList(text, category.id)
  const drawn = state.groups.filter((g) => g.categoryId === category.id).length
  // Suggested from the list (about 5 per group) until the organiser sets it.
  const [chosenGroups, setGroups] = useState<number | null>(drawn || null)
  const groups = chosenGroups ?? Math.max(1, Math.min(12, Math.round(teams.length / 5)))
  const msgKey = `${TOURNAMENT_ID}:${category.id}`
  const msg = useDrawMessage(msgKey)
  const setMsg = (m: string) => setDrawMessage(msgKey, m)
  const [odd, setOdd] = useState<string[] | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState('')

  /** Photo, file or the typed text (notes or an instruction) → a clean list, from the AI assistant. */
  const organize = async (files: File[] = []) => {
    setAiBusy(true)
    setAiError('')
    try {
      const { organizeTeams } = await import('../store/assistant')
      // A photo or file adds to the list; the button alone tidies up what is typed.
      const list = await organizeTeams(files.length ? '' : text, files)
      if (list) setText(files.length && text.trim() ? `${text.trim()}\n${list}` : list)
      else setAiError(t('Asystent nie znalazł żadnych drużyn.'))
    } catch (e) {
      setAiError(e instanceof Error ? e.message : t('Asystent jest chwilowo niedostępny.'))
    } finally {
      setAiBusy(false)
    }
  }
  const played = state.matches.some((m) => m.status !== 'scheduled' && !m.skipped)
  const bracket = isElimination(state.tournament)

  const draw = async (list = teams, checked = false) => {
    // Pasted notes: lines that are not names are shown first, so they do not end up in the groups.
    if (!checked) {
      const strange = suspiciousNames(list.map((x) => x.name))
      if (strange.length) { setOdd(strange); return }
    }
    if (played && !confirm(t('Są już wpisane wyniki. Nowe losowanie ułoży terminarz od nowa i usunie wszystkie wyniki. Losować?'))) return
    if (bracket) {
      // Knockout from the start: the players in random order, byes where the bracket needs them.
      const others = state.teams.filter((t) => t.categoryId !== category.id)
      const sched = scheduleOf(state.tournament)
      const base: State = {
        ...state, teams: [...others, ...list],
        groups: state.groups.filter((g) => g.categoryId !== category.id),
        matches: state.matches.filter((m) => m.categoryId !== category.id),
      }
      const courts = Array.from({ length: state.tournament.courts }, (_, i) => i + 1)
      const matches = createElimination(base, category.id, shuffle(list.map((x) => x.id), Math.random), { start: sched.start, slotMinutes: sched.slotMinutes, courts })
      setMsg(t('Zapisuję…'))
      if (!(await store.replace({ ...base, matches: [...base.matches, ...matches] }))) {
        setMsg(t('Nie udało się zapisać losowania. Sprawdź internet i kliknij jeszcze raz.'))
        return
      }
      try { sessionStorage.removeItem(draftKey) } catch { /* no storage */ }
      setMsg(`${t('Rozlosowano drabinkę: {n} uczestników, {m} spotkań.', { n: list.length, m: matches.length })} ${t('Terminarz gotowy.')}`)
      return
    }
    // At least two teams per group.
    const count = Math.max(1, Math.min(groups, Math.floor(list.length / 2)))
    const others = state.teams.filter((t) => t.categoryId !== category.id)
    const next = drawCategory({ ...state, teams: [...others, ...list] }, category.id, count, scheduleOf(state.tournament))
    setGroups(count)
    setMsg(t('Zapisuję…'))
    if (!(await store.replace(next))) {
      setMsg(t('Nie udało się zapisać losowania. Sprawdź internet i kliknij jeszcze raz.'))
      return
    }
    try { sessionStorage.removeItem(draftKey) } catch { /* no storage */ }
    setMsg(`${t('Rozlosowano zespoły: {n}.', { n: list.length })} ${t('Grup: {n}.', { n: count })} ${t('Terminarz gotowy.')}`)
  }
  /** Takes the strange lines out of the list and draws the rest. */
  const dropOddAndDraw = () => {
    const strange = new Set(odd ?? [])
    const kept = text.split('\n').filter((line) => !parseTeamList(line, category.id).some((x) => strange.has(x.name)))
    setOdd(null)
    setText(kept.join('\n'))
    void draw(parseTeamList(kept.join('\n'), category.id), true)
  }

  return (
    <section className="panel setup-cat">
      <h3>{category.name}</h3>
      <label>
        {entrantsLabel(state)}: {t('jedna pozycja w linii. Klub przed dwukropkiem, np.')} <i>UKS Orzeł: Orzeł 1</i>
        <textarea rows={Math.max(6, Math.min(16, teams.length + 2))} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={t('Wpisz listę albo polecenie dla asystenta, np. „30 zawodników o nazwach Zawodnik 1…30”')} />
      </label>
      <div className="setup-ai">
        <AttachButtons disabled={aiBusy} onFiles={(files) => void organize(files)} />
        <button type="button" className="btn btn-ai" disabled={aiBusy || !text.trim()} onClick={() => void organize()}>
          {aiBusy ? t('Asystent pracuje…') : `✨ ${t('Uporządkuj z AI')}`}
        </button>
      </div>
      <p className="muted small">{t('Zrób zdjęcie kartki z listą, dodaj plik (PDF, CSV) albo napisz, czego potrzebujesz, i kliknij „Uporządkuj z AI”. Sprawdź listę przed losowaniem.')}</p>
      {aiError && <p className="error">{aiError}</p>}
      {!teams.length && <PhotoTip where="teams" />}
      <div className="form-row">
        <span className="muted">{t('Na liście:')} {teams.length}</span>
        {!bracket && (
          <label>{t('Liczba grup')}
            <NumberField min={1} max={12} value={groups} onChange={setGroups} />
          </label>
        )}
      </div>
      <button className="btn btn-primary" disabled={teams.length < 2} onClick={() => void draw()}>
        {bracket
          ? (hasElimination(state, category.id) ? t('Zapisz i losuj drabinkę od nowa') : t('Zapisz i losuj drabinkę'))
          : drawn ? t('Zapisz zespoły i losuj grupy od nowa') : t('Zapisz zespoły i losuj grupy')}
      </button>
      {odd && (
        <div className="confirm-back" role="presentation" onClick={() => setOdd(null)}>
          <div className="confirm-box" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-q">
              <b>{t('Te linie nie wyglądają na nazwy zawodników ani drużyn:')}</b>
              <ul className="odd-lines">{odd.slice(0, 12).map((n) => <li key={n}>{n}</li>)}</ul>
              {odd.length > 12 && <p className="muted small">{t('…i jeszcze {n}.', { n: odd.length - 12 })}</p>}
              <p>{t('To chyba opis turnieju albo zasady. Usunąć je z listy przed losowaniem?')}</p>
            </div>
            <div className="confirm-actions odd-actions">
              <button type="button" className="btn btn-primary btn-lg" autoFocus onClick={dropOddAndDraw}>{t('Usuń je i losuj ({n})', { n: teams.length - teams.filter((x) => odd.includes(x.name)).length })}</button>
              <button type="button" className="btn btn-lg" onClick={() => setOdd(null)}>{t('Wrócę i poprawię listę')}</button>
              <button type="button" className="btn btn-sm linklike" onClick={() => { setOdd(null); void draw(teams, true) }}>{t('Losuj wszystko bez zmian')}</button>
            </div>
          </div>
        </div>
      )}
      {msg && <p className="ok">{msg}</p>}
    </section>
  )
}

/** The tournament's own links: for fans, and this panel. */
function TournamentLinks() {
  const base = tournamentUrl()
  const [copied, setCopied] = useState('')
  const copy = (url: string) =>
    navigator.clipboard?.writeText(url).then(() => { setCopied(url); setTimeout(() => setCopied(''), 2000) }, () => {})
  const links = [
    { label: t('Strona dla kibiców'), url: base },
    { label: t('Panel organizatora (zapisz go!)'), url: `${base}#panel` },
  ]
  return (
    <section className="panel setup-links">
      <h2>{t('Adresy Twojego turnieju')}</h2>
      <ul className="plain">
        {links.map((l) => (
          <li key={l.url}>
            <span className="muted small">{l.label}</span>
            <a href={l.url}>{l.url}</a>
            <button className="btn" onClick={() => copy(l.url)}>{copied === l.url ? `${t('Skopiowano')} ✓` : t('Kopiuj')}</button>
          </li>
        ))}
      </ul>
    </section>
  )
}
