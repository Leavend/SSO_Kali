import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const serviceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * WACC3 — the anti-FOUC theme bootstrap must be served as an external,
 * same-origin classic script so it is permitted under a `script-src 'self'`
 * CSP without a hash/nonce, while still running before first paint.
 *
 * Audit: docs/audits/widget-accounts-401-cookie-host-and-csp-inline-script-audit-2026-06-25.md
 */
describe('WACC3 theme-boot externalization', () => {
  const html = readFileSync(resolve(serviceRoot, 'index.html'), 'utf8')

  describe('index.html shell', () => {
    it('references the external theme-boot script via same-origin src', () => {
      expect(html).toContain('<script src="/theme-boot.js"></script>')
    })

    it('does not contain an executable inline theme bootstrap', () => {
      // The anti-FOUC logic (theme read + dark class toggle) must no longer be
      // inlined, or a `script-src 'self'` CSP would block it.
      expect(html).not.toContain("localStorage.getItem('dev-sso-theme')")
      expect(html).not.toContain("classList.toggle('dark'")
    })

    it('loads the theme-boot script in <head> before first paint', () => {
      const headStart = html.indexOf('<head>')
      const headEnd = html.indexOf('</head>')
      const scriptIndex = html.indexOf('<script src="/theme-boot.js"></script>')

      expect(headStart).toBeGreaterThanOrEqual(0)
      expect(scriptIndex).toBeGreaterThan(headStart)
      expect(scriptIndex).toBeLessThan(headEnd)
    })

    it('loads theme-boot as a render-blocking classic script (no defer/module)', () => {
      expect(html).not.toContain('<script src="/theme-boot.js" defer>')
      expect(html).not.toContain('<script type="module" src="/theme-boot.js"')
    })

    it('keeps the non-executable i18n data block intact', () => {
      // The i18n shell marker is data, not subject to script-src, and must
      // remain untouched.
      expect(html).toContain('<!-- sso:i18n:shell -->')
    })
  })

  describe('public/theme-boot.js', () => {
    const themeBootPath = resolve(serviceRoot, 'public', 'theme-boot.js')

    it('exists as a static, same-origin asset', () => {
      expect(existsSync(themeBootPath)).toBe(true)
    })

    it('preserves the anti-FOUC theme bootstrap logic verbatim', () => {
      const themeBoot = readFileSync(themeBootPath, 'utf8')

      expect(themeBoot).toContain("localStorage.getItem('dev-sso-theme')")
      expect(themeBoot).toContain(
        "(theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)",
      )
      expect(themeBoot).toContain("document.documentElement.classList.toggle('dark', isDark)")
    })
  })
})
