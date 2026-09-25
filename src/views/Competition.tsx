import { useEffect, useMemo, useState } from 'react'
import { clubOf } from '../logic/draw'
import { bracketView, type BracketSlot } from '../logic/knockout'
import { formatRatio, standings, tally } from '../logic/scoring'
import type { Match, State, Team } from '../types'
import { formatDay, formatTime, StatusPill, useLookups } from '../ui'

type Phase = 'groups' | 'ko'

/**
 * The competition for visitors: category → group phase (group tabs with table and
 * matches) or knockout phase (every placement tier), with a countdown to the next match.
 */
export function Competition({ state, route }: { state: State; route: string }) {
  // Deep links: #grupa-<id> opens that group, #drabinka the knockout phase.
  const linkedGroup = /^grupa-(.+)$/.exec(route)?.[1]
  const start = state.groups.find((g) => g.id === linkedGroup)
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

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

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
              <li key={r.teamId} className={i < 2 ? 'top' : ''}>
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
        {m.status === 'live' && <StatusPill status="live" />}
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
  const cls = `mcard ${m.status === 'live' ? 'is-live' : ''} ${done ? 'is-done' : ''}`
  return m.start ? <a href={`#mecz-${m.id}`} className={cls}>{body}</a> : <div className={cls}>{body}</div>
}

/* ---------- Knockout phase ---------- */

const ROUND_TITLES = { QF: 'Ćwierćfinały', SF: 'Półfinały', P: 'Mecze o miejsca' } as const

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
          Tak będzie wyglądać faza pucharowa. Pary uzupełnią się po meczach grupowych; teraz widać układ wg aktualnych tabel.
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
      <div className="ko-cols">
        {(['QF', 'SF', 'P'] as const).map((round) => {
          const list = inTier.filter((s) => s.match.ko!.round === round)
          if (!list.length) return null
          const sorted = round === 'P' ? [...list].sort((a, b) => (a.match.ko!.place ?? 0) - (b.match.ko!.place ?? 0)) : list
          return (
            <section key={round} className="ko-col">
              <h3>{current !== 1 && round !== 'P' ? (round === 'QF' ? 'Pierwsza runda' : 'Druga runda') : ROUND_TITLES[round]}</h3>
              {sorted.map((s: BracketSlot) => (
                <MatchCard key={s.match.id} state={state} match={s.match} label={s.match.ko!.label} />
              ))}
            </section>
          )
        })}
      </div>
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
  const ko = bracketView(state, team.categoryId)?.find((s) => s.match.teamA === team.id || s.match.teamB === team.id)
  const opponent = (m: Match) => state.teams.find((t) => t.id === (m.teamA === team.id ? m.teamB : m.teamA))
  const won = matches.filter((m) => m.status === 'finished').filter((m) => {
    const t = tally(rules, m.sets)
    return m.teamA === team.id ? t.setsA > t.setsB : t.setsB > t.setsA
  }).length
  const played = matches.filter((m) => m.status === 'finished').length

  return (
    <div className="team-page">
      <p><a href={group ? `#grupa-${group.id}` : '#grupy'} className="back">← {group ? `${category?.name} · ${group.name}` : 'Rozgrywki'}</a></p>
      <header className="team-head">
        <TeamBadge team={team} size="lg" />
        <div>
          <h2>{team.name}</h2>
          <p className="muted">{category?.name}{group ? ` · ${group.name}` : ''}</p>
        </div>
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

      {ko && (
        <p className="notice-inline">
          W fazie pucharowej gra o miejsca <b>{ko.match.ko!.tierFrom}–{ko.match.ko!.tierTo}</b>
          {ko.projected ? ' (według aktualnej tabeli grupy).' : '.'}
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
