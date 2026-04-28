import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve as resolvePath } from 'node:path'

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const cssPath = join(rootDir, 'src/web/styles/main.css')
const css = readCss(cssPath)

const themes = {
  light: readTokens(':root'),
  dark: readTokens("\\[data-theme='dark'\\]"),
}

const adminThemes = {
  light: readTokens("html\\[data-theme='light'\\]\\s+\\.app-shell--admin"),
  dark: readTokens('\\.app-shell--admin'),
}

const textPairs = [
  ['ink on canvas', 'ink', 'canvas'],
  ['muted on canvas', 'muted', 'canvas'],
  ['ink on card', 'ink', 'card'],
  ['muted on card', 'muted', 'card'],
  ['accent link on card', 'accent', 'card'],
  ['accent link on canvas', 'accent', 'canvas'],
  ['accent button text on accent', 'accent-contrast', 'accent'],
]

const nonTextPairs = [
  ['accent icon on accent-soft', 'accent', 'accent-soft'],
  ['line on card', 'line', 'card'],
  ['focus ring on canvas', 'focus-ring', 'canvas'],
]

let failures = 0

for (const [theme, tokens] of Object.entries(themes)) {
  for (const [label, fgKey, bgKey] of textPairs) {
    assertContrast(`${theme}: ${label}`, resolve(tokens, fgKey), resolve(tokens, bgKey), 4.5)
  }

  for (const [label, fgKey, bgKey] of nonTextPairs) {
    assertContrast(`${theme}: ${label}`, resolve(tokens, fgKey), resolve(tokens, bgKey), 3)
  }
}

for (const [theme, tokens] of Object.entries(adminThemes)) {
  assertAdminTheme(theme, tokens)
}

assertNoPattern(/letter-spacing:\s*-/i, 'Typography must not use negative letter spacing.')
assertNoPattern(/font-size:\s*(?:clamp|calc|[^;]*(?:vw|vh|vmin|vmax))/i, 'Font size must not scale directly with viewport units.')
assertNoPattern(/\.sidebar\s*\{[\s\S]*?color:\s*#ecfeff/i, 'Admin sidebar text must use theme tokens.')

if (failures > 0) {
  console.error(`[wcag-theme][FAIL] ${failures} failure(s)`)
  process.exit(1)
}

console.log('[wcag-theme][PASS] color contrast and typography gates passed')

function readTokens(selector) {
  const match = css.match(new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\}`))
  if (!match) throw new Error(`Missing selector: ${selector}`)

  return Object.fromEntries(
    [...match[1].matchAll(/--([a-z-]+):\s*(#[0-9a-f]{3,8})\s*;/gi)].map((entry) => [entry[1], entry[2]]),
  )
}

function readCss(filePath, seen = new Set()) {
  const absolutePath = resolvePath(filePath)
  if (seen.has(absolutePath)) return ''

  seen.add(absolutePath)

  return readFileSync(absolutePath, 'utf8').replace(
    /@import\s+['"]([^'"]+)['"]\s*;/g,
    (_match, importPath) => readCss(join(dirname(absolutePath), importPath), seen),
  )
}

function resolve(tokens, value) {
  if (value.startsWith('#')) return value
  const token = tokens[value]
  if (!token) throw new Error(`Missing color token: ${value}`)
  return token
}

function assertContrast(label, foreground, background, minimum) {
  const ratio = contrastRatio(foreground, background)
  if (ratio + Number.EPSILON < minimum) {
    failures += 1
    console.error(`[wcag-theme][ERROR] ${label}: ${ratio.toFixed(2)}:1, expected >= ${minimum}:1`)
  }
}

function assertNoPattern(pattern, message) {
  if (pattern.test(css)) {
    failures += 1
    console.error(`[wcag-theme][ERROR] ${message}`)
  }
}

function assertAdminTheme(theme, tokens) {
  const pairs = [
    ['admin ink on sidebar', 'admin-ink', 'admin-sidebar', 4.5],
    ['admin muted on sidebar', 'admin-muted', 'admin-sidebar', 4.5],
    ['admin subtle on sidebar', 'admin-subtle', 'admin-sidebar', 4.5],
    ['admin ink on panel', 'admin-ink', 'admin-panel', 4.5],
    ['admin muted on panel', 'admin-muted', 'admin-panel', 4.5],
    ['admin accent ink on accent', 'admin-accent-ink', 'admin-accent', 4.5],
    ['admin line on panel', 'admin-line', 'admin-panel', 3],
  ]

  for (const [label, fgKey, bgKey, minimum] of pairs) {
    assertContrast(`${theme}: ${label}`, resolve(tokens, fgKey), resolve(tokens, bgKey), minimum)
  }
}

function contrastRatio(foreground, background) {
  const fg = relativeLuminance(hexToRgb(foreground))
  const bg = relativeLuminance(hexToRgb(background))
  const lighter = Math.max(fg, bg)
  const darker = Math.min(fg, bg)
  return (lighter + 0.05) / (darker + 0.05)
}

function relativeLuminance([red, green, blue]) {
  const [r, g, b] = [red, green, blue].map((channel) => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })

  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function hexToRgb(hex) {
  const value = hex.replace('#', '')
  const normalized = value.length === 3
    ? [...value].map((char) => `${char}${char}`).join('')
    : value.slice(0, 6)

  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ]
}
