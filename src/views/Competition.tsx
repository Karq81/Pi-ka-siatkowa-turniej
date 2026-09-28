import { t, tp } from '../i18n'
import { useEffect, useState } from 'react'
import { STAGE2 } from '../content/stage2'
import { endGroupPhase, endStage2, finalRanking, groupsEnded, isStage2Group, openFirstStageMatches, openStage2Matches, reopenGroupPhase, reopenStage2, stage2Ended, stage2Groups, stage2Played } from '../logic/stage2'
import { IS_ALBATROS } from '../config'
import { clubOf } from '../logic/draw'
import { bracketView, groupFinished, tierForGroupPlace } from '../logic/knockout'
import { useFavorites, toggleFavorite, setFavorites } from '../favorites'
import { BracketTree } from './BracketTree'
import { CustomView, EliminationView } from './Elimination'
import { hasCustom } from '../logic/custom'
import { hasSwiss } from '../logic/swiss'
import { hasElimination } from '../logic/elimination'
import { isUnderway } from '../logic/courtBoard'
import { CorrectButton } from './Correction'
import { store, useSession } from '../store/store'
import { formatRatio, isScore, scoreUnit, standings, tally, TIEBREAK_NAMES, tiebreakOrder } from '../logic/scoring'
import type { Match, State, Team } from '../types'
import { BackBar, ConfirmDialog, courtLabel, formatDay, formatTime, StatusPill, useLookups, useNow } from '../ui'

type Phase = 'groups' | 'ko'

/**
 * The competition for visitors: category → group phase (group tabs with table and
 * matches) or knockout phase (every placement tier), with a countdown to the next match.
 */
export function Competition({ state, route }: { state: State; route: string }) {
  // Deep links: #grupa-<id> opens that group, #drabinka the knockout phase.
  const linkedGroup = /^grupa-(.+)$/.exec(route)?.[1]
  const mine = useFavorites()
  // Open on a linked group, else on the group of the first followed team.
  const start = state.groups.find((g) => g.id === linkedGroup)
    ?? state.groups.find((g) => mine.some((id) => g.teamIds.includes(id)))
  const [cat, setCat] = useState(start?.categoryId ?? state.categories[0]?.id ?? '')
  const [phase, setPhase] = useState<Phase>(route === 'drabinka' ? 'ko' : 'groups')
  // The group phase; second-stage groups (Albatros CUP) are shown under "Drugi etap".
  const groups = state.groups.filter((g) => g.categoryId === cat && !isStage2Group(g))
  const [groupId, setGroupId] = useState(start?.id ?? groups[0]?.id ?? '')
  const group = groups.find((g) => g.id === groupId) ?? groups[0]

  useEffect(() => {
    if (start) { setCat(start.categoryId); setGroupId(start.id); setPhase('groups') }
  }, [start?.id])

  const custom = hasCustom(state, cat)
  // Without groups the category's own plan is shown straight away, like a bracket.
  const elim = hasElimination(state, cat) || (custom && !state.groups.some((g) => g.categoryId === cat))
  if (!state.groups.length && !state.matches.some((m) => m.ko?.bracket)) {
    return <p className="notice-inline">{t('Grupy pojawią się tutaj wkrótce.')}</p>
  }

  return (
    <div className="comp">
      <div className="seg seg-cat" role="tablist" aria-label="Kategoria">
        {state.categories.map((c) => {
          const n = state.teams.filter((t) => t.categoryId === c.id).length
          return (
            <button key={c.id} role="tab" aria-selected={cat === c.id} className={cat === c.id ? 'on' : ''}
              onClick={() => { setCat(c.id); setGroupId(state.groups.find((g) => g.categoryId === c.id)?.id ?? '') }}>
              <b>{c.name}</b><span>{tp(n, '{n} zespół|{n} zespoły|{n} zespołów')}</span>
            </button>
          )
        })}
      </div>

      <TeamPicker state={state} categoryId={cat} />

      <NextMatch state={state} categoryId={cat} />

      {elim && (custom ? <CustomView state={state} categoryId={cat} /> : <EliminationView state={state} categoryId={cat} />)}

      {!elim && !hasSwiss(state, cat) && <div className="phase" role="tablist" aria-label="Faza">
        <button role="tab" aria-selected={phase === 'groups'} className={phase === 'groups' ? 'on' : ''} onClick={() => setPhase('groups')}>{t('Faza grupowa')}</button>
        <button role="tab" aria-selected={phase === 'ko'} className={phase === 'ko' ? 'on' : ''} onClick={() => setPhase('ko')}>{STAGE2[cat] ? t('Drugi etap') : t('Faza pucharowa')}</button>
      </div>}
      {!elim && STAGE2[cat] && <PhaseEnds state={state} categoryId={cat} onEnd={(p) => setPhase(p)} />}

      {!elim && phase === 'groups' && group && (
        <>
          <div className="seg seg-groups" role="tablist" aria-label="Grupa">
            {groups.map((g) => {
              const live = state.matches.some((m) => m.groupId === g.id && m.status === 'live')
              return (
                <button key={g.id} role="tab" aria-selected={g.id === group.id} className={g.id === group.id ? 'on' : ''} onClick={() => setGroupId(g.id)}>
                  {g.name.replace(/^Grupa\s*/, '')}
                  {live && <i className="dot-live" aria-label={t('mecz na żywo')} />}
                </button>
              )
            })}
          </div>
          <GroupView state={state} groupId={group.id} />
        </>
      )}
      {!elim && phase === 'ko' && custom && <CustomView state={state} categoryId={cat} />}
      {!elim && phase === 'ko' && !custom && (STAGE2[cat] ? <Stage2View state={state} categoryId={cat} /> : <KnockoutView state={state} categoryId={cat} />)}
    </div>
  )
}

