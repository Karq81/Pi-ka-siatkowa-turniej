import { BRAND, IS_PLATFORM_HOST } from '../config'
import { signOutAccount, useAccount } from '../store/accounts'

/** The service's logo: an arena with a live dot, and "Sport Live Arena" with "Live" in red. */
export function Wordmark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <a className={`wordmark wordmark-${size}`} href={IS_PLATFORM_HOST ? '/' : '#o-systemie'} aria-label={BRAND}>
      <svg className="wordmark-icon" viewBox="0 0 48 48" aria-hidden="true">
        <defs>
          <linearGradient id="wm-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#3d7bff" />
            <stop offset="1" stopColor="#1c4fd6" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="44" height="44" rx="12" fill="url(#wm-g)" />
        <ellipse cx="24" cy="26" rx="15" ry="10" fill="none" stroke="#fff" strokeWidth="2.6" />
        <ellipse cx="24" cy="26" rx="8" ry="5" fill="none" stroke="#fff" strokeWidth="2" opacity="0.7" />
        <line x1="24" y1="16" x2="24" y2="36" stroke="#fff" strokeWidth="2" opacity="0.7" />
        <circle cx="38" cy="11" r="5" fill="#ff4d45" stroke="#1c4fd6" strokeWidth="2" />
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
          {account.status === 'signed-in' ? (
            <>
              <a className="pf-btn ghost" href="#konto">Moje konto</a>
              <button className="pf-btn ghost" onClick={() => void signOutAccount()}>Wyloguj</button>
            </>
          ) : account.status === 'signed-out' ? (
            <>
              <a className="pf-btn ghost" href="#konto">Zaloguj się</a>
              <a className="pf-btn primary" href="#rejestracja">Załóż konto</a>
            </>
          ) : null}
        </div>
      </div>
    </nav>
  )
}
