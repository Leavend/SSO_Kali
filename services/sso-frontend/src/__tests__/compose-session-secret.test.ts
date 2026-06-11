import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('production compose session secret', () => {
  it('requires SESSION_ENCRYPTION_SECRET instead of silently defaulting empty', () => {
    const compose = readFileSync(resolve(process.cwd(), '../../docker-compose.main.yml'), 'utf8')

    expect(compose).toContain(
      'SESSION_ENCRYPTION_SECRET: ${SESSION_ENCRYPTION_SECRET:?SESSION_ENCRYPTION_SECRET is required}',
    )
  })

  it('wires the portal confidential secret only into server runtime env', () => {
    const compose = readFileSync(resolve(process.cwd(), '../../docker-compose.main.yml'), 'utf8')

    expect(compose).toContain(
      'SSO_PORTAL_CLIENT_SECRET: ${SSO_PORTAL_CLIENT_SECRET:?SSO_PORTAL_CLIENT_SECRET is required}',
    )
    expect(compose).not.toContain('VITE_SSO_PORTAL_CLIENT_SECRET')
  })
})
