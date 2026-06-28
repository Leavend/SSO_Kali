// SSR token-leak fixture: a representative MASKED retention status so the §3.3
// gate renders /observability/compliance in its READY state and the payload
// collectors cover the RetentionResponse DTO. No token/secret/PII-digit run.
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({
  retention: {
    generated_at: '2026-06-28T14:32:15Z',
    items: [
      {
        category: 'authentication_audit_events',
        label: 'Authentication audit events',
        window: { days: 90 },
        cutoff: '2026-03-30T00:00:00Z',
        schedule: 'daily',
        candidate_count: 3,
        last_pruned_at: '2026-06-28T00:10:00Z',
        last_pruned_count: 12,
      },
      {
        category: 'admin_audit_events',
        label: 'Admin audit events',
        window: { days: 365 },
        cutoff: '2025-06-28T00:00:00Z',
        schedule: 'daily',
        candidate_count: 0,
        last_pruned_at: null,
        last_pruned_count: null,
      },
    ],
  },
}))
