import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, vi } from 'vitest'
import { useI18n } from '@/composables/useI18n'

type StorageState = Record<string, string>

function createStorageMock(): Storage {
  let state: StorageState = {}

  return {
    get length(): number {
      return Object.keys(state).length
    },
    clear(): void {
      state = {}
    },
    getItem(key: string): string | null {
      return state[key] ?? null
    },
    key(index: number): string | null {
      return Object.keys(state)[index] ?? null
    },
    removeItem(key: string): void {
      delete state[key]
    },
    setItem(key: string, value: string): void {
      state[key] = String(value)
    },
  }
}

function installStorageMock(name: 'localStorage' | 'sessionStorage'): void {
  const currentStorage = window[name]
  const hasValidStorage =
    typeof currentStorage?.getItem === 'function' &&
    typeof currentStorage?.setItem === 'function' &&
    typeof currentStorage?.removeItem === 'function' &&
    typeof currentStorage?.clear === 'function'

  if (hasValidStorage) return

  Object.defineProperty(window, name, {
    configurable: true,
    value: createStorageMock(),
  })
}

installStorageMock('localStorage')
installStorageMock('sessionStorage')

// ISS-PERF2 regression guard: jsdom's default `navigator.language` is
// 'en-US' which would otherwise make `detectInitialLocale()` return 'en'
// and leak English strings into tests that expect Indonesian copy. The
// portal is Indonesian-first, so the test environment should default
// to 'id' unless a test explicitly opts in to a different locale.
if (typeof globalThis.navigator !== 'undefined') {
  try {
    Object.defineProperty(globalThis.navigator, 'language', {
      configurable: true,
      get(): string {
        return 'id-ID'
      },
    })
  } catch {
    // best-effort: setup also re-installs via beforeEach
  }
}

if (typeof globalThis.crypto?.subtle === 'undefined') {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: webcrypto,
  })
}

// ISS-PERF2 regression guard: reset i18n to 'id' BEFORE every test so each
// test sees a deterministic initial state regardless of what the prior
// test (or the navigator) did. The navigator stub is re-installed in
// beforeEach because `vi.restoreAllMocks()` in afterEach reverts the
// global stub created at module load time.
beforeEach(() => {
  vi.stubGlobal('navigator', { ...(typeof navigator !== 'undefined' ? navigator : {}), language: 'id-ID' } as Navigator)
  void useI18n().setLocale('id')
})

afterEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  // Reset the lazy-loaded i18n state again after the test so the next
  // test's `beforeEach` doesn't inherit the previous locale.
  void useI18n().setLocale('id')
  vi.restoreAllMocks()
})
