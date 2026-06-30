import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type BlobResponse } from '@/lib/api/api-client'
import { buildAuditExportQuery, buildEvidencePackQuery } from '@/lib/compliance/audit-export'
import type { AuditExportFilters, ComplianceEvidencePackFilters } from '@/types/compliance.types'

// vi.hoisted ensures the fns are initialized before the vi.mock factory runs
// (const declarations are in TDZ when an async factory is hoisted). The
// async+importActual form is required to keep the real ApiError class intact
// for the rejects.toMatchObject assertion.
const { get, post, getBlob } = vi.hoisted(() => ({
  get: vi.fn<(path: string) => Promise<unknown>>(),
  post: vi.fn<(path: string, body?: unknown) => Promise<unknown>>(),
  getBlob: vi.fn<(path: string) => Promise<BlobResponse>>(),
}))
vi.mock('@/lib/api/api-client', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/api/api-client')>()),
  apiClient: { get, post, getBlob },
}))

const { observabilityApi } = await import('../observability.api')

const blob: BlobResponse = {
  blob: new Blob(['x'], { type: 'text/csv' }),
  filename: 'admin-audit-events.csv',
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  getBlob.mockReset()
})

describe('observabilityApi — read seams', () => {
  it('getSummary() GETs the same-origin observability summary path and passes the DTO through', async () => {
    const payload = { generated_at: '2026-06-28T14:32:15Z' }
    get.mockResolvedValue(payload)
    await expect(observabilityApi.getSummary()).resolves.toBe(payload)
    expect(get).toHaveBeenCalledWith('/api/admin/observability/summary')
  })

  it('getRetention() GETs the same-origin retention path', async () => {
    const payload = { retention: { generated_at: '2026-06-28T14:32:15Z', items: [] } }
    get.mockResolvedValue(payload)
    await expect(observabilityApi.getRetention()).resolves.toBe(payload)
    expect(get).toHaveBeenCalledWith('/api/admin/audit/retention')
  })

  it('listDataSubjectRequests() GETs the bare path (no query string — the queue filters client-side)', async () => {
    get.mockResolvedValue({ requests: [] })
    await observabilityApi.listDataSubjectRequests()
    expect(get).toHaveBeenCalledWith('/api/admin/data-subject-requests')
  })

  it('listDataSubjectRequests() strips free-text PII from every row at runtime (keys ABSENT, not just typed away)', async () => {
    // The shared backend presenter emits reason/reviewer_notes/reviewer_subject_id
    // on each list row — a real-name/email leak vector into __NUXT_DATA__. The
    // mock returns a raw row carrying them; the service must drop them per row.
    get.mockResolvedValue({
      requests: [
        {
          request_id: 'req-1',
          subject_id: 'sub-1',
          type: 'export',
          status: 'submitted',
          submitted_at: '2026-06-01T00:00:00Z',
          reviewed_at: null,
          fulfilled_at: null,
          sla_due_at: null,
          reason: 'SSR_PII_CANARY Budi Santoso budi@example.gov',
          reviewer_notes: 'SSR_PII_CANARY internal note',
          reviewer_subject_id: 'sub-reviewer-canary',
        },
      ],
    })
    const { requests } = await observabilityApi.listDataSubjectRequests()
    const item = requests[0]!
    expect('reason' in item).toBe(false)
    expect('reviewer_notes' in item).toBe(false)
    expect('reviewer_subject_id' in item).toBe(false)
    expect(item).toEqual({
      request_id: 'req-1',
      subject_id: 'sub-1',
      type: 'export',
      status: 'submitted',
      submitted_at: '2026-06-01T00:00:00Z',
      reviewed_at: null,
      fulfilled_at: null,
      sla_due_at: null,
    })
  })
})

describe('observabilityApi — DSR lifecycle (POST)', () => {
  it('reviewDsr() POSTs the decision payload to the per-request review path', async () => {
    post.mockResolvedValue({ request: {} })
    await observabilityApi.reviewDsr('01J0DSR0000000000000000001', {
      decision: 'approved',
      notes: 'verified',
    })
    expect(post).toHaveBeenCalledWith(
      '/api/admin/data-subject-requests/01J0DSR0000000000000000001/review',
      {
        decision: 'approved',
        notes: 'verified',
      },
    )
  })

  it('fulfillDsr() POSTs the dry-run flag to the per-request fulfill path', async () => {
    post.mockResolvedValue({ request: {}, dry_run: true, legal_hold_status: 'none' })
    await observabilityApi.fulfillDsr('01J0DSR0000000000000000001', { dry_run: true })
    expect(post).toHaveBeenCalledWith(
      '/api/admin/data-subject-requests/01J0DSR0000000000000000001/fulfill',
      {
        dry_run: true,
      },
    )
  })
})

describe('observabilityApi — blob downloads (first getBlob consumer)', () => {
  it('exportAuditTrail() getBlobs the export path composed with buildAuditExportQuery and returns the BlobResponse', async () => {
    const filters: AuditExportFilters = { format: 'csv', from: '2026-01-01', to: '2026-01-31' }
    getBlob.mockResolvedValue(blob)
    await expect(observabilityApi.exportAuditTrail(filters)).resolves.toBe(blob)
    expect(getBlob).toHaveBeenCalledWith('/api/admin/audit/export' + buildAuditExportQuery(filters))
    // composition is real, not asserted against a hand-written string:
    expect(getBlob.mock.calls[0]?.[0]).toContain('format=csv')
  })

  it('generateEvidencePack() getBlobs the evidence-pack path composed with buildEvidencePackQuery', async () => {
    const filters: ComplianceEvidencePackFilters = { format: 'zip', correlation_id: 'corr-1' }
    getBlob.mockResolvedValue({ ...blob, filename: 'compliance-evidence-pack.zip' })
    await observabilityApi.generateEvidencePack(filters)
    expect(getBlob).toHaveBeenCalledWith(
      '/api/admin/compliance/evidence-pack' + buildEvidencePackQuery(filters),
    )
    expect(getBlob.mock.calls[0]?.[0]).toContain('correlation_id=corr-1')
  })

  it('exportAuditTrail() lets a 428 step-up ApiError propagate unchanged (same matrix as a JSON mutation)', async () => {
    getBlob.mockRejectedValue(new ApiError(428, 'fresh auth required', 'fresh_auth_required'))
    await expect(observabilityApi.exportAuditTrail({ format: 'csv' })).rejects.toMatchObject({
      status: 428,
      code: 'fresh_auth_required',
    })
  })
})
