import { t } from '../i18n'
import { useEffect, useRef, useState } from 'react'

/**
 * Front page demo: a short, looping walk through the service (account → assistant → notes →
 * ready tournament → fans watching). Example data only; nothing is sent anywhere.
 */
const TEAMS = {
  a: [t('Orły'), t('Sokoły'), t('Lwy')],
  b: [t('Tygrysy'), t('Rysie'), t('Wilki')],
}
const NOTES = [
  t('Turniej piłki nożnej orlików, sobota 10:00, 2 boiska, mecze po 15 minut.'),
  `${t('Grupa {letter}', { letter: 'A' })}: ${TEAMS.a.join(', ')}`,
  `${t('Grupa {letter}', { letter: 'B' })}: ${TEAMS.b.join(', ')}`,
].join('\n')

const SCENES = [
  { title: t('Zakładasz konto'), say: t('Nazwa, login i hasło. Minuta i gotowe.'), ms: 4500 },
  { title: t('Otwierasz asystenta AI'), say: t('Jeden przycisk: „Użyj asystenta AI”.'), ms: 2600 },
  { title: t('Piszesz po swojemu'), say: t('Tak, jak na kartce albo w wiadomości do kolegi. Bez tabelek.'), ms: 9000 },
  { title: t('Turniej jest gotowy'), say: t('Asystent ułożył grupy i terminarz. Sprawdzasz, poprawiasz, co chcesz, i klikasz „Dalej”.'), ms: 6000 },
  { title: t('Kibice widzą wyniki'), say: t('Wysyłasz link albo wieszasz kod QR. Wyniki zmieniają się na żywo.'), ms: 6000 },
]

const TICK = 50

/** The part of `text` typed by `time`, starting at `from`, one character every `every` ms. */
function typed(text: string, time: number, from: number, every: number): string {
  return text.slice(0, Math.max(0, Math.floor((time - from) / every)))
}

export function Demo() {
  const [pos, setPos] = useState({ scene: 0, t: 0 })
  const [playing, setPlaying] = useState(true)
  const [visible, setVisible] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  // Plays only while on screen, so a visitor always sees it from where it was.
  useEffect(() => {
    const el = box.current
    if (!el || typeof IntersectionObserver === 'undefined') { setVisible(true); return }
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.35 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!playing || !visible) return
    const id = setInterval(() => setPos((p) => (
      p.t + TICK >= SCENES[p.scene].ms ? { scene: (p.scene + 1) % SCENES.length, t: 0 } : { ...p, t: p.t + TICK }
    )), TICK)
    return () => clearInterval(id)
  }, [playing, visible])

  const { scene, t: time } = pos
  const go = (i: number) => { setPos({ scene: i, t: 0 }); setPlaying(true) }

  return (
    <div className="dm" ref={box}>
      <ol className="dm-steps">
        {SCENES.map((s, i) => (
          <li key={s.title} className={i === scene ? 'on' : i < scene ? 'done' : ''}>
            <button type="button" onClick={() => go(i)}>
              <span className="dm-n">{i + 1}</span>
              <span>
                <b>{s.title}</b>
                {i === scene && <small>{s.say}</small>}
              </span>
            </button>
            {i === scene && <span className="dm-bar" style={{ width: `${(time / s.ms) * 100}%` }} />}
          </li>
        ))}
      </ol>

      <div className="dm-screen" aria-hidden="true">
        <div className="dm-browser">
          <span className="dm-dots"><i /><i /><i /></span>
          <span className="dm-url">sportlivearena.com/{scene === 4 ? '?t=orliki' : scene === 0 ? '#rejestracja' : '#nowy-turniej'}</span>
        </div>
        <div className="dm-body" key={scene}>
          {scene === 0 && <SignUp time={time} />}
          {scene === 1 && <OpenAssistant time={time} />}
          {scene === 2 && <Write time={time} />}
          {scene === 3 && <Ready time={time} />}
          {scene === 4 && <Live time={time} />}
        </div>
      </div>

      <div className="dm-controls">
        <button type="button" className="dm-ctl" onClick={() => setPlaying((p) => !p)}>
          {playing ? `⏸ ${t('Pauza')}` : `▶ ${t('Odtwórz')}`}
        </button>
        <button type="button" className="dm-ctl" onClick={() => go(0)}>↺ {t('Od początku')}</button>
      </div>
    </div>
  )
}

function Field({ label, value, active }: { label: string; value: string; active?: boolean }) {
  return (
    <div className="dm-field">
      <span>{label}</span>
      <div className={active ? 'dm-input on' : 'dm-input'}>{value}{active && <i className="dm-caret" />}</div>
    </div>
  )
}