/* ---------- Team badge ---------- */

const SKIP = new Set(['uks', 'mks', 'ks', 'sp', 'tps', 'ptps', 'amps', 'sgs', 'akademia', 'siatkarska', 'siatkówki', 'powiat'])

function initials(team: Team): string {
  const words = clubOf(team).split(/\s+/).filter((w) => !SKIP.has(w.toLowerCase()) && !/^\d+$/.test(w))
  const src = words.length ? words : clubOf(team).split(/\s+/)
  return src.slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

function hue(text: string): number {
  let h = 0
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}

/** Coloured circle with the club's initials; the team number sits in a small tag. */
export function TeamBadge({ team, size = 'md' }: { team?: Team; size?: 'sm' | 'md' | 'lg' }) {
  if (!team) return <span className={`badge badge-${size} badge-tbd`} aria-hidden="true">?</span>
  const num = /\s(\d+)$/.exec(team.name)?.[1]
  return (
    <span className={`badge badge-${size}`} style={{ ['--h' as string]: hue(clubOf(team)) }} aria-hidden="true">
      {initials(team)}
      {num && <sup>{num}</sup>}
    </span>
  )
}

/* ---------- Countdown ---------- */


/**
 * Countdown to the next match: of one category (Grupy i terminarz), or of the whole
 * tournament (`categoryId` left out, on "Na żywo", where the boards already show
 * matches being played, so nothing is shown while any is live).
 */
export function NextMatch({ state, categoryId }: { state: State; categoryId?: string }) {
  const now = useNow()
  const inCategory = (m: Match) => !categoryId || m.categoryId === categoryId
  const live = state.matches.filter((m) => inCategory(m) && m.status === 'live').length
  const next = state.matches
    .filter((m) => inCategory(m) && m.status === 'scheduled' && new Date(m.start).getTime() > now)
    .sort((a, b) => a.start.localeCompare(b.start))[0]
  if (live) {
    if (!categoryId) return null
    return (
      <a href="#na-zywo" className="next next-live">
        <StatusPill status="live" />
        <span>{tp(live, '{n} mecz trwa teraz.|{n} mecze trwają teraz.|{n} meczów trwa teraz.')} {t('Zobacz boiska')} →</span>
      </a>
    )
  }
  if (!next) return null
  const left = Math.max(0, new Date(next.start).getTime() - now)
  const parts = [
    [Math.floor(left / 86400000), t('dni')],
    [Math.floor(left / 3600000) % 24, t('godz')],
    [Math.floor(left / 60000) % 60, t('min')],
    [Math.floor(left / 1000) % 60, t('sek')],
  ] as const
  return (
    <section className="next" aria-label={t('Najbliższy mecz')}>
      <p>{t('Najbliższy mecz:')} <b>{formatDay(next.start)}, {formatTime(next.start)}</b></p>
      <div className="countdown">
        {parts.map(([v, label], i) => (
          <span key={label} className="cd">
            <b>{String(v).padStart(i ? 2 : 1, '0')}</b>
            <small>{label}</small>
          </span>
        ))}
      </div>
    </section>
  )
}

/* ---------- Group phase ---------- */

function GroupView({ state, groupId }: { state: State; groupId: string }) {
  const mine = useFavorites()
  const group = state.groups.find((g) => g.id === groupId)!
  const rules = state.tournament.rules
  const rows = standings(rules, group, state.matches, state.teams)
  const team = (id: string) => state.teams.find((t) => t.id === id)
  const matches = state.matches.filter((m) => m.groupId === group.id).sort((a, b) => a.start.localeCompare(b.start) || a.court - b.court)
  const done = matches.filter((m) => m.status === 'finished')
  // Last three results per team, oldest first.
  const trend = (id: string) => done
    .filter((m) => m.teamA === id || m.teamB === id)
    .slice(-3)
    .map((m) => {
      const tl = tally(rules, m.sets)
      const [own, other] = m.teamA === id ? [tl.setsA, tl.setsB] : [tl.setsB, tl.setsA]
      return own > other ? 'w' : own < other ? 'l' : 'd'
    })

  return (
    <>
      <section className="standings">
        <header>
          <h3>{group.name}</h3>
          <span className="muted small">{t('Rozegrane: {done}/{all}', { done: done.length, all: matches.length })}</span>
        </header>
        <ol>
          {rows.map((r, i) => {
            const tm = team(r.teamId)
            const tr = trend(r.teamId)
            return (
              <li key={r.teamId} className={`${i < 2 ? 'top' : ''} ${mine.includes(r.teamId) ? 'mine' : ''}`}>
                <span className="pos">{i + 1}</span>
                <TeamBadge team={tm} />
                <a className="name plain-link" href={`#druzyna-${r.teamId}`}>{tm?.name}</a>
                <span className="trend" aria-label={tr.length ? `${t('Ostatnie mecze:')} ${tr.map((x) => (x === 'w' ? t('wygrana') : x === 'd' ? t('remis') : t('przegrana'))).join(', ')}` : undefined}>
                  {tr.map((x, j) => <i key={j} className={x} />)}
                </span>
                <span className="stat" title="Mecze">{r.played}</span>
                <span className="stat small-pts" title={isScore(rules) ? scoreUnit(rules) : t('Małe punkty (stosunek {ratio})', { ratio: formatRatio(r.pointsWon, r.pointsLost) })}>{r.pointsWon}:{r.pointsLost}</span>
                <b className="pts" title="Punkty">{r.tablePoints}</b>
              </li>
            )
          })}
        </ol>
        <p className="legend muted small">{t('M: mecze')} · {scoreUnit(rules)} · <b>{t('Pkt')}</b>{STAGE2[group.categoryId] ? ` · ${STAGE2[group.categoryId].legend}` : IS_ALBATROS ? ' · 2 pierwsze miejsca grają o miejsca 1–8' : ''}</p>
        <p className="legend muted small">{t('Przy równej liczbie punktów:')} {tiebreakOrder(rules).map((k) => t(TIEBREAK_NAMES[k]).toLowerCase()).join(' → ')}.</p>
      </section>

      <h3 className="list-title">{t('Mecze grupy')}</h3>
      <div className="cards">
        {matches.map((m) => <MatchCard key={m.id} state={state} match={m} label={m.swissRound ? t('Runda {r}', { r: m.swissRound }) : undefined} />)}
      </div>
    </>
  )
}

/** One match as a card: when and where, both teams with badges, the score. */
export function MatchCard({ state, match: m, label }: { state: State; match: Match; label?: string }) {
  const mine = useFavorites()
  const session = useSession()
  const now = useNow(15000)
  const underway = isUnderway(m, now)
  const { side } = useLookups(state)
  const rules = state.tournament.rules
  const tl = tally(rules, m.sets)
  const cur = m.sets[m.sets.length - 1]
  const single = rules.sets === 1
  const team = (id: string) => (id ? state.teams.find((x) => x.id === id) : undefined)
  const done = m.status === 'finished'
  const scoreA = single ? cur?.a : tl.setsA
  const scoreB = single ? cur?.b : tl.setsB
  const has = m.status !== 'scheduled' && m.sets.length > 0
  const followed = mine.includes(m.teamA) || mine.includes(m.teamB)
  const body = (
    <>
      {followed && <div className="mc-ribbon">{t('★ Mecz Twojej drużyny')}</div>}
      <header>
        <span>{label ?? ''}{label && m.start ? ' · ' : ''}{m.start ? `${formatDay(m.start)} ${formatTime(m.start)}` : ''}</span>
        <span>{m.court ? t('Boisko {n}', { n: courtLabel(m.court) }) : ''}</span>
        {underway && <StatusPill status="live" />}
        {m.status === 'finished' && <StatusPill status="finished" />}
      </header>
      <div className="mc-row">
        <span className={`mc-team ${done && tl.setsA > tl.setsB ? 'win' : ''} ${mine.includes(m.teamA) ? 'mine' : ''}`}>
          <TeamBadge team={team(m.teamA)} size="lg" />
          <span className={m.teamA ? '' : 'tbd'}>{side(m, 'a')}</span>
        </span>
        <span className="mc-score">
          {has ? <><b>{scoreA}</b><i>:</i><b>{scoreB}</b></> : <span className="mc-vs">–</span>}
        </span>
        <span className={`mc-team ${done && tl.setsB > tl.setsA ? 'win' : ''} ${mine.includes(m.teamB) ? 'mine' : ''}`}>
          <TeamBadge team={team(m.teamB)} size="lg" />
          <span className={m.teamB ? '' : 'tbd'}>{side(m, 'b')}</span>
        </span>
      </div>
    </>
  )
  const cls = `mcard ${underway ? 'is-live' : ''} ${done ? 'is-done' : ''} ${followed ? 'mine' : ''}`
  if (!m.start || m.bye) return <div className={cls}>{body}</div>
  // The chief referee also gets a correction button, kept outside the link.
  if (session?.role === 'admin') {
    return (
      <div className={cls}>
        <a href={`#mecz-${m.id}`} className="mcard-main">{body}</a>
        <CorrectButton match={m} />
      </div>
    )
  }
  return <a href={`#mecz-${m.id}`} className={cls}>{body}</a>
}

/* ---------- Knockout phase ---------- */


/**
 * Chief referee (Albatros CUP): under each phase a button to end it, with the number of
 * matches still to play; asked first. Ending the groups makes the second stage.
 */
function PhaseEnds({ state, categoryId, onEnd }: { state: State; categoryId: string; onEnd: (p: Phase) => void }) {
  const session = useSession()
  const [asking, setAsking] = useState<'groups' | 'stage2' | null>(null)
  const [busy, setBusy] = useState(false)
  if (session?.role !== 'admin') return null
  const openGroups = openFirstStageMatches(state, categoryId).length
  const open2 = openStage2Matches(state, categoryId).length
  const has2 = stage2Groups(state, categoryId).length > 0
  const doneGroups = groupsEnded(state, categoryId) || (has2 && !openGroups)
  const done2 = stage2Ended(state, categoryId)
  const left = (n: number) => (n ? tp(n, 'został {n} mecz do końca|zostały {n} mecze do końca|zostało {n} meczów do końca') : t('wszystkie mecze rozegrane'))
  const run = async (next: State, phase: Phase) => {
    setAsking(null)
    setBusy(true)
    await store.replace(next)
    setBusy(false)
    onEnd(phase)
  }
  return (
    <div className="phase-ends">
      <div>
        {doneGroups ? (
          <p className="phase-done">✓ {t('Faza grupowa zakończona')}{!stage2Played(state, categoryId) && <> · <button type="button" className="linklike small" onClick={() => void run(reopenGroupPhase(state, categoryId), 'groups')}>{t('Cofnij')}</button></>}</p>
        ) : (
          <div className="phase-end-box">
            <button type="button" className={`btn btn-end ${openGroups ? '' : 'btn-pulse'}`} disabled={busy} onClick={() => setAsking('groups')}>
              <b>{t('Zakończ fazę grupową')}</b><span>{left(openGroups)}</span>
            </button>
            {openGroups > 0 && <OpenMatches state={state} matches={openFirstStageMatches(state, categoryId)} />}
          </div>
        )}
      </div>
      <div>
        {!has2 ? <p className="muted small">{t('Drugi etap ułoży się po zakończeniu fazy grupowej.')}</p>
          : done2 ? (
            <p className="phase-done">🏆 {t('Drugi etap zakończony')} · <button type="button" className="linklike small" onClick={() => void run(reopenStage2(state, categoryId), 'ko')}>{t('Cofnij')}</button></p>
          ) : (
            <div className="phase-end-box">
              <button type="button" className={`btn btn-end ${open2 ? '' : 'btn-pulse'}`} disabled={busy} onClick={() => setAsking('stage2')}>
                <b>{t('Zakończ drugi etap')}</b><span>{left(open2)}</span>
              </button>
              {open2 > 0 && <OpenMatches state={state} matches={openStage2Matches(state, categoryId)} />}
            </div>
          )}
      </div>
      {asking && (
        <ConfirmDialog
          question={asking === 'groups' ? <>
            <b>{t('Czy na pewno chcesz zakończyć fazę grupową?')}</b>
            <p>{openGroups ? tp(openGroups, 'Został {n} nierozegrany mecz: zniknie z boisk i nie liczy się do tabel.|Zostały {n} nierozegrane mecze: znikną z boisk i nie liczą się do tabel.|Zostało {n} nierozegranych meczów: znikną z boisk i nie liczą się do tabel.') : t('Wszystkie mecze są rozegrane.')} {t('Drugi etap ułoży się z obecnych tabel, razem z terminarzem.')}</p>
          </> : <>
            <b>{t('Czy na pewno chcesz zakończyć drugi etap?')}</b>
            <p>{open2 ? tp(open2, 'Został {n} nierozegrany mecz: zniknie z boisk i nie liczy się do tabel.|Zostały {n} nierozegrane mecze: znikną z boisk i nie liczą się do tabel.|Zostało {n} nierozegranych meczów: znikną z boisk i nie liczą się do tabel.') : t('Wszystkie mecze są rozegrane.')} {t('Kibice zobaczą klasyfikację końcową.')}</p>
          </>}
          yes={asking === 'groups' ? t('Tak, zakończ fazę grupową') : t('Tak, zakończ drugi etap')}
          no={t('Nie, jeszcze nie')}
          onYes={() => void (asking === 'groups' ? run(endGroupPhase(state, categoryId), 'ko') : run(endStage2(state, categoryId), 'ko'))}
          onNo={() => setAsking(null)}
        />
      )}
    </div>
  )
}

/** The matches of a phase still to be played, each with a link to enter its result. */
function OpenMatches({ state, matches }: { state: State; matches: Match[] }) {
  const { teamName, groupName } = useLookups(state)
  return (
    <details className="open-matches" open={matches.length <= 5}>
      <summary>{t('Które mecze zostały?')}</summary>
      <ul>
        {[...matches].sort((a, b) => a.start.localeCompare(b.start) || a.court - b.court).map((m) => (
          <li key={m.id}>
            <span>{groupName(m.groupId)} · {t('Boisko {n}', { n: courtLabel(m.court) })} · {formatDay(m.start)} {formatTime(m.start)}<br /><b>{teamName(m.teamA)}</b> – <b>{teamName(m.teamB)}</b></span>
            <a className="btn btn-sm btn-primary" href={`#korekta-${m.id}`}>{t('Wpisz wynik')}</a>
          </li>
        ))}
      </ul>
    </details>
  )
}

/** The organiser's second stage: new round-robin groups for places, filled after the group phase. */
function Stage2View({ state, categoryId }: { state: State; categoryId: string }) {
  const stage = STAGE2[categoryId]
  const made = stage2Groups(state, categoryId)
  const { teamName } = useLookups(state)
  if (made.length) {
    const final = stage2Ended(state, categoryId) ? finalRanking(state, categoryId) : []
    return (
      <section className="stage2">
        {final.length > 0 && (
          <div className="final-ranking">
            <h3>🏆 {t('Klasyfikacja końcowa')}</h3>
            <ol>{final.map((r) => <li key={r.teamId} value={r.place} className={r.place <= 3 ? `top p${r.place}` : ''}>{r.place === 1 ? '🥇 ' : r.place === 2 ? '🥈 ' : r.place === 3 ? '🥉 ' : ''}{teamName(r.teamId)}</li>)}</ol>
          </div>
        )}
        {made.map((g, i) => (
          <div key={g.id} className="stage2-made">
            <h3>{g.name} <span className="pill">{t('miejsca {places}', { places: stage.groups[i]?.places ?? '' })}</span></h3>
            <GroupView state={state} groupId={g.id} />
          </div>
        ))}
      </section>
    )
  }
  return (
    <section className="stage2">
      <p className="muted">
        {t('Po fazie grupowej drużyny grają w nowych grupach, każdy z każdym, jak w pierwszym etapie. Jeden set do 15 lub 21 (zależnie od czasu). Składy grup pojawią się tu po zakończeniu fazy grupowej.')}
      </p>
      <div className="stage2-list">
        {stage.groups.map((g) => (
          <article key={g.name} className="stage2-group">
            <header>
              <b>{g.name}</b>
              <span className="pill">{t('miejsca {places}', { places: g.places })}</span>
            </header>
            <p>{g.who}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function KnockoutView({ state, categoryId }: { state: State; categoryId: string }) {
  const slots = bracketView(state, categoryId)
  const tiers = slots ? [...new Set(slots.map((s) => s.match.ko!.tierFrom))].sort((a, b) => a - b) : []
  const [tier, setTier] = useState(1)
  const current = tiers.includes(tier) ? tier : tiers[0]
  if (!slots) {
    return <p className="notice-inline">{t('Faza pucharowa jest przygotowana dla 1, 2 lub 4 grup w kategorii.')}</p>
  }
  const projected = slots.some((s) => s.projected)
  const inTier = slots.filter((s) => s.match.ko!.tierFrom === current)
  const to = inTier[0]?.match.ko!.tierTo
  return (
    <>
      {projected && (
        <p className="notice-inline">
          {t('Tak będzie wyglądać faza pucharowa. Drużyny wpiszą się w drabinkę, gdy ich grupa rozegra wszystkie mecze; do tego czasu widać, które miejsce z której grupy gdzie trafi.')}
        </p>
      )}
      <div className="seg seg-tiers" role="tablist" aria-label={t('Miejsca')}>
        {tiers.map((tr) => {
          const last = slots.find((s) => s.match.ko!.tierFrom === tr)!.match.ko!.tierTo
          return (
            <button key={tr} role="tab" aria-selected={tr === current} className={tr === current ? 'on' : ''} onClick={() => setTier(tr)}>
              {tr === 1 ? `${t('O medale')} · ` : ''}{tr}–{last}
            </button>
          )
        })}
      </div>
      <p className="muted small tier-note">
        {current === 1
          ? t('Dwie pierwsze drużyny z każdej grupy grają o miejsca 1–8: na krzyż, 1A–2B, 1C–2D, 1B–2A, 1D–2C.')
          : t('Drużyny z dalszych miejsc w grupach grają o miejsca {from}–{to}. Każda drużyna rozegra mecze o konkretne miejsce.', { from: current, to: to ?? '' })}
      </p>
      <BracketTree state={state} slots={inTier} />
    </>
  )
}

/* ---------- Team: picker and page ---------- */

/** "Find your team": opens the team's page with all its matches. */
export function TeamPicker({ state, categoryId }: { state: State; categoryId?: string }) {
  const cats = state.categories.filter((c) => !categoryId || c.id === categoryId)
  return (
    <label className="team-picker">
      <span>{t('Znajdź swoją drużynę')}</span>
      <select
        id={`team-picker-${categoryId ?? 'all'}`}
        value=""
        onChange={(e) => { if (e.target.value) location.hash = `druzyna-${e.target.value}` }}
      >
        <option value="">{t('Wybierz drużynę…')}</option>
        {cats.map((c) => (
          <optgroup key={c.id} label={c.name}>
            {state.teams.filter((t) => t.categoryId === c.id).sort((a, b) => a.name.localeCompare(b.name, 'pl')).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}

/** One team: place in the group, next match and every match in order (who, when, where). */
export function TeamPage({ state, teamId }: { state: State; teamId: string }) {
  const now = useNow(30000)
  const team = state.teams.find((t) => t.id === teamId)
  if (!team) return <p className="muted">{t('Nie znaleziono drużyny.')} <a href="#grupy">{t('Wróć do rozgrywek')}</a>.</p>
  const rules = state.tournament.rules
  const category = state.categories.find((c) => c.id === team.categoryId)
  const group = state.groups.find((g) => g.teamIds.includes(team.id))
  const rows = group ? standings(rules, group, state.matches, state.teams) : []
  const pos = rows.findIndex((r) => r.teamId === team.id)
  const row = rows[pos]
  const matches = state.matches
    .filter((m) => m.teamA === team.id || m.teamB === team.id)
    .sort((a, b) => a.start.localeCompare(b.start))
  const next = matches.find((m) => m.status === 'live') ?? matches.find((m) => m.status === 'scheduled' && new Date(m.start).getTime() >= now - 15 * 60000)
  const days = [...new Set(matches.map((m) => m.start.slice(0, 10)))]
  // Where the team would play in the knockout phase, by the current table.
  // Places the team plays for in the knockout phase, from its current place in the group.
  const koTier = group && pos >= 0 && !STAGE2[team.categoryId] ? tierForGroupPlace(state, group.id, pos + 1) : null
  const groupOver = group ? groupFinished(state, group.id) : false
  const opponent = (m: Match) => state.teams.find((t) => t.id === (m.teamA === team.id ? m.teamB : m.teamA))
  const won = matches.filter((m) => m.status === 'finished').filter((m) => {
    const tl = tally(rules, m.sets)
    return m.teamA === team.id ? tl.setsA > tl.setsB : tl.setsB > tl.setsA
  }).length
  const played = matches.filter((m) => m.status === 'finished').length

  return (
    <div className="team-page">
      <BackBar fallback={group ? `grupa-${group.id}` : 'grupy'} />
      <header className="team-head">
        <TeamBadge team={team} size="lg" />
        <div>
          <h2>{team.name}</h2>
          <p className="muted">{category?.name}{group ? ` · ${group.name}` : ''}</p>
        </div>
        <FollowToggle teamId={team.id} />
      </header>
      <div className="team-stats">
        <div><b>{pos >= 0 ? `${pos + 1}.` : '–'}</b><span>{t('miejsce w grupie')}</span></div>
        <div><b>{row?.tablePoints ?? 0}</b><span>{t('punkty')}</span></div>
        <div><b>{won}/{played}</b><span>{t('wygrane mecze')}</span></div>
        <div><b>{matches.length}</b><span>{t('mecze w terminarzu')}</span></div>
      </div>

      {next && (
        <section className={`team-next ${next.status === 'live' ? 'is-live' : ''}`}>
          <p className="eyebrow">{next.status === 'live' ? t('Gra teraz') : t('Następny mecz')}</p>
          <p className="tn-when">{formatDay(next.start)}, <b>{formatTime(next.start)}</b> {t('· Boisko')} <b>{courtLabel(next.court)}</b></p>
          <p className="tn-vs">
            {t('z')} <TeamBadge team={opponent(next)} size="sm" /> <b>{opponent(next)?.name ?? t('rywal do ustalenia')}</b>
          </p>
        </section>
      )}

      {koTier && (
        <p className="notice-inline">
          {groupOver ? t('W fazie pucharowej gra o miejsca') : t('W fazie pucharowej zagra o miejsca')} <b>{koTier[0]}–{koTier[1]}</b>
          {groupOver ? '.' : ` ${t('(jeśli utrzyma obecne miejsce w grupie).')}`}
        </p>
      )}

      <h3 className="list-title">{t('Wszystkie mecze')}</h3>
      {!matches.length && <p className="muted">{t('Terminarz pojawi się wkrótce.')}</p>}
      {days.map((d) => (
        <section key={d} className="team-day">
          <h4 className="day-title">{formatDay(d)}</h4>
          <div className="cards">
            {matches.filter((m) => m.start.startsWith(d)).map((m) => (
              <MatchCard key={m.id} state={state} match={m} label={m.ko ? m.ko.label : group?.name} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

/* ---------- Followed teams ("Moje drużyny") ---------- */

function FollowToggle({ teamId }: { teamId: string }) {
  const mine = useFavorites()
  const on = mine.includes(teamId)
  return (
    <button className={`follow ${on ? 'on' : ''}`} onClick={() => toggleFavorite(teamId)} aria-pressed={on}>
      {on ? '★ Obserwujesz' : '☆ Obserwuj'}
    </button>
  )
}

/**
 * Choose any number of teams to follow, then confirm. Opens inline (no pop-up window),
 * with a search box and teams grouped by category.
 */
export function FollowPicker({ state, onClose }: { state: State; onClose: () => void }) {
  const mine = useFavorites()
  const [picked, setPicked] = useState<string[]>(mine)
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()
  // One category at a time: chosen at the top, its teams listed below.
  const firstPicked = state.teams.find((t) => mine.includes(t.id))?.categoryId
  const [cat, setCat] = useState(firstPicked ?? state.categories[0]?.id ?? '')
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const teams = state.teams
    .filter((t) => t.categoryId === cat && (!query || t.name.toLowerCase().includes(query)))
    .sort((a, b) => a.name.localeCompare(b.name, 'pl'))
  return (
    <section className="follow-picker" aria-label={t('Wybierz drużyny do obserwowania')}>
      <header>
        <h3>{t('Wybierz drużyny do obserwowania')}</h3>
        <p className="muted small">{t('Wybierz kategorię, zaznacz jedną albo kilka drużyn (np. wszystkie Twojego klubu) i potwierdź.')}</p>
      </header>
      <div className="chips fp-cats" role="tablist" aria-label="Kategoria">
        {state.categories.map((c) => {
          const n = picked.filter((id) => state.teams.find((t) => t.id === id)?.categoryId === c.id).length
          return (
            <button
              key={c.id}
              role="tab"
              aria-selected={cat === c.id}
              className={`chip ${cat === c.id ? 'active' : ''}`}
              onClick={() => setCat(c.id)}
            >
              {c.name}{n > 0 && <span className="fp-count">{n}</span>}
            </button>
          )
        })}
      </div>
      <input id="follow-search" type="search" placeholder={t('Szukaj, np. Opty')} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="fp-list" role="tabpanel">
        {!teams.length && <p className="muted small">{t('Brak drużyn o tej nazwie w tej kategorii.')}</p>}
        {teams.map((tm) => (
          <label key={tm.id} className={`fp-item ${picked.includes(tm.id) ? 'on' : ''}`}>
            <input type="checkbox" checked={picked.includes(tm.id)} onChange={() => toggle(tm.id)} />
            <TeamBadge team={tm} size="sm" />
            <span>{tm.name}</span>
          </label>
        ))}
      </div>
      <div className="fp-actions">
        <button className="btn btn-primary btn-lg" onClick={() => { setFavorites(picked); onClose() }}>
          {picked.length ? tp(picked.length, 'Potwierdź: obserwuj {n} drużynę|Potwierdź: obserwuj {n} drużyny|Potwierdź: obserwuj {n} drużyn') : t('Potwierdź: nie obserwuj żadnej')}
        </button>
        <button className="btn" onClick={onClose}>{t('Anuluj')}</button>
      </div>
    </section>
  )
}

/** Start page block: followed teams with their next match, or a button to choose them. */
export function MyTeams({ state }: { state: State }) {
  const mine = useFavorites()
  const [picking, setPicking] = useState(false)
  const now = useNow(30000)
  const teams = mine.map((id) => state.teams.find((t) => t.id === id)).filter((t): t is Team => !!t)
  if (picking) return <FollowPicker state={state} onClose={() => setPicking(false)} />
  return (
    <section className="my-teams">
      <header>
        <h2>{t('Moje drużyny')}</h2>
        <button className="btn" onClick={() => setPicking(true)}>{teams.length ? t('Zmień') : t('Wybierz')}</button>
      </header>
      {!teams.length && (
        <button className="my-empty" onClick={() => setPicking(true)}>
          <b>{t('☆ Wybierz drużyny, które chcesz obserwować')}</b>
          <span>{t('Jedną albo kilka. Będą wyróżnione w tabelach i meczach, a tu zobaczysz ich najbliższe mecze.')}</span>
        </button>
      )}
      <div className="my-list">
        {teams.map((tm) => {
          const ms = state.matches.filter((m) => m.teamA === tm.id || m.teamB === tm.id).sort((a, b) => a.start.localeCompare(b.start))
          const next = ms.find((m) => m.status === 'live') ?? ms.find((m) => m.status === 'scheduled' && new Date(m.start).getTime() >= now - 15 * 60000)
          const opp = next ? state.teams.find((x) => x.id === (next.teamA === tm.id ? next.teamB : next.teamA)) : undefined
          const group = state.groups.find((g) => g.teamIds.includes(tm.id))
          return (
            <a key={tm.id} href={`#druzyna-${tm.id}`} className={`my-card ${next?.status === 'live' ? 'is-live' : ''}`}>
              <TeamBadge team={tm} size="md" />
              <span className="my-main">
                <b>{tm.name}</b>
                <span className="muted small">{state.categories.find((c) => c.id === tm.categoryId)?.name}{group ? ` · ${group.name}` : ''}</span>
              </span>
              <span className="my-next">
                {next ? (
                  <>
                    {next.status === 'live' ? <StatusPill status="live" /> : <b>{formatDay(next.start)} {formatTime(next.start)}</b>}
                    <span className="small">{t('Boisko {n}', { n: courtLabel(next.court) })}{opp ? ` · ${t('z')} ${opp.name}` : ''}</span>
                  </>
                ) : (
                  <span className="muted small">{ms.length ? t('Brak kolejnych meczów') : t('Mecze wkrótce')}</span>
                )}
              </span>
            </a>
          )
        })}
      </div>
    </section>
  )
}
