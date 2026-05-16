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

  it('pins active root surfaces to the themed portal canvas', () => {
    const css = readFileSync(resolve(root, 'assets/styles/main.css'), 'utf8')

    expect(css).toContain('html,')
    expect(css).toContain('body {')
    expect(css).toContain('@apply bg-background text-foreground min-h-full antialiased;')
  })
})
