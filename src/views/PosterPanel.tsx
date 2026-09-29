import { useEffect, useRef, useState } from 'react'
import { ConfirmDialog } from '../ui'
import { locale, t } from '../i18n'
import { askPoster } from '../store/assistant'
import { loadPosterFacts, savePoster, type Account, type AccountTournament } from '../store/accounts'
import { defaultPoster, FIELD_LIMITS, MAX_LINES, normalizePoster, POSTER_THEMES, THEME_COLORS, THEME_NAMES, type Poster, type PosterFacts } from '../logic/poster'
import { sportLabelOf } from '../logic/sports'
import { renderPoster } from './posterCanvas'

/** Prints an image on one A4 page (from a hidden frame, so nothing else on the page is printed). */
function printImage(src: string) {
  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(frame)
  const doc = frame.contentDocument!
  doc.open()
  doc.write(`<!doctype html><title>${t('Plakat')}</title><style>@page{size:A4;margin:0}html,body{margin:0}img{width:100%;display:block}</style><img src="${src}">`)
  doc.close()
  const img = doc.querySelector('img')!
  const go = () => { frame.contentWindow?.focus(); frame.contentWindow?.print(); setTimeout(() => frame.remove(), 60_000) }
  if (img.complete) go(); else img.onload = go
}

const fileName = (id: string) => `plakat-${id.replace(/[^a-z0-9-]/gi, '')}.png`

/**
 * "Plakat do wydarzenia" on a tournament's page in the account: made from the tournament's
 * data (or by the AI from the organiser's instruction), edited by hand, downloaded, printed
 * or sent, and deleted to start a new one. The poster's text is kept on the account.
 */
