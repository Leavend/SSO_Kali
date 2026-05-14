import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ThemeToggle from '../ThemeToggle.vue'

const THEME_STORAGE_KEY = 'devsso-theme-preference'

describe('ThemeToggle Component', () => {
  const originalLocalStorage = window.localStorage
  const originalMatchMedia = window.matchMedia
  const originalCookieDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')

  const localStorageMock = (() => {
    let store: Record<string, string> = {}
    return {
      getItem: (key: string): string | null => store[key] ?? null,
      setItem: (key: string, value: string): void => { store[key] = String(value) },
      removeItem: (key: string): void => { delete store[key] },
      clear: (): void => { store = {} }
    }
  })()

  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
      configurable: true
    })

    if (originalCookieDescriptor) {
      Object.defineProperty(document, 'cookie', {
        configurable: true,
        enumerable: true,
        get: vi.fn(() => ''),
        set: vi.fn()
      })
    }

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    })

    document.documentElement.removeAttribute('data-theme')
    document.documentElement.classList.remove('dark')
    localStorageMock.clear()
  })

  afterEach(() => {
    if (originalCookieDescriptor) {
      Object.defineProperty(document, 'cookie', originalCookieDescriptor)
    }
    Object.defineProperty(window, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
      configurable: true
    })
    Object.defineProperty(window, 'matchMedia', {
      value: originalMatchMedia,
      writable: true,
      configurable: true
    })
    vi.clearAllMocks()
  })

  describe('Initial Theme Resolution', () => {
    it('respects localStorage preference when set', () => {
      localStorageMock.setItem(THEME_STORAGE_KEY, 'dark')
      const wrapper = mount(ThemeToggle, { props: { systemPreference: true } })
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
      wrapper.unmount()
    })

    it('respects system preference when no localStorage', () => {
      vi.mocked(window.matchMedia).mockReturnValue({
        matches: true,
        media: '(prefers-color-scheme: dark)',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      } as unknown as MediaQueryList)
      const wrapper = mount(ThemeToggle, { props: { systemPreference: true } })
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
      wrapper.unmount()
    })

    it('uses initialTheme prop when no preference', () => {
      const wrapper = mount(ThemeToggle, { props: { initialTheme: 'light', systemPreference: false } })
      expect(document.documentElement.getAttribute('data-theme')).toBe('light')
      wrapper.unmount()
    })
  })

  describe('Theme Toggle Functionality', () => {
    it('toggles from light to dark', async () => {
      const wrapper = mount(ThemeToggle, { props: { initialTheme: 'light', systemPreference: false } })
      expect(document.documentElement.getAttribute('data-theme')).toBe('light')
      await wrapper.find('button').trigger('click')
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
      expect(localStorageMock.getItem(THEME_STORAGE_KEY)).toBe('dark')
      wrapper.unmount()
    })

    it('toggles from dark to light', async () => {
      const wrapper = mount(ThemeToggle, { props: { initialTheme: 'dark', systemPreference: false } })
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
      await wrapper.find('button').trigger('click')
      expect(document.documentElement.getAttribute('data-theme')).toBe('system')
      expect(localStorageMock.getItem(THEME_STORAGE_KEY)).toBe('system')
      wrapper.unmount()
    })

    it('persists theme across remounts', () => {
      localStorageMock.setItem(THEME_STORAGE_KEY, 'dark')
      const wrapper1 = mount(ThemeToggle, { props: { systemPreference: true } })
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
      wrapper1.unmount()
      const wrapper2 = mount(ThemeToggle, { props: { systemPreference: true } })
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
      wrapper2.unmount()
    })
  })

  describe('Accessibility', () => {
    it('has correct aria-label for dark mode', () => {
      const wrapper = mount(ThemeToggle, { props: { initialTheme: 'dark', systemPreference: false } })
      const button = wrapper.find('button')
      expect(button.attributes('aria-label')).toBe('Beralih ke mode terang')
      wrapper.unmount()
    })

    it('has correct aria-label for light mode', () => {
      const wrapper = mount(ThemeToggle, { props: { initialTheme: 'light', systemPreference: true } })
      const button = wrapper.find('button')
      expect(button.attributes('aria-label')).toBe('Beralih ke mode gelap')
      wrapper.unmount()
    })

    it('marks icons as aria-hidden', () => {
      const wrapper = mount(ThemeToggle, { props: { initialTheme: 'light', systemPreference: true } })
      const icon = wrapper.find('svg')
      expect(icon.attributes('aria-hidden')).toBe('true')
      wrapper.unmount()
    })
  })

  describe('Cookie Fallback', () => {
    beforeEach(() => {
      vi.spyOn(localStorageMock, 'getItem').mockImplementation(() => { throw new Error('localStorage disabled') })
      vi.spyOn(localStorageMock, 'setItem').mockImplementation(() => { throw new Error('localStorage disabled') })
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('falls back to cookie when localStorage fails', async () => {
      const cookieEntries: string[] = []
      const mockGetCookie = vi.fn(() => cookieEntries.join('; '))
      const mockSetCookie = vi.fn((cookie: string) => {
        cookieEntries.push(cookie)
      })

      Object.defineProperty(document, 'cookie', {
        configurable: true,
        enumerable: true,
        get: mockGetCookie,
        set: mockSetCookie
      })

      const wrapper = mount(ThemeToggle, { props: { initialTheme: 'dark', systemPreference: false } })
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
      await wrapper.find('button').trigger('click')
      expect(mockSetCookie).toHaveBeenCalled()
      expect(mockSetCookie.mock.calls[0][0]).toContain('devsso-theme-preference=system')
      wrapper.unmount()
    })
  })

  describe('Component Lifecycle', () => {
    it('applies theme on mount', () => {
      localStorageMock.setItem(THEME_STORAGE_KEY, 'dark')
      mount(ThemeToggle, { props: { systemPreference: true } })
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    })

    it('removes listener on unmount', () => {
      const removeEventListenerMock = vi.fn()
      vi.mocked(window.matchMedia).mockReturnValue({
        matches: false,
        media: '(prefers-color-scheme: dark)',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: removeEventListenerMock,
        dispatchEvent: vi.fn()
      } as unknown as MediaQueryList)
      const wrapper = mount(ThemeToggle, { props: { systemPreference: true } })
      wrapper.unmount()
      expect(removeEventListenerMock).toHaveBeenCalled()
    })
  })
})
