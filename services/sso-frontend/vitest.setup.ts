import { webcrypto } from 'node:crypto'
import { afterEach, vi } from 'vitest'

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

if (typeof globalThis.crypto?.subtle === 'undefined') {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: webcrypto,
  })
}

afterEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  vi.restoreAllMocks()
})
