import type { ReactNode } from 'react'
import { t } from '../i18n'
import { DemoPlayer, type DemoScene } from './Demo'

/**
 * Front page demo of live video with the SportCast app: the organiser shows the code, the
 * camera phone scans it and picks a court, the referee scores, the score is on the stream.
 * Example data only.
 */
const A = t('Orły')
const B = t('Sokoły')
const CODE = 'orliki/K7M2QX4P9A'

const SCENES: DemoScene[] = [
  { title: t('Organizator pokazuje kod'), say: t('W panelu: Więcej → Transmisja wideo → „Włącz i pokaż kod dla SportCast”.'), ms: 4500 },
  { title: t('Operator skanuje kod telefonem'), say: t('W aplikacji SportCast: „Transmisja z sportlivearena.com” i skan kodu QR.'), ms: 4500 },
  { title: t('Wybiera boisko'), say: t('Aplikacja sama pokazuje boiska turnieju i to, kto teraz gra.'), ms: 3500 },
  { title: t('Sędzia liczy punkty jak zwykle'), say: t('Na swoim telefonie, w panelu sędziego. Nic więcej nie robi.'), ms: 4000 },
  { title: t('Wynik sam zmienia się na streamie'), say: t('Po sekundzie ten sam wynik jest na obrazie na YouTube czy Facebooku, a kibice widzą go też na stronie turnieju.'), ms: 6500 },
]

const URLS = [
  'sportlivearena.com/?t=orliki#panel-wiecej',
  'SportCast · Android',
  'SportCast · Android',
  'sportlivearena.com/?t=orliki#boisko-1',
  'youtube.com/live/…',
]

export function StreamDemo() {
  return (
    <DemoPlayer
      scenes={SCENES}
      url={(scene) => URLS[scene]}
      render={(scene, time) => (
        <>
          {scene === 0 && <OrganiserCode time={time} />}
          {scene === 1 && <Scan time={time} />}
          {scene === 2 && <Courts time={time} />}
          {scene === 3 && <Referee time={time} />}
          {scene === 4 && <OnStream time={time} />}
        </>
      )}
    />
  )
}

/** A made-up QR-like pattern (not a real code). */
function FakeQr({ size = 96 }: { size?: number }) {
  return (
    <svg viewBox="0 0 9 9" width={size} height={size} shapeRendering="crispEdges">
      {Array.from({ length: 81 }, (_, i) => {
        const x = i % 9
        const y = Math.floor(i / 9)
        const corner = (x < 3 && y < 3) || (x > 5 && y < 3) || (x < 3 && y > 5)
        return corner || (x * 5 + y * 3) % 4 === 0 ? <rect key={i} x={x} y={y} width="1" height="1" fill="currentColor" /> : null
      })}
    </svg>
  )
}

function OrganiserCode({ time }: { time: number }) {
  const shown = time > 1500
  return (
    <div className="dm-card dm-center">
      <p className="dm-muted small">📺 {t('Transmisja wideo na żywo')}</p>
      <h4>📱 {t('Nadajesz aplikacją SportCast?')}</h4>
      {!shown && <span className={time > 900 ? 'dm-btn press' : 'dm-btn'}>{t('Włącz i pokaż kod dla SportCast')}</span>}
      {shown && (
        <div className="dm-pop sd-code">
          <span className="sd-qr"><FakeQr /></span>
          <span className="dm-muted small">{t('Kod turnieju do wpisania:')} <b>{CODE}</b></span>
          <span className="dm-muted small">🔒 {t('Kod widzi tylko organizator.')}</span>
        </div>
      )}
    </div>
  )
}

function Phone({ children }: { children: ReactNode }) {
  return <div className="sd-phone"><div className="sd-phone-screen">{children}</div></div>
}

function Scan({ time }: { time: number }) {
  const scanning = time > 1400
  const done = time > 3300
  return (
    <Phone>
      {!scanning ? (
        <div className="sd-app">
          <p className="sd-app-title">SportCast</p>
          <span className="sd-tile">🎥 {t('Zacznij nową transmisję')}</span>
          <span className={time > 800 ? 'sd-tile on press' : 'sd-tile on'}>🔗 {t('Transmisja z sportlivearena.com')}</span>
          <span className="sd-tile">⏺ {t('Nagraj mecz offline')}</span>
        </div>
      ) : (
        <div className="sd-viewfinder">
          <span className="sd-qr big"><FakeQr size={110} /></span>
          {!done && <i className="sd-scanline" />}
          {done && <span className="sd-ok dm-pop">✓ {t('Połączono')}</span>}
        </div>
      )}
    </Phone>
  )
}

function Courts({ time }: { time: number }) {
  return (
    <Phone>
      <div className="sd-app">
        <p className="sd-app-title">{t('Które boisko filmujesz?')}</p>
        <span className={time > 1800 ? 'sd-tile on press' : 'sd-tile'}>{t('Boisko {n}', { n: 1 })} · {A} – {B} <b>1:0</b></span>
        <span className="sd-tile">{t('Boisko {n}', { n: 2 })} · {t('Lwy')} – {t('Tygrysy')}</span>
        <span className="sd-tile">{t('Boisko {n}', { n: 3 })} · {t('Rysie')} – {t('Wilki')}</span>
      </div>
    </Phone>
  )
}

function Referee({ time }: { time: number }) {
  const a = time > 1600 ? 13 : 12
  return (
    <Phone>
      <div className="sd-ref">
        <p className="sd-app-title">{t('Boisko {n}', { n: 1 })} · {t('Set {n}', { n: 2 })}</p>
        <div className="sd-pads">
          <div><small>{A}</small><b className={time > 1600 && time < 2600 ? 'flash' : ''}>{a}</b><span className={time > 1300 && time < 1700 ? 'sd-plus press' : 'sd-plus'}>+1</span></div>
          <div><small>{B}</small><b>10</b><span className="sd-plus">+1</span></div>
        </div>
      </div>
    </Phone>
  )
}

function OnStream({ time }: { time: number }) {
  const a = time > 2600 ? 14 : 13
  return (
    <div className="sd-video">
      <div className="sd-court" />
      <div className="sd-overlay">
        <div><span>{A.toUpperCase()}</span><em>1</em><b className={time > 2600 && time < 3800 ? 'flash' : ''}>{a}</b></div>
        <div><span>{B.toUpperCase()}</span><em>0</em><b>10</b></div>
      </div>
      <span className="sd-live">● LIVE</span>
      <p className="sd-caption">{t('Tablica wyników rysuje się sama, prosto z panelu sędziego')}</p>
    </div>
  )
}
