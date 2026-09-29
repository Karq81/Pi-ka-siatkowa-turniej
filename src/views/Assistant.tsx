import { AttachButtons, AttachedList, PhotoTip } from './Attach'
import { t } from '../i18n'
import { useState } from 'react'
import type { AssistantSettings, AssistantSystem } from '../logic/assistantPrompt'

/** What the assistant returns (schema in logic/assistantPrompt.ts). */
export interface AssistantDraft extends Omit<AssistantSettings, 'system'> {
  name: string
  sport: string
  /** A discipline outside the catalogue ("Inna dyscyplina"): its real name, e.g. "Zapasy". */
  sportName?: string
  format: string
  date: string
  time: string
  dayEnd: string
  courts: number
  slotMinutes: number
  categories: { name: string; teams: string[]; groups: string[][]; matches?: { name: string; a: string; b: string; place: number; loserPlace: number }[] }[]
  /** How the tournament is played, read from the description (every system of the site). */
  system?: AssistantSystem
  notes: string
}

const EXAMPLE = t('np. Turniej mini siatkówki dziewcząt 14 marca w Mielnie od 9:00, 4 boiska, mecze co 20 minut, 1 set do 25.\nDwójki: UKS Orzeł 1, UKS Orzeł 2, MKS Fala, Sokół Koszalin, Albatros A…\nTrójki: … (możesz wkleić całą listę z kartki albo maila, także z podziałem na grupy)')

/**
 * "Asystent AI": the organiser describes the tournament or pastes notes (team lists, groups,
 * dates) and the assistant fills in the form, keeping the teams and groups for the tournament.
 */
export function Assistant({ signedIn, onDraft }: { signedIn: boolean; onDraft: (d: AssistantDraft) => void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notes, setNotes] = useState('')
  const [files, setFiles] = useState<File[]>([])

  const ask = async () => {
    setBusy(true)
    setError('')
    setNotes('')
    try {
      // Loaded only when used: the AI part of Firebase is large.
      const { askAssistant } = await import('../store/assistant')
      const draft = await askAssistant(text, files)
      onDraft(draft)
      setNotes(draft.notes)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Asystent jest chwilowo niedostępny.'))
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <section className="ai-hero">
        <DeskArt />
        <div className="ai-hero-text">
          <p className="ai-hero-badge">✨ {t('Nowość · za darmo')}</p>
          <h2>{t('Asystent AI założy turniej za Ciebie')}</h2>
          <p>
            {t('Nie musisz przepisywać drużyn i ustawień. Opisz turniej własnymi słowami, wklej notatki albo zrób zdjęcie kartki: listę drużyn, podział na grupy, dzień i godzinę. Asystent sam:')}
          </p>
          <ul>
            <li>{t('rozpozna dyscyplinę i zasady meczu,')}</li>
            <li>{t('wpisze datę, godzinę, liczbę boisk i kategorie,')}</li>
            <li>{t('przepisze wszystkie drużyny i grupy,')}</li>
            <li>{t('odczyta zdjęcie kartki z listą zawodników,')}</li>
            <li>{t('powie, czego brakuje, żebyś mógł to uzupełnić.')}</li>
          </ul>
          <button className="ai-cta" type="button" onClick={() => setOpen(true)}>✨ {t('Użyj asystenta AI')}</button>
          <p className="ai-hero-note">{t('Wolisz sam? Formularz jest niżej.')}</p>
        </div>
      </section>
    )
  }
  return (
    <section className="panel ai-box">
      <h2>✨ {t('Asystent AI')}</h2>
      {!signedIn && <p className="notice-inline"><a href="#konto">{t('Zaloguj się')}</a>{t(', żeby korzystać z asystenta.')}</p>}
      <label>{t('Opisz turniej albo wklej notatki (lista drużyn, grupy, dzień i godzina, zasady)')}
        <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={EXAMPLE} />
      </label>
      <div className="setup-ai">
        <AttachButtons disabled={busy} onFiles={(more) => setFiles((f) => [...f, ...more].slice(0, 6))} />
        <span className="muted small">{t('Zdjęcie kartki, PDF albo CSV z listą drużyn.')}</span>
      </div>
      <AttachedList files={files} onRemove={(i) => setFiles((f) => f.filter((_, j) => j !== i))} />
      <PhotoTip where="assistant" />
      {error && <p className="error">{error}</p>}
      {notes && <p className="ai-notes"><b>{t('Asystent:')}</b> {notes} {t('Sprawdź formularz poniżej i popraw, co trzeba.')}</p>}
      <div className="actions">
        <button className="btn btn-primary" type="button" disabled={busy || (!text.trim() && !files.length) || !signedIn} onClick={() => void ask()}>
          {busy ? t('Asystent przygotowuje turniej…') : t('Przygotuj turniej')}
        </button>
        <button className="btn" type="button" onClick={() => setOpen(false)}>{t('Zamknij')}</button>
      </div>
      <p className="muted small">
        {t('Asystent wypełnia tylko formularz. Nic nie zapisze się, dopóki nie klikniesz „Dalej”. Asystent działa na Google Gemini: wklejaj nazwy drużyn i ustawienia turnieju, bez telefonów, adresów i innych danych osobowych.')}
      </p>
    </section>
  )
}

