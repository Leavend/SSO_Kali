import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Portal-only ownership guard: `sso-frontend` ships the SSO self-service portal,
 * not the admin control plane. Admin UI must live outside this production SPA.
 */
describe('build-entry ownership', () => {
  const serviceRoot = resolve(__dirname, '..', '..')

  it('index.html loads /src/main.ts as the only build entry', () => {
    const html = readFileSync(resolve(serviceRoot, 'index.html'), 'utf8')
    expect(html).toContain('src="/src/main.ts"')
    expect(html).not.toContain('src="/src/web/main.ts"')
  })

  it('production router exposes portal routes only', () => {
    const router = readFileSync(resolve(serviceRoot, 'src/router/index.ts'), 'utf8')

    expect(router).not.toContain("path: '/admin")
    expect(router).not.toContain("layout: 'admin'")
    expect(router).not.toMatch(/from\s+['"]@\/web\//u)
    expect(router).not.toMatch(/from\s+['"][./]+web\//u)
  })

  it('legacy admin web tree is not present in sso-frontend', () => {
    expect(existsSync(resolve(serviceRoot, 'src/web'))).toBe(false)
  })
})
