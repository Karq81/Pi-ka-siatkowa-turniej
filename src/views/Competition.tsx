import { useEffect, useMemo, useState } from 'react'
import { clubOf } from '../logic/draw'
import { bracketView, groupFinished, tierForGroupPlace } from '../logic/knockout'
import { useFavorites, toggleFavorite, setFavorites } from '../favorites'
import { BracketTree } from './BracketTree'
import { isUnderway } from '../logic/courtBoard'
import { CorrectButton } from './Correction'
import { useSession } from '../store/store'
import { formatRatio, standings, tally } from '../logic/scoring'
import type { Match, State, Team } from '../types'
import { BackBar, formatDay, formatTime, StatusPill, useLookups, useNow } from '../ui'

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
  const groups = state.groups.filter((g) => g.categoryId === cat)
  const [groupId, setGroupId] = useState(start?.id ?? groups[0]?.id ?? '')
  const group = groups.find((g) => g.id === groupId) ?? groups[0]

  useEffect(() => {
    if (start) { setCat(start.categoryId); setGroupId(start.id); setPhase('groups') }
  }, [start?.id])

  if (!state.groups.length) {
    return <p className="notice-inline">Grupy nie są jeszcze rozlosowane. Pojawią się tutaj po losowaniu.</p>
  }

  return (
    <div className="comp">
      <div className="seg seg-cat" role="tablist" aria-label="Kategoria">
        {state.categories.map((c) => {
          const n = state.teams.filter((t) => t.categoryId === c.id).length
          return (
            <button key={c.id} role="tab" aria-selected={cat === c.id} className={cat === c.id ? 'on' : ''}
              onClick={() => { setCat(c.id); setGroupId(state.groups.find((g) => g.categoryId === c.id)?.id ?? '') }}>
              <b>{c.name}</b><span>{n} zespołów</span>
            </button>
          )
        })}
      </div>

      <TeamPicker state={state} categoryId={cat} />

      <NextMatch state={state} categoryId={cat} />

      <div className="phase" role="tablist" aria-label="Faza">
        <button role="tab" aria-selected={phase === 'groups'} className={phase === 'groups' ? 'on' : ''} onClick={() => setPhase('groups')}>Faza grupowa</button>
        <button role="tab" aria-selected={phase === 'ko'} className={phase === 'ko' ? 'on' : ''} onClick={() => setPhase('ko')}>Faza pucharowa</button>
      </div>

      {phase === 'groups' && group && (
        <>
          <div className="seg seg-groups" role="tablist" aria-label="Grupa">
            {groups.map((g) => {
              const live = state.matches.some((m) => m.groupId === g.id && m.status === 'live')
              return (
                <button key={g.id} role="tab" aria-selected={g.id === group.id} className={g.id === group.id ? 'on' : ''} onClick={() => setGroupId(g.id)}>
                  {g.name.replace(/^Grupa\s*/, '')}
                  {live && <i className="dot-live" aria-label="mecz na żywo" />}
                </button>
              )
            })}
          </div>
          <GroupView state={state} groupId={group.id} />
        </>
      )}
      {phase === 'ko' && <KnockoutView state={state} categoryId={cat} />}
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


function NextMatch({ state, categoryId }: { state: State; categoryId: string }) {
  const now = useNow()
  const live = state.matches.filter((m) => m.categoryId === categoryId && m.status === 'live').length
  const next = useMemo(() => state.matches
    .filter((m) => m.categoryId === categoryId && m.status === 'scheduled' && new Date(m.start).getTime() > Date.now())
    .sort((a, b) => a.start.localeCompare(b.start))[0], [state.matches, categoryId])
  if (live) {
    return (
      <a href="#na-zywo" className="next next-live">
        <StatusPill status="live" />
        <span><b>{live}</b> {live === 1 ? 'mecz trwa' : 'mecze trwają'} teraz. Zobacz boiska →</span>
      </a>
    )
  }
  if (!next) return null
  const left = Math.max(0, new Date(next.start).getTime() - now)
  const parts = [
    [Math.floor(left / 86400000), 'dni'],
    [Math.floor(left / 3600000) % 24, 'godz'],
    [Math.floor(left / 60000) % 60, 'min'],
    [Math.floor(left / 1000) % 60, 'sek'],
  ] as const
  return (
    <section className="next" aria-label="Najbliższy mecz">
      <p>Najbliższy mecz: <b>{formatDay(next.start)}, {formatTime(next.start)}</b></p>
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
      const t = tally(rules, m.sets)
      return (m.teamA === id ? t.setsA > t.setsB : t.setsB > t.setsA) ? 'w' : 'l'
    })

  return (
    <>
      <section className="standings">
        <header>
          <h3>{group.name}</h3>
          <span className="muted small">{done.length}/{matches.length} meczów</span>
        </header>
        <ol>
          {rows.map((r, i) => {
            const t = team(r.teamId)
            const tr = trend(r.teamId)
            return (
              <li key={r.teamId} className={`${i < 2 ? 'top' : ''} ${mine.includes(r.teamId) ? 'mine' : ''}`}>
                <span className="pos">{i + 1}</span>
                <TeamBadge team={t} />
                <a className="name plain-link" href={`#druzyna-${r.teamId}`}>{t?.name}</a>
                <span className="trend" aria-label={tr.length ? `Ostatnie mecze: ${tr.map((x) => (x === 'w' ? 'wygrana' : 'przegrana')).join(', ')}` : undefined}>
                  {tr.map((x, j) => <i key={j} className={x} />)}
                </span>
                <span className="stat" title="Mecze">{r.played}</span>
                <span className="stat small-pts" title={`Małe punkty (stosunek ${formatRatio(r.pointsWon, r.pointsLost)})`}>{r.pointsWon}:{r.pointsLost}</span>
                <b className="pts" title="Punkty">{r.tablePoints}</b>
              </li>
            )
          })}
        </ol>
        <p className="legend muted small">M: mecze · małe punkty · <b>Pkt</b> · 2 pierwsze miejsca grają o miejsca 1–8</p>
      </section>

      <h3 className="list-title">Mecze grupy</h3>
      <div className="cards">
        {matches.map((m) => <MatchCard key={m.id} state={state} match={m} />)}
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
  const t = tally(rules, m.sets)
  const cur = m.sets[m.sets.length - 1]
  const single = rules.sets === 1
  const team = (id: string) => (id ? state.teams.find((x) => x.id === id) : undefined)
  const done = m.status === 'finished'
  const scoreA = single ? cur?.a : t.setsA
  const scoreB = single ? cur?.b : t.setsB
  const has = m.status !== 'scheduled' && m.sets.length > 0
  const body = (
    <>
      <header>
        <span>{label ?? ''}{label && m.start ? ' · ' : ''}{m.start ? `${formatDay(m.start)} ${formatTime(m.start)}` : ''}</span>
        <span>{m.court ? `Boisko ${m.court}` : ''}</span>
        {underway && <StatusPill status="live" />}
        {m.status === 'finished' && <StatusPill status="finished" />}
      </header>
      <div className="mc-row">
        <span className={`mc-team ${done && t.setsA > t.setsB ? 'win' : ''}`}>
          <TeamBadge team={team(m.teamA)} size="lg" />
          <span className={m.teamA ? '' : 'tbd'}>{side(m, 'a')}</span>
        </span>
        <span className="mc-score">
          {has ? <><b>{scoreA}</b><i>:</i><b>{scoreB}</b></> : <span className="mc-vs">–</span>}
        </span>
        <span className={`mc-team ${done && t.setsB > t.setsA ? 'win' : ''}`}>
          <TeamBadge team={team(m.teamB)} size="lg" />
          <span className={m.teamB ? '' : 'tbd'}>{side(m, 'b')}</span>
        </span>
      </div>
    </>
  )
  const followed = mine.includes(m.teamA) || mine.includes(m.teamB)
  const cls = `mcard ${underway ? 'is-live' : ''} ${done ? 'is-done' : ''} ${followed ? 'mine' : ''}`
  if (!m.start) return <div className={cls}>{body}</div>
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


function KnockoutView({ state, categoryId }: { state: State; categoryId: string }) {
  const slots = bracketView(state, categoryId)
  const tiers = slots ? [...new Set(slots.map((s) => s.match.ko!.tierFrom))].sort((a, b) => a - b) : []
  const [tier, setTier] = useState(1)
  const current = tiers.includes(tier) ? tier : tiers[0]
  if (!slots) {
    return <p className="notice-inline">Faza pucharowa jest przygotowana dla 1, 2 lub 4 grup w kategorii.</p>
  }
  const projected = slots.some((s) => s.projected)
  const inTier = slots.filter((s) => s.match.ko!.tierFrom === current)
  const to = inTier[0]?.match.ko!.tierTo
  return (
    <>
      {projected && (
        <p className="notice-inline">
          Tak będzie wyglądać faza pucharowa. Drużyny wpiszą się w drabinkę, gdy ich grupa rozegra wszystkie mecze;
          do tego czasu widać, które miejsce z której grupy gdzie trafi.
        </p>
      )}
      <div className="seg seg-tiers" role="tablist" aria-label="Miejsca">
        {tiers.map((t) => {
          const last = slots.find((s) => s.match.ko!.tierFrom === t)!.match.ko!.tierTo
          return (
            <button key={t} role="tab" aria-selected={t === current} className={t === current ? 'on' : ''} onClick={() => setTier(t)}>
              {t === 1 ? 'O medale · ' : ''}{t}–{last}
            </button>
          )
        })}
      </div>
      <p className="muted small tier-note">
        {current === 1
          ? 'Dwie pierwsze drużyny z każdej grupy grają o miejsca 1–8: na krzyż, 1A–2B, 1C–2D, 1B–2A, 1D–2C.'
          : `Drużyny z dalszych miejsc w grupach grają o miejsca ${current}–${to}. Każda drużyna rozegra mecze o konkretne miejsce.`}
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
      <span>Znajdź swoją drużynę</span>
      <select
        id={`team-picker-${categoryId ?? 'all'}`}
        value=""
        onChange={(e) => { if (e.target.value) location.hash = `druzyna-${e.target.value}` }}
      >
        <option value="">Wybierz drużynę…</option>
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
  if (!team) return <p className="muted">Nie znaleziono drużyny. <a href="#grupy">Wróć do rozgrywek</a>.</p>
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
  const koTier = group && pos >= 0 ? tierForGroupPlace(state, group.id, pos + 1) : null
  const groupOver = group ? groupFinished(state, group.id) : false
  const opponent = (m: Match) => state.teams.find((t) => t.id === (m.teamA === team.id ? m.teamB : m.teamA))
  const won = matches.filter((m) => m.status === 'finished').filter((m) => {
    const t = tally(rules, m.sets)
    return m.teamA === team.id ? t.setsA > t.setsB : t.setsB > t.setsA
  }).length
  const played = matches.filter((m) => m.status === 'finished').length

  return (
    <div className="team-page">
      <BackBar fallback={group ? `grupa-${group.id}` : 'grupy'} label={group ? `${category?.name} · ${group.name}` : 'Rozgrywki'} />
      <header className="team-head">
        <TeamBadge team={team} size="lg" />
        <div>
          <h2>{team.name}</h2>
          <p className="muted">{category?.name}{group ? ` · ${group.name}` : ''}</p>
        </div>
        <FollowToggle teamId={team.id} />
      </header>
      <div className="team-stats">
        <div><b>{pos >= 0 ? `${pos + 1}.` : '–'}</b><span>miejsce w grupie</span></div>
        <div><b>{row?.tablePoints ?? 0}</b><span>punkty</span></div>
        <div><b>{won}/{played}</b><span>wygrane mecze</span></div>
        <div><b>{matches.length}</b><span>mecze w terminarzu</span></div>
      </div>

      {next && (
        <section className={`team-next ${next.status === 'live' ? 'is-live' : ''}`}>
          <p className="eyebrow">{next.status === 'live' ? 'Gra teraz' : 'Następny mecz'}</p>
          <p className="tn-when">{formatDay(next.start)}, <b>{formatTime(next.start)}</b> · Boisko <b>{next.court}</b></p>
          <p className="tn-vs">
            z <TeamBadge team={opponent(next)} size="sm" /> <b>{opponent(next)?.name ?? 'rywal do ustalenia'}</b>
          </p>
        </section>
      )}

      {koTier && (
        <p className="notice-inline">
          W fazie pucharowej {groupOver ? 'gra' : 'zagra'} o miejsca <b>{koTier[0]}–{koTier[1]}</b>
          {groupOver ? '.' : ' (jeśli utrzyma obecne miejsce w grupie).'}
        </p>
      )}

      <h3 className="list-title">Wszystkie mecze</h3>
      {!matches.length && <p className="muted">Terminarz pojawi się po losowaniu grup.</p>}
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
    <section className="follow-picker" aria-label="Wybierz drużyny do obserwowania">
      <header>
        <h3>Wybierz drużyny do obserwowania</h3>
        <p className="muted small">Wybierz kategorię, zaznacz jedną albo kilka drużyn (np. wszystkie Twojego klubu) i potwierdź.</p>
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
      <input id="follow-search" type="search" placeholder="Szukaj, np. Opty" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="fp-list" role="tabpanel">
        {!teams.length && <p className="muted small">Brak drużyn o tej nazwie w tej kategorii.</p>}
        {teams.map((t) => (
          <label key={t.id} className={`fp-item ${picked.includes(t.id) ? 'on' : ''}`}>
            <input type="checkbox" checked={picked.includes(t.id)} onChange={() => toggle(t.id)} />
            <TeamBadge team={t} size="sm" />
            <span>{t.name}</span>
          </label>
        ))}
      </div>
      <div className="fp-actions">
        <button className="btn btn-primary btn-lg" onClick={() => { setFavorites(picked); onClose() }}>
          {picked.length ? `Potwierdź: obserwuj ${picked.length} ${picked.length === 1 ? 'drużynę' : picked.length < 5 ? 'drużyny' : 'drużyn'}` : 'Potwierdź: nie obserwuj żadnej'}
        </button>
        <button className="btn" onClick={onClose}>Anuluj</button>
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
        <h2>Moje drużyny</h2>
        <button className="btn" onClick={() => setPicking(true)}>{teams.length ? 'Zmień' : 'Wybierz'}</button>
      </header>
      {!teams.length && (
        <button className="my-empty" onClick={() => setPicking(true)}>
          <b>☆ Wybierz drużyny, które chcesz obserwować</b>
          <span>Jedną albo kilka. Będą wyróżnione w tabelach i meczach, a tu zobaczysz ich najbliższe mecze.</span>
        </button>
      )}
      <div className="my-list">
        {teams.map((t) => {
          const ms = state.matches.filter((m) => m.teamA === t.id || m.teamB === t.id).sort((a, b) => a.start.localeCompare(b.start))
          const next = ms.find((m) => m.status === 'live') ?? ms.find((m) => m.status === 'scheduled' && new Date(m.start).getTime() >= now - 15 * 60000)
          const opp = next ? state.teams.find((x) => x.id === (next.teamA === t.id ? next.teamB : next.teamA)) : undefined
          const group = state.groups.find((g) => g.teamIds.includes(t.id))
          return (
            <a key={t.id} href={`#druzyna-${t.id}`} className={`my-card ${next?.status === 'live' ? 'is-live' : ''}`}>
              <TeamBadge team={t} size="md" />
              <span className="my-main">
                <b>{t.name}</b>
                <span className="muted small">{state.categories.find((c) => c.id === t.categoryId)?.name}{group ? ` · ${group.name}` : ''}</span>
              </span>
              <span className="my-next">
                {next ? (
                  <>
                    {next.status === 'live' ? <StatusPill status="live" /> : <b>{formatDay(next.start)} {formatTime(next.start)}</b>}
                    <span className="small">Boisko {next.court}{opp ? ` · z ${opp.name}` : ''}</span>
                  </>
                ) : (
                  <span className="muted small">{ms.length ? 'Brak kolejnych meczów' : 'Mecze po losowaniu'}</span>
                )}
              </span>
            </a>
          )
        })}
      </div>
    </section>
  )
}
