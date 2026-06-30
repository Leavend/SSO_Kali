/**
 * Phase-1 Nitro performance parity (design §9), replacing the legacy hand-rolled
 * compression.ts / http-cache.ts / preload-links.ts. Exported as plain,
 * importable objects so the perf decisions are unit-testable without booting Nuxt.
 *
 * - Compression  → Nitro `compressPublicAssets` pre-compresses built static
 *   assets at build time (gzip + brotli). Replaces compression.ts.
 * - HTTP cache   → route rules pin immutable caching on hashed `/_nuxt/**`
 *   assets and `no-store` on authenticated app HTML + API. Replaces http-cache.ts.
 * - Preload      → emitted natively by Nuxt as <link rel="modulepreload"> from
 *   the build manifest; no custom code. Replaces preload-links.ts. The decision
 *   is pinned below so it is greppable and intentional.
 */

export type RouteCacheRules = Readonly<
  Record<string, { readonly headers: Readonly<Record<string, string>> }>
>

export const PRELOAD_STRATEGY = 'nuxt-native-modulepreload' as const

export const adminCompression = { gzip: true, brotli: true } as const

const NO_STORE = 'no-store, no-cache, private, max-age=0'

export const adminRouteRules: RouteCacheRules = {
  '/_nuxt/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
  '/auth/**': { headers: { 'cache-control': NO_STORE } },
  '/api/admin/**': { headers: { 'cache-control': NO_STORE } },
  '/widget/**': { headers: { 'cache-control': NO_STORE } },
  '/**': { headers: { 'cache-control': NO_STORE } },
}