function SignUp({ time }: { time: number }) {
  const name = typed('UKS Orliki', time, 300, 70)
  const login = typed('orliki', time, 1300, 90)
  const pass = '•'.repeat(Math.min(8, Math.max(0, Math.floor((time - 2200) / 90))))
  return (
    <div className="dm-card dm-narrow">
      <h4>{t('Załóż konto')}</h4>
      <Field label={t('Nazwa klubu albo Twoje imię')} value={name} active={time < 1300} />
      <Field label={t('Login')} value={login} active={time >= 1300 && time < 2200} />
      <Field label={t('Hasło')} value={pass} active={time >= 2200 && time < 3200} />
      <span className={time > 3400 ? 'dm-btn press' : 'dm-btn'}>{t('Załóż konto')}</span>
    </div>
  )
}

function OpenAssistant({ time }: { time: number }) {
  return (
    <div className="dm-card dm-center">
      <p className="dm-muted">{t('Załóż turniej')}</p>
      <h4>{t('Asystent AI założy turniej za Ciebie')}</h4>
      <span className={time > 1500 ? 'dm-ai press' : 'dm-ai'}>✨ {t('Użyj asystenta AI')}</span>
      <p className="dm-muted small">{t('Wolisz sam? Formularz jest niżej.')}</p>
    </div>
  )
}

function Write({ time }: { time: number }) {
  const text = typed(NOTES, time, 300, 45)
  const done = text.length === NOTES.length
  return (
    <div className="dm-card">
      <h4>✨ {t('Asystent AI')}</h4>
      <p className="dm-muted small">{t('Opisz turniej albo wklej notatki')}</p>
      <div className="dm-textarea">{text}{!done && <i className="dm-caret" />}</div>
      <span className={done && time > 8000 ? 'dm-btn press' : 'dm-btn'}>{t('Przygotuj turniej')}</span>
    </div>
  )
}

function Ready({ time }: { time: number }) {
  if (time < 1600) {
    return <div className="dm-card dm-center"><p className="dm-thinking">✨ {t('Asystent układa turniej…')}</p></div>
  }
  return (
    <div className="dm-card dm-pop">
      <p className="dm-tags"><span>⚽ {t('Piłka nożna')}</span><span>{t('sobota')} 10:00</span><span>{t('{n} boiska', { n: 2 })}</span></p>
      <div className="dm-groups">
        {(['a', 'b'] as const).map((g) => (
          <div key={g}><b>{t('Grupa {letter}', { letter: g.toUpperCase() })}</b>{TEAMS[g].map((x) => <span key={x}>{x}</span>)}</div>
        ))}
      </div>
      <ul className="dm-plan">
        <li><b>10:00</b> {t('Boisko {n}', { n: 1 })} · {TEAMS.a[0]} – {TEAMS.a[1]}</li>
        <li><b>10:00</b> {t('Boisko {n}', { n: 2 })} · {TEAMS.b[0]} – {TEAMS.b[1]}</li>
        <li><b>10:15</b> {t('Boisko {n}', { n: 1 })} · {TEAMS.a[2]} – {TEAMS.a[0]}</li>
      </ul>
      <p className="dm-note">✏️ {t('Wszystko możesz jeszcze zmienić')}</p>
    </div>
  )
}

function Live({ time }: { time: number }) {
  const home = time > 2600 ? 2 : 1
  return (
    <div className="dm-live">
      <div className="dm-card">
        <p className="dm-muted small"><span className="dm-red">● {t('NA ŻYWO')}</span> {t('Boisko {n}', { n: 1 })} · {t('Grupa {letter}', { letter: 'A' })}</p>
        <p className="dm-score"><span>{TEAMS.a[0]}</span><b className={time > 2600 && time < 3600 ? 'flash' : ''}>{home}</b></p>
        <p className="dm-score"><span>{TEAMS.a[1]}</span><b>1</b></p>
      </div>
      <div className="dm-card dm-qr">
        <svg viewBox="0 0 7 7" width="64" height="64" shapeRendering="crispEdges">
          {[0, 1, 2, 3, 4, 5, 6].flatMap((y) => [0, 1, 2, 3, 4, 5, 6].map((x) => (
            (x < 3 && y < 3) || (x > 3 && y < 3) || (x < 3 && y > 3) || (x * 3 + y * 5) % 4 === 0
              ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" />
              : null
          )))}
        </svg>
        <span>{t('Link dla kibiców')}<br /><b>sportlivearena.com/?t=orliki</b></span>
      </div>
    </div>
  )
}
