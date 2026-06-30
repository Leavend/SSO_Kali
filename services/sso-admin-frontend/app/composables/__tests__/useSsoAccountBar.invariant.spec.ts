import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// process.cwd() is the sso-admin-frontend root when Vitest runs.
// Path resolution via process.cwd() is used here because import.meta.url may
// not be a file:// URL in Vite's jsdom transform environment.
const adminPath = resolve(process.cwd(), 'app/composables/useSsoAccountBar.ts')
const portalPath = resolve(process.cwd(), '../sso-frontend/src/composables/useSsoAccountBar.ts')

describe('account widget composable invariant', () => {
  it('keeps the admin composable byte-identical with the portal copy', () => {
    const admin = Buffer.from(readFileSync(adminPath))
    const portal = Buffer.from(readFileSync(portalPath))
    expect(admin.equals(portal)).toBe(true)
  })
})
