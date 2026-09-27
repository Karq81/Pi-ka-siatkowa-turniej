import { useRef } from 'react'
import { t } from '../i18n'

/** Photo (the phone's camera) and file buttons, for lists on paper, PDFs and CSV files. */
export function AttachButtons({ onFiles, disabled }: { onFiles: (files: File[]) => void; disabled?: boolean }) {
  const photo = useRef<HTMLInputElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    if (files.length) onFiles(files)
  }
  return (
    <span className="attach">
      <button type="button" className="btn" disabled={disabled} onClick={() => photo.current?.click()}>📷 {t('Zrób zdjęcie')}</button>
      <button type="button" className="btn" disabled={disabled} onClick={() => file.current?.click()}>📎 {t('Dodaj plik')}</button>
      <input ref={photo} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
      <input ref={file} type="file" accept="image/*,.pdf,application/pdf,.txt,.csv,text/plain,text/csv" multiple hidden onChange={pick} />
    </span>
  )
}

/** Attached files, each with a button to take it off. */
export function AttachedList({ files, onRemove }: { files: File[]; onRemove: (i: number) => void }) {
  if (!files.length) return null
  return (
    <ul className="attached">
      {files.map((f, i) => (
        <li key={`${f.name}-${i}`}>
          {f.type.startsWith('image/') ? '🖼️' : '📄'} {f.name}
          <button type="button" className="linklike" aria-label={t('Usuń')} onClick={() => onRemove(i)}>✕</button>
        </li>
      ))}
    </ul>
  )
}

/**
 * A hint to photograph lists on paper: on a computer, to sign in on the phone and take the
 * photo there; on a phone, to use the camera button.
 */
export function PhotoTip({ where }: { where: 'assistant' | 'teams' }) {
  const phone = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches
  return (
    <p className="photo-tip">
      <span aria-hidden="true">💡</span>{' '}
      {phone
        ? t('Masz listę zawodników na kartce albo inny dokument (regulamin, terminarz)? Naciśnij „Zrób zdjęcie”, a asystent sam go odczyta.')
        : where === 'assistant'
          ? t('Lista zawodników jest na kartce? Zaloguj się na to samo konto w telefonie, otwórz „Załóż turniej” i zrób zdjęcie listy lub innych dokumentów. Asystent sam je odczyta.')
          : t('Lista zawodników jest na kartce? Otwórz ten panel w telefonie (zaloguj się na to samo konto) i zrób zdjęcie listy. Asystent sam ją przepisze.')}
    </p>
  )
}
