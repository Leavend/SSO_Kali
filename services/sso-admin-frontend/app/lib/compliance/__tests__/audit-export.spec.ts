import { describe, expect, it } from 'vitest'
import {
  auditExportFallbackName,
  buildAuditExportQuery,
  buildEvidencePackQuery,
  canSubmitEvidencePack,
  evidencePackFallbackName,
} from '../audit-export'
import type { AuditExportFilters, ComplianceEvidencePackFilters } from '@/types/compliance.types'

describe('buildAuditExportQuery', () => {
  it('always emits the required format with a leading "?" when no optionals are set', () => {
    expect(buildAuditExportQuery({ format: 'csv' })).toBe('?format=csv')
    expect(buildAuditExportQuery({ format: 'jsonl' })).toBe('?format=jsonl')
  })

  it('appends only the optionals that are present, in declaration order', () => {
    const filters: AuditExportFilters = {
      format: 'csv',
      from: '2026-01-01',
      to: '2026-01-31',
      action: 'user.locked',
      outcome: 'denied',
    }
    expect(buildAuditExportQuery(filters)).toBe(
      '?format=csv&from=2026-01-01&to=2026-01-31&action=user.locked&outcome=denied',
    )
  })

  it('skips undefined, null and empty-string optionals (the legacy withQuery contract)', () => {
    const filters = {
      format: 'csv',
      from: '2026-01-01',
      to: '',
      action: undefined,
      // null is reachable from upstream nullable fields even if the type narrows it
      taxonomy: null as unknown as string,
      admin_subject_id: '   ', // whitespace is NOT empty -> kept (and url-encoded)
      request_id: 'req_123',
    } as AuditExportFilters
    expect(buildAuditExportQuery(filters)).toBe(
      '?format=csv&from=2026-01-01&admin_subject_id=+++&request_id=req_123',
    )
  })
})

describe('buildEvidencePackQuery', () => {
  it('returns "" when every field is empty (bare endpoint, backend defaults apply)', () => {
    expect(buildEvidencePackQuery({})).toBe('')
    expect(
      buildEvidencePackQuery({ format: undefined, from: '', to: '', correlation_id: '' }),
    ).toBe('')
  })

  it('emits a leading "?" and skips empty optionals', () => {
    const filters: ComplianceEvidencePackFilters = {
      format: 'zip',
      from: '2026-01-01',
      to: '2026-01-31',
    }
    expect(buildEvidencePackQuery(filters)).toBe('?format=zip&from=2026-01-01&to=2026-01-31')
    expect(buildEvidencePackQuery({ correlation_id: 'corr_abc' })).toBe('?correlation_id=corr_abc')
  })
})

describe('canSubmitEvidencePack', () => {
  // The OR truth table: (from AND to) OR a non-empty trimmed correlation_id.
  it.each<[ComplianceEvidencePackFilters, boolean]>([
    [{}, false],
    [{ from: '2026-01-01' }, false],
    [{ to: '2026-01-31' }, false],
    [{ from: '2026-01-01', to: '2026-01-31' }, true],
    [{ correlation_id: 'corr_abc' }, true],
    [{ correlation_id: '   ' }, false],
    [{ from: '2026-01-01', correlation_id: 'corr_abc' }, true],
    [{ format: 'json' }, false],
  ])('canSubmitEvidencePack(%o) === %s', (filters, expected) => {
    expect(canSubmitEvidencePack(filters)).toBe(expected)
  })
})

describe('fallback filenames', () => {
  it('derives the audit-export fallback from the format', () => {
    expect(auditExportFallbackName('csv')).toBe('admin-audit-events.csv')
    expect(auditExportFallbackName('jsonl')).toBe('admin-audit-events.jsonl')
  })

  it('derives the evidence-pack fallback, defaulting an absent format to zip', () => {
    expect(evidencePackFallbackName('zip')).toBe('compliance-evidence-pack.zip')
    expect(evidencePackFallbackName('json')).toBe('compliance-evidence-pack.json')
    expect(evidencePackFallbackName(undefined)).toBe('compliance-evidence-pack.zip')
  })
})
