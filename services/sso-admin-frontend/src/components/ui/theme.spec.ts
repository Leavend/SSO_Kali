import { beforeEach, describe, expect, it } from 'vitest'
import { useTheme } from './useTheme'

describe('useTheme', () => {
  beforeEach(() => {
    document.documentElement.className = ''
    window.localStorage.clear()
  })

  it('syncs dark mode token class without touching auth storage', () => {
    const { setTheme, theme, isDark } = useTheme()

    setTheme('dark')

    expect(theme.value).toBe('dark')
    expect(isDark.value).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(window.localStorage.getItem('dev-sso-admin-theme')).toBe('dark')
  })
})
