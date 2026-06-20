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
const nginx = read('nginx.conf')

const locationBlock = (header) => {
  const lines = nginx.split('\n')
  const start = lines.findIndex((line) => line.trim() === header)
  assert.notEqual(start, -1, `nginx.conf must define ${header}`)
  const end = lines.findIndex((line, index) => index > start && line.trim() === '}')
  assert.notEqual(end, -1, `nginx.conf must close ${header}`)
  return lines.slice(start + 1, end).join('\n')
}

const assertSecurityHeaders = (source, label) => {
  assert.match(source, /add_header X-Frame-Options "DENY" always;/, `${label} must keep X-Frame-Options`)
  assert.match(
    source,
    /add_header X-Content-Type-Options "nosniff" always;/,
    `${label} must keep X-Content-Type-Options`,
  )
  assert.match(
    source,
    /add_header Referrer-Policy "strict-origin-when-cross-origin" always;/,
    `${label} must keep Referrer-Policy`,
  )
}

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

assert.doesNotMatch(
  nginx,
  /location\s+~\*\s+\\\.html\$/,
  'Docs HTML cache headers must live on location / so homepage and VitePress clean URLs are covered.',
)

const vitePressFallback = locationBlock('location / {')
assert.match(vitePressFallback, /try_files \$uri \$uri\/ \$uri\.html \/index\.html;/)
assert.match(vitePressFallback, /add_header Cache-Control "no-cache" always;/)
assertSecurityHeaders(vitePressFallback, 'VitePress fallback')

const immutableAssets = locationBlock(
  'location ~* ^/assets/.+\\.[a-f0-9]+\\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {',
)
assert.match(immutableAssets, /add_header Cache-Control "public, max-age=31536000, immutable";/)
assert.doesNotMatch(
  immutableAssets,
  /add_header Cache-Control "public, max-age=31536000, immutable" always;/,
  'Immutable asset cache headers must not use always, otherwise nginx can cache error responses for a year.',
)
assertSecurityHeaders(immutableAssets, 'Immutable asset location')

const staticAssets = locationBlock('location ~* \\.(png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {')
assert.match(staticAssets, /add_header Cache-Control "public, max-age=2592000";/)
assert.doesNotMatch(
  staticAssets,
  /add_header Cache-Control "public, max-age=2592000" always;/,
  'Static asset cache headers must not use always, otherwise nginx can cache error responses for 30 days.',
)
assertSecurityHeaders(staticAssets, 'Static asset location')

console.log('Responsive docs contract passed')
