import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('production compose session secret', () => {
  it('requires SESSION_ENCRYPTION_SECRET instead of silently defaulting empty', () => {
    const compose = readFileSync(resolve(process.cwd(), '../../docker-compose.main.yml'), 'utf8')

    expect(compose).toContain('SESSION_ENCRYPTION_SECRET: ${SESSION_ENCRYPTION_SECRET:?SESSION_ENCRYPTION_SECRET is required}')
  })
})
