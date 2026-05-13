/**
 * check-browser-storage-policy.mjs — ensures no localStorage/sessionStorage
 * usage for sensitive tokens (standart-quality-code §13.1).
 *
 * Placeholder: full implementation pending.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(process.argv[2] ?? '.')
const SRC = join(root, 'src')

const FORBIDDEN_PATTERNS = [
  /localStorage\.setItem\s*\(\s*['"`](access_token|refresh_token|id_token|sso_session)/,
  /sessionStorage\.setItem\s*\(\s*['"`](access_token|refresh_token|id_token|sso_session)/,
]

const EXCLUDED_DIRS = ['node_modules', 'dist', '__tests__']

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (EXCLUDED_DIRS.includes(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...walk(full))
    else if (/\.(ts|vue|mts)$/.test(entry.name)) files.push(full)
  }
  return files
}

let violations = 0
for (const file of walk(SRC)) {
  const content = readFileSync(file, 'utf8')
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(content)) {
      const rel = file.replace(root + '/', '')
      console.error(`❌ Token stored in browser storage: ${rel}`)
      violations++
    }
  }
}

if (violations > 0) {
  console.error(`\n${violations} storage policy violation(s) found.`)
  process.exit(1)
}

console.log('✅ Browser storage policy check passed.')
