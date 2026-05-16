import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * FE-FR028-002 / FR-027 + FR-028 — confirm that the legacy `src/web/*` Vue
 * tree (LoginView, ConsentView, AppsView) is NOT shipped via the production
 * SPA entry. The production SPA entry is `src/main.ts`, which mounts the
 * router defined in `src/router/index.ts`. The legacy `src/web/main.ts`
 * router and views are kept in-tree for migration tests but must never
 * become a build entry without an audit refresh.
 */
describe('build-entry ownership (FE-FR028-002)', () => {
  const serviceRoot = resolve(__dirname, '..', '..')

  it('index.html loads /src/main.ts as the only build entry', () => {
    const html = readFileSync(resolve(serviceRoot, 'index.html'), 'utf8')
    expect(html).toContain('src="/src/main.ts"')
    expect(html).not.toContain('src="/src/web/main.ts"')
  })

  it('production SPA router does not import the legacy src/web tree', () => {
    const router = readFileSync(resolve(serviceRoot, 'src/router/index.ts'), 'utf8')

    expect(router).not.toMatch(/from\s+['"]@\/web\//u)
    expect(router).not.toMatch(/from\s+['"][./]+web\//u)
  })

  it('production SPA main entry does not transitively pull legacy views', () => {
    const main = readFileSync(resolve(serviceRoot, 'src/main.ts'), 'utf8')

    expect(main).not.toMatch(/@\/web\//u)
    expect(main).not.toMatch(/['"][./]+web\//u)
  })
})
