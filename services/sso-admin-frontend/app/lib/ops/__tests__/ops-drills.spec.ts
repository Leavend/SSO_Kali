import { describe, expect, it } from 'vitest'
import { OPS_DRILLS, OPS_RUNBOOK_BASE_URL, runbookHref } from '@/lib/ops/ops-drills'

describe('ops drills catalog', () => {
  it('is non-empty with unique stable keys', () => {
    expect(OPS_DRILLS.length).toBeGreaterThan(0)
    const keys = OPS_DRILLS.map((d) => d.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('every drill carries the required reference fields', () => {
    for (const drill of OPS_DRILLS) {
      expect(drill.title.length).toBeGreaterThan(0)
      expect(drill.summary.length).toBeGreaterThan(0)
      expect(drill.systemOfRecord.length).toBeGreaterThan(0)
      expect(drill.runbookPath.length).toBeGreaterThan(0)
    }
  })

  it('builds an absolute runbook URL from a repo-relative path', () => {
    expect(runbookHref('docs/runbooks/x.md')).toBe(`${OPS_RUNBOOK_BASE_URL}/docs/runbooks/x.md`)
  })

  it('carries no secret-shaped content', () => {
    const blob = JSON.stringify(OPS_DRILLS)
    expect(blob).not.toMatch(/client_secret|plaintext_secret|access_token/)
  })
})
