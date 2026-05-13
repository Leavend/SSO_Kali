import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNetworkStatus } from '../useNetworkStatus'

describe('useNetworkStatus', () => {
  let listeners: Record<string, Array<() => void>>

  beforeEach(() => {
    listeners = {}
    vi.stubGlobal('navigator', { onLine: true })
    vi.stubGlobal('addEventListener', (event: string, fn: () => void) => {
      listeners[event] = listeners[event] ?? []
      listeners[event]!.push(fn)
    })
    vi.stubGlobal('removeEventListener', (event: string, fn: () => void) => {
      listeners[event] = (listeners[event] ?? []).filter((l) => l !== fn)
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('initializes as online when navigator.onLine is true', () => {
    const { isOnline } = useNetworkStatus()
    expect(isOnline.value).toBe(true)
  })

  it('initializes as offline when navigator.onLine is false', () => {
    vi.stubGlobal('navigator', { onLine: false })
    const { isOnline } = useNetworkStatus()
    expect(isOnline.value).toBe(false)
  })

  it('transitions to offline when offline event fires', () => {
    const { isOnline } = useNetworkStatus()
    expect(isOnline.value).toBe(true)

    // Simulate offline event
    listeners['offline']?.forEach((fn) => fn())
    expect(isOnline.value).toBe(false)
  })

  it('transitions to online when online event fires', () => {
    vi.stubGlobal('navigator', { onLine: false })
    const { isOnline } = useNetworkStatus()
    expect(isOnline.value).toBe(false)

    // Simulate online event
    listeners['online']?.forEach((fn) => fn())
    expect(isOnline.value).toBe(true)
  })

  it('cleanup removes listeners', () => {
    const { cleanup } = useNetworkStatus()
    expect(listeners['online']?.length).toBe(1)
    expect(listeners['offline']?.length).toBe(1)

    cleanup()
    expect(listeners['online']?.length).toBe(0)
    expect(listeners['offline']?.length).toBe(0)
  })
})
