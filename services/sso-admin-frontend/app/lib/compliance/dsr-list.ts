import type { DataSubjectRequest, DsrStatus } from '@/types/compliance.types'

// The backend `GET /admin/api/data-subject-requests` returns a flat `{ requests }`
// with no query params, so search / status-filter / pagination are derived
// client-side over the hydrated list. 25 mirrors the legacy DSR queue page size.
export const DSR_PAGE_SIZE = 25

// Case-insensitive substring match over the OPAQUE identifiers only — the request
// id and the OIDC subject id. The narrowed DTO carries no raw PII and no free-text
// `reason`/`reviewer_notes` at all; even if a raw row leaked one through, the
// search never reads it (PII minimization): we only search what the masked queue
// actually renders.
export function filterDsr(
  list: readonly DataSubjectRequest[],
  args: { query: string; status: DsrStatus | 'all' },
): readonly DataSubjectRequest[] {
  const q = args.query.trim().toLowerCase()
  return list.filter((request) => {
    if (args.status !== 'all' && request.status !== args.status) return false
    if (q === '') return true
    return (
      request.request_id.toLowerCase().includes(q) || request.subject_id.toLowerCase().includes(q)
    )
  })
}

// 1-based page; page < 1 is clamped to the first page so a stale page ref can
// never index before the start of the list.
export function paginateDsr(
  list: readonly DataSubjectRequest[],
  page: number,
  size: number = DSR_PAGE_SIZE,
): readonly DataSubjectRequest[] {
  const start = (Math.max(1, page) - 1) * size
  return list.slice(start, start + size)
}

// Always at least one page so the folio renders "01 / 01" for an empty result.
export function dsrPageCount(total: number, size: number = DSR_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size))
}
