import { useState } from 'react'
import { t } from '../i18n'
import { streamEmbed } from '../logic/stream'
import { store } from '../store/store'
import type { State } from '../types'
import { courtLabel } from '../ui'

/** The live video, 16:9, with a link to open it in the app when embedding is refused. */
export function StreamPlayer({ link, title }: { link?: string; title: string }) {
  const src = streamEmbed(link)
  if (!link || !src) return null
  return (
    <section className="stream">
      <h2><span className="stream-dot" aria-hidden="true" /> {title}</h2>
      <div className="stream-frame">
        <iframe src={src} title={title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen loading="lazy" />
      </div>
      <a className="muted small" href={link} target="_blank" rel="noreferrer">{t('Nie działa? Otwórz transmisję w aplikacji')} ›</a>
    </section>
  )
}

/**
 * Organiser: the links of the live video. Three steps, written for someone who has never
 * streamed: YouTube app → Create → Go live, copy the link, paste it here.
 */
export function StreamSettings({ state }: { state: State }) {
  const tour = state.tournament
  const [all, setAll] = useState(tour.stream ?? '')
  const [courts, setCourts] = useState<Record<string, string>>(tour.courtStreams ?? {})
  const [perCourt, setPerCourt] = useState(Object.values(tour.courtStreams ?? {}).some(Boolean))
  const [msg, setMsg] = useState('')
  const bad = [all, ...Object.values(courts)].some((l) => l.trim() && !streamEmbed(l))
  const save = () => {
    const courtStreams = Object.fromEntries(Object.entries(courts).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v))
    store.updateTournament({ stream: all.trim(), courtStreams })
    setMsg(t('Zapisano. Kibice widzą transmisję na stronie turnieju.'))
  }
  return (
    <section className="panel stream-settings">
      <h2>📺 {t('Transmisja wideo na żywo')}</h2>
      <ol className="stream-steps">
        <li>{t('Na telefonie otwórz aplikację YouTube i wybierz „+” → „Transmisja na żywo” (albo nadaj na żywo na Facebooku).')}</li>
        <li>{t('Gdy transmisja ruszy, wybierz „Udostępnij” → „Kopiuj link”.')}</li>
        <li>{t('Wklej link poniżej i zapisz. Obraz pojawi się u kibiców obok wyników.')}</li>
      </ol>
      <label>{t('Link do transmisji całego turnieju')}
        <input value={all} onChange={(e) => { setAll(e.target.value); setMsg('') }} placeholder="https://youtube.com/live/…" inputMode="url" />
      </label>
      <label className="check">
        <input type="checkbox" checked={perCourt} onChange={(e) => setPerCourt(e.target.checked)} /> {t('Osobna kamera na wybranych boiskach')}
      </label>
      {perCourt && (
        <div className="stream-courts">
          {Array.from({ length: tour.courts }, (_, i) => String(i + 1)).map((c) => (
            <label key={c}>{t('Boisko {n}', { n: courtLabel(Number(c)) })}
              <input value={courts[c] ?? ''} inputMode="url" placeholder="https://youtube.com/live/…"
                onChange={(e) => { setCourts((x) => ({ ...x, [c]: e.target.value })); setMsg('') }} />
            </label>
          ))}
        </div>
      )}
      {bad && <p className="error small">{t('Ten link nie wygląda na transmisję z YouTube, Facebooka ani Twitcha.')}</p>}
      <div className="actions">
        <button className="btn btn-primary" disabled={bad} onClick={save}>{t('Zapisz transmisję')}</button>
        {msg && <span className="ok">{msg}</span>}
      </div>
    </section>
  )
}
