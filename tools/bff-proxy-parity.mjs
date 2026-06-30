#!/usr/bin/env node
// ==============================================================================
// BFF proxy parity gate (WGAP2)
//
// The portal (sso-frontend) and admin (sso-admin-frontend) BFFs each carry a
// copy of the genuinely-shared widget/OIDC proxy plumbing. There is no shared
// workspace package, so the copies must be kept in lockstep by hand. They have
// drifted before (function rename, formatting, an OPTIONS-body fix that landed
// in one copy first) — and the hop-by-hop strip-lists in proxy-headers.ts are
// security load-bearing (CORS/cookie transparency, see CLAUDE.md), so a missed
// copy on a future security edit is the real hazard.
//
// SINCE THE ADMIN CUTOVER TO NUXT 4 (Phase 18): the portal BFF is a Node http
// server (src/server/, ESM-explicit `.js` imports) while the admin BFF is now a
// Nitro server (server/utils/, extensionless imports + its own prettier run).
// Byte-identity is therefore no longer achievable across frameworks. This gate
// now asserts SEMANTIC-TOKEN parity: it strips comments, relative-import `.js`
// extensions, and ALL whitespace, then compares. That ignores the legitimate
// framework/formatting differences while still failing on ANY real drift in a
// strip-list entry, header name, or control-flow token (the security hazard).
//
// The service-AGNOSTIC widget cookie surface (widget-cookie.ts) is compared too:
// it carries the __Host-sso_session attribute set shared by both BFFs, so a
// re-coupling of widgetHostCookieOptions or a new attribute on one copy's widget
// cookie fails the gate here (closes PGAP1).
//
// NOT compared here: cookies.ts / session.ts (service-specific code — they carry
// names like __Host-sso-portal-session vs __Host-sso-admin-session) and the route
// guards (shouldProxyPortalPath vs shouldProxyAdminWidgetPath) — those legitimately
// differ in scope.
//
// Usage: node tools/bff-proxy-parity.mjs
// ==============================================================================

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

const portalServerDir = join(repoRoot, 'services/sso-frontend/src/server')
// Admin BFF is Nitro post-cutover: the shared proxy files live in server/utils/.
const adminServerDir = join(repoRoot, 'services/sso-admin-frontend/server/utils')

// Genuinely-shared files that MUST stay in semantic-token parity across both BFFs.
const SHARED_FILES = ['sso-backend-proxy.ts', 'proxy-headers.ts', 'widget-cookie.ts']

// Reduce a source file to its security-relevant token stream: drop comments,
// relative-import `.js` extensions (Node-ESM vs Nitro resolution), and ALL
// whitespace. What survives — identifiers, strip-list string literals, operators,
// control flow — is exactly what must not drift between the two BFFs.
function normalize(source) {
  return source
    .replace(/\r\n/gu, '\n')
    .replace(/\/\*[\s\S]*?\*\//gu, '') // block comments
    .replace(/\/\/[^\n]*/gu, '') // line comments
    .replace(/(from\s+['"]\.[^'"]*?)\.js(['"])/gu, '$1$2') // strip .js from relative imports
    .replace(/\s+/gu, '') // all whitespace (formatting-insensitive)
}

function firstDiff(a, b) {
  const max = Math.max(a.length, b.length)
  for (let i = 0; i < max; i++) {
    if (a[i] !== b[i]) {
      const from = Math.max(0, i - 40)
      return {
        offset: i,
        portal: `…${a.slice(from, i + 40)}`,
        admin: `…${b.slice(from, i + 40)}`,
      }
    }
  }
  return null
}

const failures = []

for (const fileName of SHARED_FILES) {
  const portalPath = join(portalServerDir, fileName)
  const adminPath = join(adminServerDir, fileName)

  let portalSource
  let adminSource
  try {
    portalSource = normalize(readFileSync(portalPath, 'utf8'))
    adminSource = normalize(readFileSync(adminPath, 'utf8'))
  } catch (error) {
    failures.push({ fileName, message: `Could not read both copies: ${error.message}` })
    continue
  }

  if (portalSource !== adminSource) {
    const diff = firstDiff(portalSource, adminSource)
    const detail = diff
      ? [
          `  First token difference at normalized offset ${diff.offset}:`,
          `    portal: ${diff.portal}`,
          `    admin : ${diff.admin}`,
        ].join('\n')
      : '  Files differ but no offset-level diff could be computed.'
    failures.push({
      fileName,
      message: [
        `Shared BFF file drifted out of semantic-token parity:`,
        `    ${relative(repoRoot, portalPath)}`,
        `    ${relative(repoRoot, adminPath)}`,
        detail,
      ].join('\n'),
    })
  }
}

if (failures.length > 0) {
  console.error('BFF proxy parity gate FAILED.\n')
  for (const failure of failures) {
    console.error(`[${failure.fileName}] ${failure.message}\n`)
  }
  console.error(
    'These files must stay in semantic-token parity across both BFFs (no shared\n' +
      'workspace package exists; only comments/imports/whitespace may differ between\n' +
      'the portal Node BFF and the admin Nitro BFF). Re-sync the LOGIC before merging —\n' +
      'the portal (sso-frontend) is the reference. See docs/audits/widget-bff-proxy-\n' +
      'cookie-parity-wgap2-audit-2026-06-25.md.',
  )
  process.exit(1)
}

console.log(
  `BFF proxy parity gate PASSED — ${SHARED_FILES.length} shared file(s) in semantic-token parity:`,
)
for (const fileName of SHARED_FILES) console.log(`  ✓ ${fileName}`)
