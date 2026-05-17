import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const configPath = resolve(process.cwd(), 'vitest.config.ts')

describe('vitest config inventory', () => {
  it('does not permanently exclude active production specs', () => {
    const config = readFileSync(configPath, 'utf8')

    expect(config).not.toContain('src/components/molecules/__tests__/SessionCard.spec.ts')
    expect(config).not.toContain('src/components/organisms/__tests__/PortalHeader.spec.ts')
    expect(config).not.toContain('src/layouts/__tests__/PortalLayout.spec.ts')
    expect(config).not.toContain('src/pages/portal/__tests__/ConnectedAppsPage.spec.ts')
    expect(config).not.toContain('src/pages/portal/__tests__/SecurityPage.spec.ts')
    expect(config).not.toContain('src/pages/portal/__tests__/SessionsPage.spec.ts')
  })
})
