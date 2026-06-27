import { readFileSync } from 'node:fs'
import * as nodePath from 'node:path'
import { describe, expect, it } from 'vitest'
import { handleMockRequest } from '../mock-api-client'

// Use import.meta.dirname (Node 20.11+, always a real fs path) instead of
// new URL(path, import.meta.url): Vite intercepts new URL(…, import.meta.url)
// as a static-asset transform, and jsdom's global URL resolves file:// bases
// against http://localhost:3000, so both approaches yield a non-file URL.
// import.meta.dirname is the raw filesystem directory; path.resolve is safe.
const nuxtCopy = nodePath.resolve(import.meta.dirname, '../mock-api-client.ts')
const spaSource = nodePath.resolve(
  import.meta.dirname,
  '../../../../src/lib/api/mock-api-client.ts',
)

/**
 * Semantic normalisation for parity comparison.
 * src/ is frozen in .prettierignore (no formatting applied), while app/ is
 * formatted on write.  Prettier adds trailing commas and adjusts whitespace,
 * so we must strip both before comparing to prove no logic changed.
 */
const normalise = (path: string) =>
  readFileSync(path, 'utf-8')
    .replace(/,(\s*[}\]])/g, '$1') // remove trailing commas before } or ]
    .replace(/\s+/g, '') // collapse all whitespace

describe('mock-api-client parity', () => {
  it('carries identical logic to the SPA source (formatting-agnostic)', () => {
    expect(normalise(nuxtCopy)).toBe(normalise(spaSource))
  })

  it('answers a known mock route (/api/admin/me)', () => {
    const res = handleMockRequest('GET', '/api/admin/me')
    expect(res.status).toBeGreaterThanOrEqual(200)
    expect(res.status).toBeLessThan(500)
  })
})
