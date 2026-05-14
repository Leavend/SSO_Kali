import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

describe('auth shell layout CSS', () => {
  it('uses the production portal login canvas without white browser gutters', () => {
    const authCss = readFileSync(resolve(root, 'web/styles/auth.css'), 'utf8')
    const adminCss = readFileSync(resolve(root, 'web/styles/admin.css'), 'utf8')

    expect(authCss).toContain('.portal-login {')
    expect(authCss).toContain('min-height: 100dvh;')
    expect(authCss).toContain('display: grid;')
    expect(authCss).toContain('align-items: center;')
    expect(authCss).toContain('justify-content: center;')
    expect(authCss).toContain('overflow: clip;')
    expect(adminCss).toContain('.app-shell--auth')
    expect(adminCss).toContain('min-height: 100dvh;')
  })

  it('pins root surfaces to the app canvas to avoid white browser gutters', () => {
    const baseCss = readFileSync(resolve(root, 'web/styles/base.css'), 'utf8')

    expect(baseCss).toContain('html,')
    expect(baseCss).toContain('body,')
    expect(baseCss).toContain('#app {')
    expect(baseCss).toContain('html {')
    expect(baseCss).toContain('background: var(--canvas);')
  })
})
