import { describe, expect, it } from 'vitest'
import { OPS_DRILLS, OPS_RUNBOOK_BASE_URL, runbookHref } from '../drills'

describe('ops drill evidence catalog', () => {
  it('covers the six operational drills from the audit gap', () => {
    const titles = OPS_DRILLS.map((drill) => drill.title)

    expect(OPS_DRILLS).toHaveLength(6)
    expect(titles).toContain('JWKS rotation drill')
    expect(titles).toContain('Discovery/JWKS availability drill')
    expect(titles).toContain('Backup restore drill')
    expect(titles).toContain('DR failover drill')
    expect(titles).toContain('Incident runbook evidence')
    expect(titles).toContain('SIEM sink verification')
  })

  it('points every drill at a real repo runbook path with a system of record', () => {
    const drillsWithEvidence = OPS_DRILLS.filter((d) => d.evidenceRef !== undefined)

    for (const drill of OPS_DRILLS) {
      expect(drill.summary.length).toBeGreaterThan(0)
      expect(drill.systemOfRecord.length).toBeGreaterThan(0)
      expect(drill.runbookPath).toMatch(/^docs\/.+\.md$/)
    }

    for (const drill of drillsWithEvidence) {
      expect(drill.evidenceRef).toMatch(/^docs\/ops\/evidence\/.+\.md$/)
    }
  })

  it('has evidenceRef on five of six drills (excluding discovery-jwks-availability)', () => {
    const withEvidence = OPS_DRILLS.filter((d) => d.evidenceRef !== undefined)
    expect(withEvidence).toHaveLength(5)

    const discovery = OPS_DRILLS.find((d) => d.key === 'discovery-jwks-availability')
    expect(discovery?.evidenceRef).toBeUndefined()
  })

  it('builds an absolute runbook URL from the repo base and the doc path', () => {
    expect(runbookHref('docs/security/jwks-caching-rotation-runbook.md')).toBe(
      `${OPS_RUNBOOK_BASE_URL}/docs/security/jwks-caching-rotation-runbook.md`,
    )
  })

  it('never exposes a credential value in the catalog text', () => {
    // Guard against leaked credential-shaped values, not domain words like
    // "token verification" which are legitimate operator copy.
    const serialized = JSON.stringify(OPS_DRILLS)
    expect(serialized).not.toMatch(/Bearer\s|client_secret|password|api[_-]?key/iu)
  })
})
