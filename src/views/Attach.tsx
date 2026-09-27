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
