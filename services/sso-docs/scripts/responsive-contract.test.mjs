import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

const read = (path) => readFileSync(resolve(root, path), 'utf8')

const packageJson = JSON.parse(read('package.json'))
const config = read('.vitepress/config.ts')
const css = read('.vitepress/theme/custom.css')
const indexId = read('index.md')
const indexEn = read('en/index.md')

assert.equal(
  packageJson.devDependencies?.mermaid,
  '11.15.0',
  'Mermaid must be pinned for reproducible docs rendering.',
)
assert.equal(
  packageJson.devDependencies?.['vitepress-plugin-mermaid'],
  '2.0.17',
  'VitePress Mermaid plugin must be pinned for reproducible docs rendering.',
)
assert.match(config, /import \{ withMermaid \} from 'vitepress-plugin-mermaid'/)
assert.match(config, /export default withMermaid\(config\)/)
assert.match(config, /securityLevel:\s*'strict'/)

for (const [label, source] of [
  ['id index', indexId],
  ['en index', indexEn],
]) {
  assert.match(source, /```mermaid\nsequenceDiagram/)
  assert.doesNotMatch(
    source,
    /authorize\?response_type=code&client_id&redirect_uri&scope&state&nonce&code_challenge&code_challenge_method=S256/,
    `${label} must not keep the previous 128-character Mermaid label.`,
  )
}

assert.match(css, /@media \(max-width: 640px\)/)
assert.match(css, /\.vp-doc div\[class\*='language-'\] code\s*\{[^}]*font-size: 0\.78rem/s)
assert.match(css, /\.vp-doc div\[class\*='language-'\] pre\s*\{[^}]*-webkit-overflow-scrolling: touch/s)
assert.match(css, /\.vp-doc table\s*\{[^}]*display: block;[^}]*overflow-x: auto/s)
assert.doesNotMatch(
  css,
  /\.vp-doc table\s*\{[^}]*white-space:\s*nowrap/s,
  'Mobile docs tables should allow prose cells to wrap instead of forcing all content onto one line.',
)
assert.match(css, /\.vp-doc \.mermaid\s*\{[^}]*overflow-x: auto/s)
assert.match(css, /\.vp-doc \.mermaid svg\s*\{[^}]*max-width: 100%;[^}]*height: auto/s)
assert.match(css, /\.VPHero \.tagline\s*\{[^}]*font-size: 1rem/s)

console.log('Responsive docs contract passed')
