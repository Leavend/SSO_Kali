/**
 * Swiss discipline gate — Task 2b.10
 *
 * Statically scans app/assets/tokens.css, app/assets/main.css and every
 * Phase-2b component <style> block. Fails the build on any Swiss-anchor
 * violation:
 *   • box-shadow / --shadow-* / glass / glow / brand-grad / backdrop-filter
 *   • blur  (carry-forward from 2b.1 review)
 *   • serif display font (sans-serif is allowed; condensed/mono allowed)
 *   • more than one brand accent (#002FA7 only; red only on --danger)
 *   • any var(--*) without a fallback that is not defined in tokens.css or
 *     main.css (or locally in the same <style> block)
 *
 * Path resolution uses __dirname (consistent with tokens-contract.spec.ts).
 * import.meta.url is avoided because it behaves differently under jsdom.
 *
 * SsoAccountBar.vue is EXCLUDED from Phase-2b scanning: it must remain
 * byte-identical with the portal widget (Phase-2a wraps it in <ClientOnly>)
 * and intentionally carries --shadow-modal from the shared widget token set.
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const APP_DIR = path.resolve(__dirname, '../../')
const TOKENS = path.join(APP_DIR, 'assets/tokens.css')
const MAIN = path.join(APP_DIR, 'assets/main.css')
const COMPONENTS = path.join(APP_DIR, 'components')

/**
 * Files excluded from Phase-2b Swiss-discipline scanning.
 * SsoAccountBar.vue stays byte-identical with the portal widget and is not
 * restyled in this phase — do not add Phase-2b components here.
 */
const PHASE_2B_EXCLUDED = new Set(['SsoAccountBar.vue'])

