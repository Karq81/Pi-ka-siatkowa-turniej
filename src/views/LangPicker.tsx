import { currentLang, LANGS, setLang, t, type Lang } from '../i18n'

/** Language choice: a small select with a globe; choosing reloads the page in that language. */
export function LangPicker({ className = '' }: { className?: string }) {
  return (
    <label className={`lang-pick ${className}`} title={t('Język')}>
      <span aria-hidden="true">🌐</span>
      <select aria-label={t('Język')} value={currentLang()} onChange={(e) => setLang(e.target.value as Lang)}>
        {LANGS.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
      </select>
    </label>
  )
}
