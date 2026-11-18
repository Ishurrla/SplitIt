import { useCallback, useSyncExternalStore } from 'react'

// The theme follows the system until the person picks one. The choice is saved in localStorage
// and applied as data-theme on <html>; tokens.css swaps the colour variables from there.
// index.html applies the saved choice before React loads, so there is no flash of the wrong theme.

export type Theme = 'light' | 'dark'
const KEY = 'splitit-theme'
const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

function chosenTheme(): Theme | null {
  const t = document.documentElement.dataset.theme
  return t === 'light' || t === 'dark' ? t : null
}

function effectiveTheme(): Theme {
  return chosenTheme() ?? (darkQuery().matches ? 'dark' : 'light')
}

const listeners = new Set<() => void>()
function subscribe(listener: () => void) {
  listeners.add(listener)
  const query = darkQuery()
  query.addEventListener('change', listener)
  return () => {
    listeners.delete(listener)
    query.removeEventListener('change', listener)
  }
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // Private mode or storage disabled: the choice lasts for this visit only.
  }
  listeners.forEach((l) => {
    l()
  })
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, effectiveTheme)
  const toggle = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme])
  return { theme, toggle }
}
