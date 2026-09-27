import { BRAND, IS_PLATFORM_HOST } from '../config'
import { t } from '../i18n'
import { signOutAccount, useAccount } from '../store/accounts'
import { LangPicker } from './LangPicker'

/** The service's logo: an arena with a live dot, and "Sport Live Arena" with "Live" in red. */
export function Wordmark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <a className={`wordmark wordmark-${size}`} href={IS_PLATFORM_HOST ? '/' : '#o-systemie'} aria-label={BRAND}>
      <svg className="wordmark-icon" viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <linearGradient id="wm-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#3d7bff" />
            <stop offset="1" stopColor="#6a2cff" />
          </linearGradient>
          <linearGradient id="wm-pitch" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3ddc84" />
            <stop offset="1" stopColor="#1f9d5b" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#wm-bg)" />
        {/* stadium stands */}
        <path d="M10 40 Q32 14 54 40" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity="0.95" />
        <path d="M15 42 Q32 22 49 42" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
        {/* pitch */}
        <ellipse cx="32" cy="46" rx="20" ry="8" fill="url(#wm-pitch)" stroke="#fff" strokeWidth="2" />
        <line x1="32" y1="38" x2="32" y2="54" stroke="#fff" strokeWidth="1.5" opacity="0.8" />
        {/* live signal */}
        <circle cx="49" cy="15" r="5" fill="#ff4d45" />
        <path d="M55 9 a9 9 0 0 1 0 12" fill="none" stroke="#ff8a84" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M58.5 5.5 a14 14 0 0 1 0 19" fill="none" stroke="#ff8a84" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      </svg>
      <span className="wordmark-text">Sport<b>Live</b>Arena</span>
    </a>
  )
}

/** Top bar of the service pages: the logo, and signing in / up, or the account and signing out. */
export function PlatformNav() {
  const account = useAccount()
  return (
    <nav className="pf-nav">
      <div className="pf-wrap pf-nav-inner">
        <Wordmark />
        <div className="pf-nav-actions">
          <LangPicker />
          {account.status === 'signed-in' ? (
            <>
              <span className="pf-user" title={`Login: ${account.account.login}`}>
                <span className="pf-avatar" aria-hidden="true">{(account.account.name || account.account.login).slice(0, 1).toUpperCase()}</span>
                <span className="pf-user-text"><small>{t('Zalogowany')}</small><b>{account.account.name || account.account.login}</b></span>
              </span>
              <a className="pf-btn ghost" href="#moje-turnieje">{t('Moje turnieje')}</a>
              <a className="pf-btn ghost" href="#kredyty">{t('Kredyty')}</a>
              <a className="pf-btn ghost" href="#konto">{t('Moje konto')}</a>
              <button className="pf-btn ghost" onClick={() => void signOutAccount()}>{t('Wyloguj')}</button>
            </>
          ) : account.status === 'signed-out' ? (
            <>
              <a className="pf-btn ghost" href="#konto">{t('Zaloguj się')}</a>
              <a className="pf-btn primary" href="#rejestracja">{t('Załóż konto')}</a>
            </>
          ) : null}
        </div>
      </div>
    </nav>
  )
}
