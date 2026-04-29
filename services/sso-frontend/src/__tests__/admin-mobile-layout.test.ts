import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const serviceRoot = process.cwd()

describe('admin mobile layout assets', () => {
  it('keeps admin drawer rules owned by admin css', () => {
    const adminCss = readFileSync(resolve(serviceRoot, 'src/web/styles/admin.css'), 'utf8')
    const authCss = readFileSync(resolve(serviceRoot, 'src/web/styles/auth.css'), 'utf8')

    expect(adminCss).toContain('.sidebar-close')
    expect(adminCss).toContain('height: 100dvh')
    expect(authCss).not.toMatch(/\.sidebar\s*\{[\s\S]*?position:\s*static/)
    expect(authCss).not.toMatch(/\.nav-list\s*\{[\s\S]*?grid-template-columns/)
  })

  it('ships a real favicon for enterprise browser chrome', () => {
    const favicon = statSync(resolve(serviceRoot, 'public/favicon.ico'))

    expect(favicon.size).toBeGreaterThan(0)
  })

  it('locks admin light theme sidebar contrast to readable colors', () => {
    const adminCss = readFileSync(resolve(serviceRoot, 'src/web/styles/admin.css'), 'utf8')

    expect(adminCss).toContain("html[data-theme='light'] .app-shell--admin .brand")
    expect(adminCss).toContain("html[data-theme='light'] .app-shell--admin .principal strong")
    expect(adminCss).toContain("html[data-theme='light'] .app-shell--admin .principal span")
    expect(adminCss).toContain("html[data-theme='light'] .app-shell--admin .sidebar .icon-button")
  })
})
