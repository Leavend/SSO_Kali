import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve as resolvePath } from 'node:path'

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const cssPath = join(rootDir, 'src/assets/styles/main.css')
const css = readCss(cssPath)

const themes = {
  light: readTokens(':root'),
  dark: readTokens('\.dark'),
}

const textPairs = [
  ['foreground on background', 'foreground', 'background'],
  ['muted foreground on background', 'muted-foreground', 'background'],
  ['foreground on card', 'card-foreground', 'card'],
  ['primary foreground on primary', 'primary-foreground', 'primary'],
]

let failures = 0

for (const [theme, tokens] of Object.entries(themes)) {
  for (const [label, fgKey, bgKey] of textPairs) {
    assertContrast(`${theme}: ${label}`, resolve(tokens, fgKey), resolve(tokens, bgKey), 4.5)
  }
}

assertNoPattern(/letter-spacing:\s*-/i, 'Typography must not use negative letter spacing.')
assertNoPattern(
  /font-size:\s*(?:clamp|calc|[^;]*(?:vw|vh|vmin|vmax))/i,
  'Font size must not scale directly with viewport units.',
)

if (failures > 0) {
  console.error(`[wcag-theme][FAIL] ${failures} failure(s)`)
  process.exit(1)
}

console.log('[wcag-theme][PASS] color contrast and typography gates passed')

function readTokens(selector) {
  const match = css.match(new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\}`))
  if (!match) throw new Error(`Missing selector: ${selector}`)

  return Object.fromEntries(
    [...match[1].matchAll(/--([a-z-]+):\s*oklch\(([^)]+)\)\s*;/giu)].map((entry) => [
      entry[1],
      oklchToRgb(entry[2]),
    ]),
  )
}

function readCss(filePath, seen = new Set()) {
  const absolutePath = resolvePath(filePath)
  if (seen.has(absolutePath)) return ''

  seen.add(absolutePath)

  return readFileSync(absolutePath, 'utf8').replace(
    /@import\s+['"]([^'"]+)['"]\s*;/g,
    (_match, importPath) => {
      if (!importPath.startsWith('.') && !importPath.startsWith('/')) return ''
      return readCss(join(dirname(absolutePath), importPath), seen)
    },
  )
}

function resolve(tokens, value) {
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

function contrastRatio(foreground, background) {
  const fg = relativeLuminance(foreground)
  const bg = relativeLuminance(background)
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

function oklchToRgb(value) {
  const [lightnessRaw, chromaRaw, hueRaw] = value.split(/\s+/u).filter((part) => part !== '/')
  const lightness = Number.parseFloat(lightnessRaw)
  const chroma = Number.parseFloat(chromaRaw)
  const hue = (Number.parseFloat(hueRaw) * Math.PI) / 180
  const a = chroma * Math.cos(hue)
  const b = chroma * Math.sin(hue)

  const l = lightness + 0.3963377774 * a + 0.2158037573 * b
  const m = lightness - 0.1055613458 * a - 0.0638541728 * b
  const s = lightness - 0.0894841775 * a - 1.291485548 * b

  const l3 = l ** 3
  const m3 = m ** 3
  const s3 = s ** 3

  return [
    toSrgb(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3),
    toSrgb(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3),
    toSrgb(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3),
  ]
}

function toSrgb(value) {
  const bounded = Math.min(1, Math.max(0, value))
  const encoded = bounded <= 0.0031308 ? 12.92 * bounded : 1.055 * bounded ** (1 / 2.4) - 0.055
  return Math.round(encoded * 255)
}
