import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

describe('auth shell layout', () => {
  it('uses the active portal AuthLayout as the public shell', () => {
    const layout = readFileSync(resolve(root, 'components/layouts/AuthLayout.vue'), 'utf8')

    expect(layout).toContain('min-h-screen')
    expect(layout).toContain('items-center')
    expect(layout).toContain('RouterView')
    expect(layout).not.toContain('admin')
  })

  it('offers a standalone 3-way appearance control on the pre-auth shell (no account menu there)', () => {
    const layout = readFileSync(resolve(root, 'components/layouts/AuthLayout.vue'), 'utf8')

    // The login/register shell has no PortalUserMenu, so the manual theme control
    // lives here directly. It is the same 3-way Light/Dark/System control as the
    // account menu (standalone variant) so appearance UX is uniform across both
    // surfaces; device default still applies until the user picks an override.
    expect(layout).toContain('ThemeModeControl')
    expect(layout).toContain('standalone')
  })

  it('pins active root surfaces to the themed portal canvas', () => {
    const css = readFileSync(resolve(root, 'assets/styles/main.css'), 'utf8')

    expect(css).toContain('html,')
    expect(css).toContain('body {')
    expect(css).toContain('@apply bg-background text-foreground min-h-full antialiased;')
  })
})
