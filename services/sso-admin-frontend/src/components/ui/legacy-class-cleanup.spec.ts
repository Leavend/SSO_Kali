/// <reference types="node" />

import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const roots = ['src', 'e2e'] as const
const extensions = new Set(['.vue', '.ts', '.css'])
const legacyClassTokens = [
  'state-card',
  'primary-action',
  'secondary-action',
  'danger-action',
  'status-pill',
  'action-message',
] as const
const selfPath = join('src', 'components', 'ui', 'legacy-class-cleanup.spec.ts')

function extensionOf(path: string): string {
  const match = /\.[^.]+$/u.exec(path)
  return match?.[0] ?? ''
}

function listFiles(path: string): string[] {
  return readdirSync(path).flatMap((entry) => {
    const fullPath = join(path, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) return listFiles(fullPath)
    return extensions.has(extensionOf(fullPath)) ? [fullPath] : []
  })
}

describe('legacy admin ui class cleanup', () => {
  it('keeps removed legacy action and card classes out of source', () => {
    const offenders = roots.flatMap((root) =>
      listFiles(root).flatMap((file) => {
        if (file === selfPath) return []
        const content = readFileSync(file, 'utf8')
        return legacyClassTokens
          .filter((token) => new RegExp(`(?<!ui-)\\b${token}\\b`, 'u').test(content))
          .map((token) => `${file}: ${token}`)
      }),
    )

    expect(offenders).toEqual([])
  })
})
