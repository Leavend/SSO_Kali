import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useThemeStore } from '../theme.store'

describe('useThemeStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('initializes with a mode value', () => {
    const theme = useThemeStore()
    expect(theme.mode).toBeDefined()
  })

  it('toggle() switches between light and dark', () => {
    const theme = useThemeStore()
    theme.mode = 'light'
    theme.toggle()
    expect(theme.mode).toBe('dark')
    theme.toggle()
    expect(theme.mode).toBe('light')
  })

  it('initialize() does not throw', () => {
    const theme = useThemeStore()
    expect(() => theme.initialize()).not.toThrow()
  })

  it('setMode() selects a specific mode, including system (auto)', () => {
    const theme = useThemeStore()
    theme.setMode('dark')
    expect(theme.mode).toBe('dark')
    theme.setMode('light')
    expect(theme.mode).toBe('light')
    theme.setMode('auto')
    expect(theme.mode).toBe('auto')
  })
})
