import { useEffect, useRef, useState } from 'react'
import { t, tk } from '../i18n'

/** Questions offered on each kind of screen, so nobody has to think what to ask. */
const SUGGESTIONS: Record<string, string[]> = {
  start: [tk('Jak założyć turniej?'), tk('Ile to kosztuje?'), tk('Jak kibice zobaczą wyniki?')],
  account: [tk('Jak założyć turniej?'), tk('Jak zmienić hasło?'), tk('Czym są kredyty?')],
  new: [tk('Co napisać asystentowi?'), tk('Czy mogę dodać zdjęcie listy drużyn?'), tk('Co to jest format meczu?')],
  panel: [tk('Co mam teraz zrobić?'), tk('Jak dodać drużyny ze zdjęcia?'), tk('Jak sędziowie wpisują wyniki?')],
}

const LIMIT = 30

function kind(route: string): { key: string; name: string } {
  if (route === 'nowy-turniej') return { key: 'new', name: 'Załóż turniej (formularz i asystent AI)' }
  if (['konto', 'rejestracja', 'moje-turnieje', 'kredyty'].includes(route)) return { key: 'account', name: `Konto: ${route}` }
  if (route.startsWith('panel') || ['admin', 'kartki', 'sedzia', 'tv'].includes(route)) return { key: 'panel', name: `Panel organizatora: ${route || 'panel'}` }
  return { key: 'start', name: 'Strona główna serwisu' }
}

/**
 * "✨ Pomoc": a small help desk in the corner of the organiser's screens. The AI assistant
 * answers questions about using the site, step by step, in the visitor's language.
 */
export function HelpBot({ route }: { route: string }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState<{ q: string; a: string }[]>([])
  const [error, setError] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const page = kind(route)
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [history, busy])

  const ask = async (question: string) => {
    const text = question.trim()
    if (!text || busy) return
    if (history.length >= LIMIT) { setError(t('Limit pytań na tę wizytę się skończył. Odśwież stronę później.')); return }
    setBusy(true)
    setError('')
    setQ('')
    try {
      const { askHelp } = await import('../store/assistant')
      const a = await askHelp(text, page.name, history)
      setHistory((h) => [...h, { q: text, a: a.trim() }])
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Asystent jest chwilowo niedostępny.'))
      setQ(text)
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return <button type="button" className="help-fab" onClick={() => setOpen(true)}>✨ {t('Pomoc')}</button>
  }
  return (
    <aside className="help-box" aria-label={t('Pomoc')}>
      <header>
        <b>✨ {t('Asystent AI')}</b>
        <button type="button" className="linklike" aria-label={t('Zamknij')} onClick={() => setOpen(false)}>✕</button>
      </header>
      <div className="help-log">
        <p className="help-a">{t('Cześć! Zapytaj o cokolwiek, a poprowadzę Cię krok po kroku.')}</p>
        {history.map((h, i) => (
          <div key={i}>
            <p className="help-q">{h.q}</p>
            <p className="help-a"><Rich text={h.a} /></p>
          </div>
        ))}
        {busy && <p className="help-a help-busy">{t('Asystent pisze…')}</p>}
        {!history.length && !busy && (
          <div className="help-chips">
            {SUGGESTIONS[page.key].map((s) => (
              <button key={s} type="button" className="chip" onClick={() => void ask(t(s))}>{t(s)}</button>
            ))}
          </div>
        )}
        {error && <p className="error small">{error}</p>}
        <div ref={end} />
      </div>
      <form className="help-form" onSubmit={(e) => { e.preventDefault(); void ask(q) }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Napisz pytanie…')} aria-label={t('Napisz pytanie…')} />
        <button className="btn btn-ai" type="submit" disabled={busy || !q.trim()}>{t('Wyślij')}</button>
      </form>
    </aside>
  )
}

/** The assistant's answer with its **bold** and *italic* marks shown as such. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*)/).map((part, i) =>
        part.startsWith('**') ? <b key={i}>{part.slice(2, -2)}</b>
          : part.startsWith('*') && part.length > 2 ? <i key={i}>{part.slice(1, -1)}</i>
            : part)}
    </>
  )
}
