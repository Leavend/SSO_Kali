/**
 * check-broker-boundary.mjs — ensures no direct fetch() to SSO backend
 * from client-side code (all API calls must go through the apiClient broker).
 *
 * Placeholder: full implementation pending.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(process.argv[2] ?? '.')
const SRC = join(root, 'src')

const FORBIDDEN_PATTERNS = [
  /\bfetch\s*\(\s*['"`]https?:\/\//,
]

const EXCLUDED_DIRS = ['node_modules', 'dist', 'server', '__tests__']

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
      console.error(`❌ Direct fetch() detected in ${rel} — use apiClient instead.`)
      violations++
    }
  }
}

if (violations > 0) {
  console.error(`\n${violations} broker boundary violation(s) found.`)
  process.exit(1)
}

console.log('✅ Broker boundary check passed.')