/** Someone at a desk with a laptop, and the assistant's sparkles over the screen. */
function DeskArt() {
  const bubble = t('Zrób mi turniej!')
  return (
    <svg className="ai-art" viewBox="0 0 320 240" role="img" aria-label={t('Organizator przy biurku z laptopem i asystentem AI')}>
      <defs>
        <linearGradient id="ai-screen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3d7bff" />
          <stop offset="1" stopColor="#6a2cff" />
        </linearGradient>
      </defs>
      <ellipse cx="160" cy="222" rx="140" ry="12" fill="#0e1b2c" opacity="0.08" />
      {/* chair */}
      <rect x="44" y="118" width="16" height="70" rx="6" fill="#5a6b82" />
      <rect x="40" y="170" width="70" height="12" rx="6" fill="#5a6b82" />
      <rect x="70" y="182" width="6" height="34" fill="#5a6b82" />
      {/* person */}
      <circle cx="96" cy="78" r="20" fill="#f2c7a5" />
      <path d="M76 74 Q80 52 100 56 Q116 60 114 76 Q106 64 92 66 Q82 68 76 74Z" fill="#3b2a20" />
      <path d="M70 170 L70 118 Q70 100 96 100 Q122 100 124 118 L128 150 L100 156 L100 170Z" fill="#1c4fd6" />
      <path d="M118 120 L160 140 L156 150 L112 134Z" fill="#1c4fd6" />
      <circle cx="160" cy="145" r="7" fill="#f2c7a5" />
      <path d="M70 168 L130 168 L136 214 L124 214 L118 182 L78 182Z" fill="#0e1b2c" />
      {/* desk */}
      <rect x="120" y="150" width="180" height="10" rx="4" fill="#8a5a3c" />
      <rect x="130" y="160" width="8" height="58" fill="#6e4730" />
      <rect x="282" y="160" width="8" height="58" fill="#6e4730" />
      {/* laptop */}
      <path d="M170 150 L270 150 L262 144 L178 144Z" fill="#c7cfdb" />
      <rect x="186" y="84" width="76" height="58" rx="5" fill="#0e1b2c" />
      <rect x="191" y="89" width="66" height="48" rx="3" fill="url(#ai-screen)" />
      <rect x="198" y="97" width="40" height="5" rx="2" fill="#fff" opacity="0.9" />
      <rect x="198" y="107" width="52" height="4" rx="2" fill="#fff" opacity="0.6" />
      <rect x="198" y="115" width="46" height="4" rx="2" fill="#fff" opacity="0.6" />
      <rect x="198" y="123" width="30" height="4" rx="2" fill="#fff" opacity="0.6" />
      {/* coffee */}
      <rect x="140" y="132" width="16" height="18" rx="3" fill="#fff" stroke="#0e1b2c" strokeWidth="2" />
      <path d="M156 136 q8 0 8 6 q0 6 -8 6" fill="none" stroke="#0e1b2c" strokeWidth="2" />
      {/* sparkles */}
      <g className="ai-spark s1"><path d="M250 40 l6 14 14 6 -14 6 -6 14 -6 -14 -14 -6 14 -6z" fill="#f5c518" /></g>
      <g className="ai-spark s2"><path d="M288 76 l4 9 9 4 -9 4 -4 9 -4 -9 -9 -4 9 -4z" fill="#6a2cff" /></g>
      <g className="ai-spark s3"><path d="M214 30 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" fill="#3d7bff" /></g>
      {/* speech bubble */}
      <rect x="8" y="14" width="150" height="34" rx="12" fill="#fff" stroke="#d5dde8" />
      <path d="M70 48 l10 10 2 -10z" fill="#fff" />
      <text x="83" y="36" textAnchor="middle" fontSize="12" fontWeight="700" fill="#0e1b2c"
        {...(bubble.length > 18 ? { textLength: 136, lengthAdjust: 'spacingAndGlyphs' } : {})}>{bubble}</text>
    </svg>
  )
}
