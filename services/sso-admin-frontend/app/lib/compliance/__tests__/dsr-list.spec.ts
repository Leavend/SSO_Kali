import { describe, expect, it } from 'vitest'
import { DSR_PAGE_SIZE, dsrPageCount, filterDsr, paginateDsr } from '../dsr-list'
import type { DataSubjectRequest } from '@/types/compliance.types'

// A single fully-typed sample row; overrides keep each case readable. The DTO is
// the NARROWED, masked list form — `subject_id` is the opaque OIDC subject id and
// there is NO email/NIK/NIP/NISN/name and NO free-text reason/notes field at all
// (those are stripped in Task 6.4). The "leak-through" case below casts a stray
// free-text key in to prove the filter still never searches it (PII minimization).
const base: DataSubjectRequest = {
  request_id: '01HZ0000000000000000000001',
  subject_id: 'sub_budi',
  type: 'export',
  status: 'submitted',
  submitted_at: '2026-06-01T00:00:00Z',
  reviewed_at: null,
  fulfilled_at: null,
  sla_due_at: '2026-06-30T00:00:00Z',
}

function makeDsr(overrides: Partial<DataSubjectRequest>): DataSubjectRequest {
  return { ...base, ...overrides }
}

const sample: readonly DataSubjectRequest[] = [
  makeDsr({ request_id: 'req_budi', subject_id: 'sub_budi', status: 'submitted' }),
  makeDsr({ request_id: 'req_citra', subject_id: 'sub_citra', status: 'approved' }),
  makeDsr({ request_id: 'req_dewi', subject_id: 'sub_dewi', status: 'rejected' }),
  makeDsr({ request_id: 'req_eko', subject_id: 'sub_eko', status: 'fulfilled' }),
]

describe('filterDsr', () => {
  it('returns the full list when query is empty and status is "all"', () => {
    expect(filterDsr(sample, { query: '', status: 'all' })).toHaveLength(4)
    // whitespace-only query is treated as empty
    expect(filterDsr(sample, { query: '   ', status: 'all' })).toHaveLength(4)
  })

  it('matches case-insensitively across request_id and subject_id only', () => {
    expect(filterDsr(sample, { query: 'CITRA', status: 'all' }).map((r) => r.request_id)).toEqual([
      'req_citra',
    ])
    expect(
      filterDsr(sample, { query: 'sub_dewi', status: 'all' }).map((r) => r.request_id),
    ).toEqual(['req_dewi'])
    expect(filterDsr(sample, { query: 'req_eko', status: 'all' }).map((r) => r.request_id)).toEqual(
      ['req_eko'],
    )
  })

  it('never matches free-text even if a raw row leaks one through (PII minimization)', () => {
    // The narrowed DTO has no reason/notes, but a raw backend row (pre-strip) could;
    // the filter must still search only the opaque ids. Cast a stray field in.
    const withFreeText = [
      { ...base, reason: 'ALPHA-secret' },
    ] as unknown as readonly DataSubjectRequest[]
    expect(filterDsr(withFreeText, { query: 'alpha-secret', status: 'all' })).toEqual([])
  })

  it('filters by status', () => {
    expect(filterDsr(sample, { query: '', status: 'rejected' }).map((r) => r.request_id)).toEqual([
      'req_dewi',
    ])
    expect(filterDsr(sample, { query: '', status: 'fulfilled' }).map((r) => r.request_id)).toEqual([
      'req_eko',
    ])
  })

  it('combines query and status (AND)', () => {
    expect(filterDsr(sample, { query: 'citra', status: 'submitted' })).toHaveLength(0)
    expect(filterDsr(sample, { query: 'citra', status: 'approved' })).toHaveLength(1)
  })
})

describe('paginateDsr', () => {
  const many: readonly DataSubjectRequest[] = Array.from({ length: 30 }, (_, i) =>
    makeDsr({ request_id: `req_${i}`, subject_id: `sub_${i}` }),
  )

  it('returns the first page-size slice for page 1 and the remainder for page 2', () => {
    expect(paginateDsr(many, 1)).toHaveLength(DSR_PAGE_SIZE)
    expect(paginateDsr(many, 2)).toHaveLength(30 - DSR_PAGE_SIZE)
    expect(paginateDsr(many, 1)[0]?.request_id).toBe('req_0')
    expect(paginateDsr(many, 2)[0]?.request_id).toBe(`req_${DSR_PAGE_SIZE}`)
  })

  it('honours an explicit page size and clamps page < 1 to the first page', () => {
    expect(paginateDsr(many, 1, 10)).toHaveLength(10)
    expect(paginateDsr(many, 0, 10)[0]?.request_id).toBe('req_0')
  })

  it('returns an empty slice for a page beyond the data', () => {
    expect(paginateDsr(many, 99)).toEqual([])
  })
})

describe('dsrPageCount', () => {
  it('ceils total/size and is never below 1', () => {
    expect(dsrPageCount(0)).toBe(1)
    expect(dsrPageCount(25)).toBe(1)
    expect(dsrPageCount(26)).toBe(2)
    expect(dsrPageCount(50)).toBe(2)
    expect(dsrPageCount(51)).toBe(3)
    expect(dsrPageCount(10, 10)).toBe(1)
    expect(dsrPageCount(11, 10)).toBe(2)
  })
})