/** Every pattern banned by the Swiss design system. */
const BANNED: readonly RegExp[] = [
  /box-shadow/i,
  /--shadow-lg/i,
  /--shadow-/i,
  /glass/i,
  /glow/i,
  /brand-grad/i,
  /backdrop-filter/i,
  /blur/i, // carry-forward from 2b.1 review: no blur effects in the Swiss DS
  /--font-serif/i,
  /Instrument Serif/i,
  /Plus Jakarta/i,
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
 * Strip CSS block comments (/* … *‌/) so pattern matching fires only on
 * actual CSS declarations and values, not on comment text.
 * (e.g. the header comment `No shadow/brand-gradient anchors` must not
 * trigger the /brand-grad/ ban.)
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
  // Deduplicate: a token referenced multiple times produces one diagnostic.
  return [...new Set(missing)]
}

/**
 * Check the single-accent invariant against the Swiss token file.
 * Returns an empty array when the tree is clean.
 */
function accentViolations(tokensCss: string): string[] {
  const issues: string[] = []
  if (!/--accent:\s*#002FA7/i.test(tokensCss)) issues.push('missing single accent #002FA7')
  if (/--primary:/i.test(tokensCss)) issues.push('second accent token --primary')
  if (/data-accent=/i.test(tokensCss)) issues.push('accent-variant blocks present')
  for (const line of tokensCss.split('\n')) {
    if (/#E4002B/i.test(line) && !/--danger/i.test(line)) {
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

/** Recursively collect Phase-2b Vue files, skipping PHASE_2B_EXCLUDED names. */
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
// Section 1 — Detector teeth: prove each detector WOULD catch a violation
//   (these self-tests fail if a detector silently accepts a banned input).
// ---------------------------------------------------------------------------

describe('Swiss discipline — detector teeth (must flag violations)', () => {
  it('flags soft-shadow / box-shadow / glass / glow / backdrop-filter', () => {
    expect(findBanned('box-shadow: var(--shadow-lg)')).toContain('box-shadow')
    expect(findBanned('--shadow-lg: 0 20px 48px')).toContain('--shadow-lg')
    expect(findBanned('background: var(--glass-bg)')).toContain('glass')
    expect(findBanned('box-shadow: var(--shadow-glow)')).toContain('glow')
    expect(findBanned('backdrop-filter: blur(18px)')).toContain('backdrop-filter')
    expect(findBanned('--shadow-subtle: 0 1px 4px rgba(0,0,0,.08)')).toContain('--shadow-')
  })

  it('flags blur (carry-forward ban from 2b.1 review)', () => {
    expect(findBanned('filter: blur(4px)')).toContain('blur')
    expect(findBanned('backdrop-filter: blur(8px)')).toContain('blur')
  })

  it('flags serif display font but allows sans-serif and ui-sans-serif', () => {
    expect(findBanned('font-family: Georgia, serif')).toContain('(?<![a-z-])serif')
    expect(findBanned("--font-serif: 'Instrument Serif'")).toContain('--font-serif')
    expect(findBanned("font-family: 'Plus Jakarta Sans'")).toContain('Plus Jakarta')
    // sans-serif is permitted (the `-` before serif is in [a-z-])
    expect(findBanned('font-family: Helvetica, Arial, sans-serif')).toEqual([])
    expect(findBanned('font-family: ui-sans-serif, system-ui, sans-serif')).toEqual([])
  })

  it('flags undefined vars but honours fallbacks and local defs', () => {
    expect(findUndefinedVars('.x{color:var(--nope)}', new Set())).toEqual(['--nope'])
    // Fallback present → skip
    expect(findUndefinedVars('.x{width:var(--skeleton-width,100%)}', new Set())).toEqual([])
    // Locally defined → OK
    expect(findUndefinedVars('.x{--y:1px;color:var(--y)}', new Set())).toEqual([])
    // In globalDefs → OK
    expect(findUndefinedVars('.x{color:var(--accent)}', new Set(['--accent']))).toEqual([])
    // Same missing var referenced twice → one diagnostic
    expect(findUndefinedVars('.x{color:var(--x);background:var(--x)}', new Set())).toEqual(['--x'])
  })

  it('flags a second accent token and red wired off --danger', () => {
    expect(accentViolations('--primary: #002FA7;\n--accent: #002FA7;')).toContain(
      'second accent token --primary',
    )
    expect(
      accentViolations('--accent: #002FA7;\n--ring: #E4002B;').some((m) =>
        m.includes('red wired off'),
      ),
    ).toBe(true)
    // Clean: accent present, red only on --danger
    expect(accentViolations('--accent: #002FA7;\n--danger: #E4002B;')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Section 2 — Real-tree assertions: the current Swiss DS passes every gate
// ---------------------------------------------------------------------------

describe('Swiss discipline — the real tree is clean', () => {
  const tokensCss = readFileSync(TOKENS, 'utf8')
  const mainCss = readFileSync(MAIN, 'utf8')
  // Global token namespace = everything defined in both CSS files
  const globalDefs = new Set<string>([...collectDefs(tokensCss), ...collectDefs(mainCss)])
  const vueFiles = walkVue(COMPONENTS)

  it('scans at least 10 Phase-2b Vue components (gate scope sanity check)', () => {
    expect(vueFiles.length).toBeGreaterThanOrEqual(10)
  })

  it('defines no banned shadow/glass/glow/blur/serif/brand tokens anywhere', () => {
    // Strip block comments first so documentation text (e.g. "No shadow/brand-gradient
    // anchors") does not trigger pattern bans on comment prose.
    const cssItems: string[] = [
      stripCssBlockComments(tokensCss),
      stripCssBlockComments(mainCss),
      ...vueFiles.map((f) => stripCssBlockComments(styleBlocks(readFileSync(f, 'utf8')))),
    ]
    for (const content of cssItems) {
      expect(findBanned(content)).toEqual([])
    }
  })

  it('keeps a single accent (#002FA7) with red wired only to --danger', () => {
    // Strip comments so the header-comment reference to #E4002B doesn't
    // trigger the "red wired off --danger" check.
    expect(accentViolations(stripCssBlockComments(tokensCss))).toEqual([])
  })

  it('references no undefined var(--*) in tokens.css', () => {
    expect(findUndefinedVars(tokensCss, globalDefs)).toEqual([])
  })

  it('references no undefined var(--*) in main.css', () => {
    expect(findUndefinedVars(mainCss, globalDefs)).toEqual([])
  })

  it('references no undefined var(--*) in any Phase-2b component', () => {
    // Collect all violations with file paths so a failure is self-describing.
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
