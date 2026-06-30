import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type PublicConfig = Record<string, unknown>

async function loadPublicConfig(): Promise<PublicConfig> {
  vi.resetModules()
  vi.stubGlobal('defineNuxtConfig', (config: unknown) => config)
  // @tailwindcss/vite transitively loads esbuild, which checks TextEncoder at
  // module-load time and throws in jsdom where TextEncoder is not native.
  // Mock it here (after resetModules, before the dynamic import) so that
  // nuxt.config.ts can be loaded in the jsdom test environment.
  vi.doMock('@tailwindcss/vite', () => ({ default: () => null }))
  const mod = (await import('../../nuxt.config')) as {
    default: { runtimeConfig: { public: PublicConfig } }
  }
  return mod.default.runtimeConfig.public
}

describe('runtimeConfig public surface', () => {
  beforeEach(() => vi.stubGlobal('defineNuxtConfig', (config: unknown) => config))
  afterEach(() => vi.unstubAllGlobals())

  it('exposes exactly the safe frontend public keys', async () => {
    const pub = await loadPublicConfig()
    expect(Object.keys(pub).sort()).toEqual(
      [
        'adminAppBaseUrl',
        'basePath',
        'docsBaseUrl',
        'mockApi',
        'ssoBaseUrl',
        'ssoWidgetBaseUrl',
      ].sort(),
    )
  })

  it('maps NUXT_PUBLIC_BASE_PATH to public.basePath, never publicBasePath', async () => {
    const pub = await loadPublicConfig()
    expect(pub).toHaveProperty('basePath')
    expect(pub).not.toHaveProperty('publicBasePath')
  })

  it('contains no secret/token/credential key names in the public surface', async () => {
    const pub = await loadPublicConfig()
    for (const key of Object.keys(pub)) {
      expect(key).not.toMatch(/secret|token|encryption|password|client_?secret|redis|cookie/i)
    }
  })
})
