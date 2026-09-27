import { useState } from 'react'

/** What the assistant returns (schema in logic/assistantPrompt.ts). */
export interface AssistantDraft {
  name: string
  sport: string
  format: string
  date: string
  time: string
  dayEnd: string
  courts: number
  slotMinutes: number
  categories: { name: string; teams: string[]; groups: string[][] }[]
  notes: string
}

const EXAMPLE = `np. Turniej mini siatkówki dziewcząt 14 marca w Mielnie od 9:00, 4 boiska, mecze co 20 minut, 1 set do 25.
Dwójki: UKS Orzeł 1, UKS Orzeł 2, MKS Fala, Sokół Koszalin, Albatros A…
Trójki: … (możesz wkleić całą listę z kartki albo maila, także z podziałem na grupy)`

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

  const ask = async () => {
    setBusy(true)
    setError('')
    setNotes('')
    try {
      // Loaded only when used: the AI part of Firebase is large.
      const { askAssistant } = await import('../store/assistant')
      const draft = await askAssistant(text)
      onDraft(draft)
      setNotes(draft.notes)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Asystent jest chwilowo niedostępny.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <section className="panel ai-teaser">
        <div>
          <b>✨ Asystent AI</b>
          <span className="muted"> Opisz turniej własnymi słowami albo wklej notatki z listą drużyn, a asystent wypełni formularz za Ciebie.</span>
        </div>
        <button className="btn btn-primary" type="button" onClick={() => setOpen(true)}>Użyj asystenta</button>
      </section>
    )
  }
  return (
    <section className="panel ai-box">
      <h2>✨ Asystent AI</h2>
      {!signedIn && <p className="notice-inline"><a href="#konto">Zaloguj się</a>, żeby korzystać z asystenta.</p>}
      <label>Opisz turniej albo wklej notatki (lista drużyn, grupy, dzień i godzina, zasady)
        <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={EXAMPLE} />
      </label>
      {error && <p className="error">{error}</p>}
      {notes && <p className="ai-notes"><b>Asystent:</b> {notes} Sprawdź formularz poniżej i popraw, co trzeba.</p>}
      <div className="actions">
        <button className="btn btn-primary" type="button" disabled={busy || !text.trim() || !signedIn} onClick={() => void ask()}>
          {busy ? 'Asystent przygotowuje turniej…' : 'Przygotuj turniej'}
        </button>
        <button className="btn" type="button" onClick={() => setOpen(false)}>Zamknij</button>
      </div>
      <p className="muted small">
        Asystent wypełnia tylko formularz. Nic nie zapisze się, dopóki nie klikniesz „Dalej”. Asystent działa na Google
        Gemini: wklejaj nazwy drużyn i ustawienia turnieju, bez telefonów, adresów i innych danych osobowych.
      </p>
    </section>
  )
}
