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
// This gate asserts the shared files are byte-identical across both server/
// dirs (after normalizing line endings + trailing whitespace) and exits
// non-zero with a clear diff on drift.
//
// The service-AGNOSTIC widget cookie surface (widget-cookie.ts) is byte-compared
// too: it carries the __Host-sso_session attribute set shared by both BFFs, so a
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
const adminServerDir = join(repoRoot, 'services/sso-admin-frontend/src/server')

// Genuinely-shared files that MUST be byte-identical across both BFFs.
const SHARED_FILES = ['sso-backend-proxy.ts', 'proxy-headers.ts', 'widget-cookie.ts']

function normalize(source) {
  return source
    .replace(/\r\n/gu, '\n') // CRLF -> LF
    .replace(/[ \t]+$/gmu, '') // strip trailing whitespace per line
}

function firstDiff(a, b) {
  const aLines = a.split('\n')
  const bLines = b.split('\n')
  const max = Math.max(aLines.length, bLines.length)

  for (let i = 0; i < max; i++) {
    const aLine = aLines[i]
    const bLine = bLines[i]
    if (aLine !== bLine) {
      return {
        line: i + 1,
        portal: aLine === undefined ? '<missing line>' : aLine,
        admin: bLine === undefined ? '<missing line>' : bLine,
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
          `  First difference at line ${diff.line}:`,
          `    portal: ${diff.portal}`,
          `    admin : ${diff.admin}`,
        ].join('\n')
      : '  Files differ but no line-level diff could be computed.'
    failures.push({
      fileName,
      message: [
        `Shared BFF file drifted out of byte-parity:`,
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
    'These files are intentionally byte-identical across both BFFs (no shared\n' +
      'workspace package exists). Re-sync the copies before merging — the portal\n' +
      '(sso-frontend) is the reference. See docs/audits/widget-bff-proxy-cookie-\n' +
      'parity-wgap2-audit-2026-06-25.md.',
  )
  process.exit(1)
}

console.log(`BFF proxy parity gate PASSED — ${SHARED_FILES.length} shared file(s) byte-identical:`)
for (const fileName of SHARED_FILES) console.log(`  ✓ src/server/${fileName}`)
