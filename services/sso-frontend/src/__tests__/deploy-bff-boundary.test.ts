import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('deploy BFF boundary', () => {
  const repoRoot = resolve(__dirname, '..', '..', '..', '..')

  it('keeps production portal API calls same-origin by default', () => {
    const workflow = readFileSync(resolve(repoRoot, '.github/workflows/deploy-main.yml'), 'utf8')
    const compose = readFileSync(resolve(repoRoot, 'docker-compose.main.yml'), 'utf8')

    expect(workflow).toContain('VITE_SSO_API_URL=')
    expect(workflow).not.toMatch(/VITE_SSO_API_URL=\$\{\{[^\n]+SSO_PUBLIC_BASE_URL/u)
    expect(workflow).not.toContain('VITE_SSO_API_URL=https://api-sso.timeh.my.id')
    expect(compose).toContain('SSO_INTERNAL_BASE_URL')
  })
})
