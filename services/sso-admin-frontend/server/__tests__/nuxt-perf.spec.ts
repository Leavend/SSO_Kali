import { afterEach, describe, expect, it, vi } from 'vitest'
import { PRELOAD_STRATEGY, adminCompression, adminRouteRules } from '../../nuxt-perf.config'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Nitro performance parity (Phase 1, design §9)', () => {
  it('pre-compresses public assets with gzip and brotli (replaces compression.ts)', () => {
    expect(adminCompression.gzip).toBe(true)
    expect(adminCompression.brotli).toBe(true)
  })

  it('pins immutable caching on hashed assets and no-store on authenticated HTML (replaces http-cache.ts)', () => {
    expect(adminRouteRules['/_nuxt/**']?.headers['cache-control']).toContain('immutable')
    expect(adminRouteRules['/_nuxt/**']?.headers['cache-control']).toContain('max-age=31536000')
    expect(adminRouteRules['/api/admin/**']?.headers['cache-control']).toContain('no-store')
    expect(adminRouteRules['/**']?.headers['cache-control']).toContain('no-store')
  })

  it('documents Nuxt-native modulepreload as the preload strategy (replaces preload-links.ts)', () => {
    expect(PRELOAD_STRATEGY).toBe('nuxt-native-modulepreload')
  })
})
