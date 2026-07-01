/**
 * Modern premium design system discipline gate
 *
 * Statically scans app/assets/tokens.css, app/assets/main.css and every
 * Vue component <style> block. Fails the build on any design-anchor
 * violation:
 *   • serif display font (sans-serif is allowed; condensed/mono allowed)
 *   • more than one brand accent (#4f46e5 only; red only on --danger)
 *   • any var(--*) without a fallback that is not defined in tokens.css or
 *     main.css (or locally in the same <style> block)
 *
 * Path resolution uses __dirname (consistent with tokens-contract.spec.ts).
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const APP_DIR = path.resolve(__dirname, '../../')
const TOKENS = path.join(APP_DIR, 'assets/tokens.css')
const MAIN = path.join(APP_DIR, 'assets/main.css')
const COMPONENTS = path.join(APP_DIR, 'components')

const PHASE_2B_EXCLUDED = new Set<string>()

/** Every pattern banned by the design system. */
const BANNED: readonly RegExp[] = [
  /--font-serif/i,
  /Instrument Serif/i,
  /(?<![a-z-])serif/i, // bans `serif` / `Georgia, serif` but NOT `sans-serif`
]

/** Collect every CSS custom-property DEFINITION from `css`. */
function collectDefs(css: string): Set<string> {
  const defs = new Set<string>()
  for (const match of css.matchAll(/(--[a-z0-9-]+)\s*:/gi)) defs.add(match[1]!.toLowerCase())
  return defs
}

/** Collect every CSS custom-property REFERENCE (`var(--*)`). */
function collectRefs(css: string): Array<{ name: string; hasFallback: boolean }> {
  const refs: Array<{ name: string; hasFallback: boolean }> = []
  for (const match of css.matchAll(/var\(\s*(--[a-z0-9-]+)\s*(,?)/gi))
    refs.push({ name: match[1]!.toLowerCase(), hasFallback: match[2] === ',' })
  return refs
}

/**
 * Strip CSS block comments
 */
function stripCssBlockComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Return the source strings of any BANNED patterns found in `text`. */
function findBanned(text: string): string[] {
  return BANNED.filter((re) => re.test(text)).map((re) => re.source)
}

/**
 * Return every `var(--*)` reference in `content` that has no fallback value
 * and is not defined in `globalDefs` nor locally in the same block.
 */
function findUndefinedVars(content: string, globalDefs: ReadonlySet<string>): string[] {
  const local = collectDefs(content)
  const missing: string[] = []
  for (const ref of collectRefs(content)) {
    if (ref.hasFallback) continue
    if (globalDefs.has(ref.name) || local.has(ref.name)) continue
    missing.push(ref.name)
  }
  return [...new Set(missing)]
}

/**
 * Check the single-accent invariant against the token file.
 */
function accentViolations(tokensCss: string): string[] {
  const issues: string[] = []
  if (!/--accent:\s*#4f46e5/i.test(tokensCss)) issues.push('missing single accent #4f46e5')
  if (/--primary:/i.test(tokensCss)) issues.push('second accent token --primary')
  if (/data-accent=/i.test(tokensCss)) issues.push('accent-variant blocks present')
  for (const line of tokensCss.split('\n')) {
    if (/#ef4444/i.test(line) && !/--danger/i.test(line)) {
      issues.push(`red wired off --danger: ${line.trim()}`)
    }
  }
  return issues
}

/** Extract all `<style>` block contents from a Vue SFC. */
function styleBlocks(vue: string): string {
  let css = ''
  for (const match of vue.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) css += `\n${match[1]}`
  return css
}

/** Recursively collect Vue files, skipping PHASE_2B_EXCLUDED names. */
function walkVue(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkVue(full))
    else if (entry.name.endsWith('.vue') && !PHASE_2B_EXCLUDED.has(entry.name)) out.push(full)
  }
  return out
}

// ---------------------------------------------------------------------------
// Section 1 — Detector teeth
// ---------------------------------------------------------------------------

describe('Design discipline — detector teeth (must flag violations)', () => {
  it('flags serif display font but allows sans-serif and ui-sans-serif', () => {
    expect(findBanned('font-family: Georgia, serif')).toContain('(?<![a-z-])serif')
    expect(findBanned("--font-serif: 'Instrument Serif'")).toContain('--font-serif')
    expect(findBanned('font-family: Helvetica, Arial, sans-serif')).toEqual([])
    expect(findBanned('font-family: ui-sans-serif, system-ui, sans-serif')).toEqual([])
  })

  it('flags undefined vars but honours fallbacks and local defs', () => {
    expect(findUndefinedVars('.x{color:var(--nope)}', new Set())).toEqual(['--nope'])
    expect(findUndefinedVars('.x{width:var(--skeleton-width,100%)}', new Set())).toEqual([])
    expect(findUndefinedVars('.x{--y:1px;color:var(--y)}', new Set())).toEqual([])
    expect(findUndefinedVars('.x{color:var(--accent)}', new Set(['--accent']))).toEqual([])
  })

  it('flags a second accent token and red wired off --danger', () => {
    expect(accentViolations('--primary: #4f46e5;\n--accent: #4f46e5;')).toContain(
      'second accent token --primary',
    )
    expect(
      accentViolations('--accent: #4f46e5;\n--ring: #ef4444;').some((m) =>
        m.includes('red wired off'),
      ),
    ).toBe(true)
    expect(accentViolations('--accent: #4f46e5;\n--danger: #ef4444;')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Section 2 — Real-tree assertions
// ---------------------------------------------------------------------------

describe('Design discipline — the real tree is clean', () => {
  const tokensCss = readFileSync(TOKENS, 'utf8')
  const mainCss = readFileSync(MAIN, 'utf8')
  const globalDefs = new Set<string>([...collectDefs(tokensCss), ...collectDefs(mainCss)])
  const vueFiles = walkVue(COMPONENTS)

  it('scans at least 10 Vue components', () => {
    expect(vueFiles.length).toBeGreaterThanOrEqual(10)
  })

  it('defines no banned shadows or serif tokens anywhere', () => {
    const cssItems: string[] = [
      stripCssBlockComments(tokensCss),
      stripCssBlockComments(mainCss),
      ...vueFiles.map((f) => stripCssBlockComments(styleBlocks(readFileSync(f, 'utf8')))),
    ]
    for (const content of cssItems) {
      expect(findBanned(content)).toEqual([])
    }
  })

  it('keeps a single accent (#4f46e5) with red wired only to --danger', () => {
    expect(accentViolations(stripCssBlockComments(tokensCss))).toEqual([])
  })

  it('references no undefined var(--*) in tokens.css', () => {
    expect(findUndefinedVars(tokensCss, globalDefs)).toEqual([])
  })

  it('references no undefined var(--*) in main.css', () => {
    expect(findUndefinedVars(mainCss, globalDefs)).toEqual([])
  })

  it('references no undefined var(--*) in any component', () => {
    const violations: string[] = []
    for (const file of vueFiles) {
      const css = styleBlocks(readFileSync(file, 'utf8'))
      const missing = findUndefinedVars(css, globalDefs)
      for (const v of missing) {
        violations.push(`${path.relative(APP_DIR, file)}: ${v}`)
      }
    }
    expect(violations).toEqual([])
  })
})