export function PosterPanel({ account, tr, url }: { account: Account; tr: AccountTournament; url: string }) {
  const saved = account.posters?.[tr.id]
  const [poster, setPoster] = useState<Poster | null>(saved ? normalizePoster(saved) : null)
  const [image, setImage] = useState('')
  const [wish, setWish] = useState('')
  const [busy, setBusy] = useState<'' | 'make' | 'ai' | 'delete'>('')
  const [error, setError] = useState('')
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState('')
  const facts = useRef<PosterFacts | null>(null)
  const saveTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!poster) { setImage(''); return }
    let live = true
    void renderPoster(normalizePoster(poster)).then((c) => { if (live) setImage(c.toDataURL('image/png')) }).catch(() => { if (live) setError(t('Nie udało się narysować plakatu.')) })
    return () => { live = false }
  }, [poster])
  useEffect(() => () => window.clearTimeout(saveTimer.current), [])

  const readFacts = async () => {
    facts.current ??= await loadPosterFacts(tr.id, account, url, sportLabelOf)
    return facts.current
  }
  const persist = async (p: Poster) => {
    try { await savePoster(tr.id, p) } catch (e) { console.warn('poster save', e); setError(t('Nie udało się zapisać plakatu. Sprawdź internet.')) }
  }
  const create = async (withAi: boolean) => {
    setError(''); setNote(''); setBusy(withAi ? 'ai' : 'make')
    try {
      const f = await readFacts()
      const p = withAi ? await askPoster(f, null, wish) : defaultPoster(f, locale())
      setPoster(p)
      await persist(p)
      setWish('')
    } catch (e) {
      setError((e as Error).message || t('Nie udało się przygotować plakatu.'))
    } finally { setBusy('') }
  }
  const improve = async () => {
    if (!poster || !wish.trim()) return
    setError(''); setNote(''); setBusy('ai')
    try {
      const p = await askPoster(await readFacts(), poster, wish)
      setPoster(p)
      await persist(p)
      setWish('')
    } catch (e) {
      setError((e as Error).message || t('Nie udało się poprawić plakatu.'))
    } finally { setBusy('') }
  }
  const edit = (patch: Partial<Poster>) => {
    if (!poster) return
    const p = normalizePoster({ ...poster, ...patch })
    // Typing keeps its own spaces and line breaks; only the saved copy is tidied.
    setPoster({ ...poster, ...patch, url: poster.url })
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => void persist(p), 800)
  }
  const remove = async () => {
    setAsking(false); setError(''); setNote(''); setBusy('delete')
    window.clearTimeout(saveTimer.current)
    try {
      await savePoster(tr.id, null)
      setPoster(null)
    } catch (e) {
      console.warn('poster delete', e)
      setError(t('Nie udało się usunąć plakatu. Sprawdź internet.'))
    } finally { setBusy('') }
  }
  const share = async () => {
    setNote('')
    try {
      const blob = await (await fetch(image)).blob()
      const file = new File([blob], fileName(tr.id), { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: poster?.title, text: `${poster?.title ?? ''} ${url}`.trim() })
      else setNote(t('Ta przeglądarka nie potrafi wysłać obrazu. Pobierz plakat i wyślij go sam.'))
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setNote(t('Nie udało się wysłać. Pobierz plakat i wyślij go sam.'))
    }
  }
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const wishBox = (
    <label className="poster-wish">{poster ? t('Powiedz asystentowi AI, co zmienić na plakacie') : t('Co ma być na plakacie? (nieobowiązkowe)')}
      <textarea rows={3} maxLength={2000} value={wish} onChange={(e) => setWish(e.target.value)}
        placeholder={t('np. dodaj wpisowe 100 zł, nagrody dla trzech pierwszych miejsc, start o 9:00 w hali sportowej, kolory zielone, hasło „Gramy fair play”')} />
    </label>
  )

  return (
    <section className="panel poster-panel">
      <h2>🖼 {t('Plakat do wydarzenia')}</h2>
      {!poster && (
        <>
          <p className="muted">{t('Plakat z nazwą turnieju, terminem, miejscem, szczegółami i kodem QR do strony z wynikami. Możesz go wydrukować, pobrać albo wysłać.')}</p>
          {wishBox}
          <div className="actions">
            <button type="button" className="btn btn-primary btn-lg" disabled={!!busy} onClick={() => void create(false)}>
              {busy === 'make' ? t('Tworzę…') : t('Utwórz plakat')}
            </button>
            <button type="button" className="btn btn-lg" disabled={!!busy} onClick={() => void create(true)}>
              {busy === 'ai' ? t('Asystent pracuje…') : `✨ ${t('Utwórz z pomocą AI')}`}
            </button>
          </div>
        </>
      )}
      {poster && (
        <>
          <div className="poster-view">
            {image ? <img src={image} alt={poster.title} /> : <p className="muted">{t('Rysuję plakat…')}</p>}
          </div>
          <div className="actions poster-actions">
            <button type="button" className="btn" disabled={!image} onClick={() => printImage(image)}>🖨 {t('Drukuj / PDF')}</button>
            <a className="btn" download={fileName(tr.id)} href={image || undefined} aria-disabled={!image}>⬇ {t('Pobierz')}</a>
            {canShare && <button type="button" className="btn" disabled={!image} onClick={() => void share()}>📤 {t('Wyślij')}</button>}
            <button type="button" className="btn btn-danger" disabled={!!busy} onClick={() => setAsking(true)}>🗑 {t('Usuń plakat')}</button>
          </div>
          {wishBox}
          <div className="actions">
            <button type="button" className="btn btn-primary" disabled={!!busy || !wish.trim()} onClick={() => void improve()}>
              {busy === 'ai' ? t('Asystent pracuje…') : `✨ ${t('Popraw z pomocą AI')}`}
            </button>
          </div>
          <details className="poster-edit">
            <summary>{t('Edytuj teksty ręcznie')}</summary>
            <div className="poster-fields">
              <label>{t('Nad tytułem')}<input maxLength={FIELD_LIMITS.kicker} value={poster.kicker} onChange={(e) => edit({ kicker: e.target.value })} /></label>
              <label>{t('Tytuł')}<input maxLength={FIELD_LIMITS.title} value={poster.title} onChange={(e) => edit({ title: e.target.value })} /></label>
              <label>{t('Hasło pod tytułem')}<input maxLength={FIELD_LIMITS.tagline} value={poster.tagline} onChange={(e) => edit({ tagline: e.target.value })} /></label>
              <label>{t('Kiedy')}<input maxLength={FIELD_LIMITS.when} value={poster.when} onChange={(e) => edit({ when: e.target.value })} /></label>
              <label>{t('Gdzie')}<input maxLength={FIELD_LIMITS.where} value={poster.where} onChange={(e) => edit({ where: e.target.value })} /></label>
              <label>{t('Szczegóły (jedna linia = jeden punkt, do {n})', { n: MAX_LINES })}
                <textarea rows={5} value={poster.lines.join('\n')} onChange={(e) => edit({ lines: e.target.value.split('\n').slice(0, MAX_LINES) })} />
              </label>
              <label>{t('Linia na dole')}<input maxLength={FIELD_LIMITS.footer} value={poster.footer} onChange={(e) => edit({ footer: e.target.value })} /></label>
              <div className="poster-themes" role="group" aria-label={t('Kolory')}>
                {POSTER_THEMES.map((th) => (
                  <button key={th} type="button" className={`poster-theme${poster.theme === th ? ' on' : ''}`} aria-pressed={poster.theme === th}
                    style={{ background: `linear-gradient(135deg, ${THEME_COLORS[th].bg1}, ${THEME_COLORS[th].bg2})`, color: '#fff' }}
                    onClick={() => edit({ theme: th })}>{t(THEME_NAMES[th])}</button>
                ))}
              </div>
            </div>
          </details>
        </>
      )}
      {note && <p className="muted small">{note}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {asking && (
        <ConfirmDialog
          question={<>
            <b>{t('Usunąć plakat?')}</b>
            <p>{t('Plakat zniknie z konta. Potem możesz utworzyć nowy.')}</p>
          </>}
          yes={t('Tak, usuń plakat')}
          no={t('Nie, zostaw')}
          onYes={() => void remove()}
          onNo={() => setAsking(false)}
        />
      )}
    </section>
  )
}
