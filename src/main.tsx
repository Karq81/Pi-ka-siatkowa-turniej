import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { IS_ALBATROS, IS_LANDING } from './config'
import { initLang, t } from './i18n'
import './styles.css'

// The language is loaded before the app's modules, so their texts are already translated.
// Albatros CUP opens in Polish unless the visitor chose another language.
void initLang(IS_ALBATROS && !IS_LANDING ? 'pl' : undefined)
  .then(() => {
    document.title = t('SportLiveArena – wyniki turniejów na żywo')
    return import('./App')
  })
  .then(({ App }) => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
