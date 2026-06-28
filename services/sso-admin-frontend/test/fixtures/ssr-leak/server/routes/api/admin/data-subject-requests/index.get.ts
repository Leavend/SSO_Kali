// SSR token-leak fixture: the RAW data-subject-request queue exactly as the SHARED
// backend presenter emits it — opaque subject ids PLUS the free-text reason /
// reviewer_notes / reviewer_subject_id fields. The canary strings below MUST be
// stripped per row by observability.api.listDataSubjectRequests (Task 6.4) before
// the §3.3 gate serializes the page, so they appear in neither the SSR HTML nor
// __NUXT_DATA__. The request_id is a letter-interleaved ULID with no 10/16/18-digit
// run; the page masks subject_id/request_id via formatTechnicalPreview
// (REF-XXXXXXXX). No token/secret.
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({
  requests: [
    {
      request_id: '01HX0K7P9MQA2BN4TC6VD8SEFG',
      subject_id: 'sub-dsr-aurora',
      type: 'export',
      status: 'submitted',
      // Free-text PII canary — MUST be stripped at runtime, proven absent below.
      reason: 'SSR_PII_CANARY Budi Santoso budi@example.gov',
      reviewer_subject_id: 'sub-reviewer-canary',
      reviewer_notes: 'SSR_PII_CANARY internal note',
      submitted_at: '2026-06-27T09:00:00Z',
      reviewed_at: null,
      fulfilled_at: null,
      sla_due_at: '2026-07-27T09:00:00Z',
    },
  ],
}))
