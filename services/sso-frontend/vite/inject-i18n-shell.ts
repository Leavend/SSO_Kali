/**
 * Vite plugin — inject the i18n shell JSON into `index.html` so it is
 * available **synchronously** before any JS runs (no FOUC, no flash of
 * untranslated keys for the first paint).
 *
 * Implementation:
 *   - Read `src/locales/{id,en}/shell.json` (the user-curated "first-paint"
 *     keys: brand, nav, splash, login submit, …).
 *   - Replace the `<!-- sso:i18n:shell -->` marker in `index.html` with
 *     `<script type="application/json" id="__sso_i18n_shell__">{…}</script>`.
 *   - In dev mode, watch the shell files for hot-reload.
 *
 * The runtime (`useI18n.ts#readInjectedShell`) reads the script tag's
 * `textContent` and merges the per-locale shell into the messages map.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'

const MARKER = '<!-- sso:i18n:shell -->'
const SCRIPT_ID = '__sso_i18n_shell__'
const SUPPORTED_LOCALES = ['id', 'en'] as const

type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

interface InjectI18nShellOptions {
  readonly localesDir: string
}

export function injectI18nShell(options: InjectI18nShellOptions): Plugin {
  return {
    name: 'sso-inject-i18n-shell',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const shells: Record<SupportedLocale, unknown> = {
          id: {},
          en: {},
        }
        for (const locale of SUPPORTED_LOCALES) {
          const file = join(options.localesDir, locale, 'shell.json')
          try {
            const raw = readFileSync(file, 'utf-8')
            shells[locale] = JSON.parse(raw) as unknown
          } catch (error) {
            // In dev/test, missing shell is non-fatal — empty object is used.
            if (typeof console !== 'undefined') {
              console.warn(
                `[injectI18nShell] failed to read ${file}: ${(error as Error).message}`,
              )
            }
            shells[locale] = {}
          }
        }
        const payload = JSON.stringify(shells).replace(/</gu, '\\u003c')
        const tag = `<script type="application/json" id="${SCRIPT_ID}">${payload}</script>`
        if (html.includes(MARKER)) {
          return html.replace(MARKER, tag)
        }
        // No marker: insert before </head>.
        return html.replace('</head>', `  ${tag}\n  </head>`)
      },
    },
  }
}
