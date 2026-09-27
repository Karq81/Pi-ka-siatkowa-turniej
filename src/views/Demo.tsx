import { useEffect, useRef, useState } from 'react'

/**
 * Front page demo: a short, looping walk through the service (account → assistant → notes →
 * ready tournament → fans watching). Example data only; nothing is sent anywhere.
 */
const NOTES = `Turniej piłki nożnej orlików, sobota 10:00, 2 boiska, mecze po 15 minut.
Grupa A: Orły, Sokoły, Lwy
Grupa B: Tygrysy, Rysie, Wilki`

const SCENES = [
  { title: 'Zakładasz konto', say: 'Nazwa, login i hasło. Minuta i gotowe.', ms: 4500 },
  { title: 'Otwierasz asystenta AI', say: 'Jeden przycisk: „Użyj asystenta AI”.', ms: 2600 },
  { title: 'Piszesz po swojemu', say: 'Tak, jak na kartce albo w wiadomości do kolegi. Bez tabelek.', ms: 9000 },
  { title: 'Turniej jest gotowy', say: 'Asystent ułożył grupy i terminarz. Sprawdzasz, poprawiasz, co chcesz, i klikasz „Dalej”.', ms: 6000 },
  { title: 'Kibice widzą wyniki', say: 'Wysyłasz link albo wieszasz kod QR. Wyniki zmieniają się na żywo.', ms: 6000 },
]

const TICK = 50

/** The part of `text` typed by time `t`, starting at `from`, one character every `every` ms. */
function typed(text: string, t: number, from: number, every: number): string {
  return text.slice(0, Math.max(0, Math.floor((t - from) / every)))
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

  const { scene, t } = pos
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
            {i === scene && <span className="dm-bar" style={{ width: `${(t / s.ms) * 100}%` }} />}
          </li>
        ))}
      </ol>

      <div className="dm-screen" aria-hidden="true">
        <div className="dm-browser">
          <span className="dm-dots"><i /><i /><i /></span>
          <span className="dm-url">sportlivearena.com/{scene === 4 ? '?t=orliki' : scene === 0 ? '#rejestracja' : '#nowy-turniej'}</span>
        </div>
        <div className="dm-body" key={scene}>
          {scene === 0 && <SignUp t={t} />}
          {scene === 1 && <OpenAssistant t={t} />}
          {scene === 2 && <Write t={t} />}
          {scene === 3 && <Ready t={t} />}
          {scene === 4 && <Live t={t} />}
        </div>
      </div>

      <div className="dm-controls">
        <button type="button" className="dm-ctl" onClick={() => setPlaying((p) => !p)}>
          {playing ? '⏸ Pauza' : '▶ Odtwórz'}
        </button>
        <button type="button" className="dm-ctl" onClick={() => go(0)}>↺ Od początku</button>
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

function SignUp({ t }: { t: number }) {
  const name = typed('UKS Orliki', t, 300, 70)
  const login = typed('orliki', t, 1300, 90)
  const pass = '•'.repeat(Math.min(8, Math.max(0, Math.floor((t - 2200) / 90))))
  return (
    <div className="dm-card dm-narrow">
      <h4>Załóż konto</h4>
      <Field label="Nazwa klubu albo Twoje imię" value={name} active={t < 1300} />
      <Field label="Login" value={login} active={t >= 1300 && t < 2200} />
      <Field label="Hasło" value={pass} active={t >= 2200 && t < 3200} />
      <span className={t > 3400 ? 'dm-btn press' : 'dm-btn'}>Załóż konto</span>
    </div>
  )
}

function OpenAssistant({ t }: { t: number }) {
  return (
    <div className="dm-card dm-center">
      <p className="dm-muted">Załóż turniej</p>
      <h4>Asystent AI założy turniej za Ciebie</h4>
      <span className={t > 1500 ? 'dm-ai press' : 'dm-ai'}>✨ Użyj asystenta AI</span>
      <p className="dm-muted small">Wolisz sam? Formularz jest niżej.</p>
    </div>
  )
}

function Write({ t }: { t: number }) {
  const text = typed(NOTES, t, 300, 45)
  const done = text.length === NOTES.length
  return (
    <div className="dm-card">
      <h4>✨ Asystent AI</h4>
      <p className="dm-muted small">Opisz turniej albo wklej notatki</p>
      <div className="dm-textarea">{text}{!done && <i className="dm-caret" />}</div>
      <span className={done && t > 8000 ? 'dm-btn press' : 'dm-btn'}>Przygotuj turniej</span>
    </div>
  )
}

function Ready({ t }: { t: number }) {
  if (t < 1600) {
    return <div className="dm-card dm-center"><p className="dm-thinking">✨ Asystent układa turniej…</p></div>
  }
  return (
    <div className="dm-card dm-pop">
      <p className="dm-tags"><span>⚽ Piłka nożna</span><span>sobota 10:00</span><span>2 boiska</span></p>
      <div className="dm-groups">
        <div><b>Grupa A</b><span>Orły</span><span>Sokoły</span><span>Lwy</span></div>
        <div><b>Grupa B</b><span>Tygrysy</span><span>Rysie</span><span>Wilki</span></div>
      </div>
      <ul className="dm-plan">
        <li><b>10:00</b> Boisko 1 · Orły – Sokoły</li>
        <li><b>10:00</b> Boisko 2 · Tygrysy – Rysie</li>
        <li><b>10:15</b> Boisko 1 · Lwy – Orły</li>
      </ul>
      <p className="dm-note">✏️ Wszystko możesz jeszcze zmienić</p>
    </div>
  )
}

function Live({ t }: { t: number }) {
  const home = t > 2600 ? 2 : 1
  return (
    <div className="dm-live">
      <div className="dm-card">
        <p className="dm-muted small"><span className="dm-red">● NA ŻYWO</span> Boisko 1 · Grupa A</p>
        <p className="dm-score"><span>Orły</span><b className={t > 2600 && t < 3600 ? 'flash' : ''}>{home}</b></p>
        <p className="dm-score"><span>Sokoły</span><b>1</b></p>
      </div>
      <div className="dm-card dm-qr">
        <svg viewBox="0 0 7 7" width="64" height="64" shapeRendering="crispEdges">
          {[0, 1, 2, 3, 4, 5, 6].flatMap((y) => [0, 1, 2, 3, 4, 5, 6].map((x) => (
            (x < 3 && y < 3) || (x > 3 && y < 3) || (x < 3 && y > 3) || (x * 3 + y * 5) % 4 === 0
              ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" />
              : null
          )))}
        </svg>
        <span>Link dla kibiców<br /><b>sportlivearena.com/?t=orliki</b></span>
      </div>
    </div>
  )
}
