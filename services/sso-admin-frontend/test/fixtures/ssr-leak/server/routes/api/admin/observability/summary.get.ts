// SSR token-leak fixture: a representative MASKED observability summary so the
// §3.3 gate renders /observability in its READY state and the payload collectors
// cover the ObservabilitySummary DTO. Small aggregates + opaque ids only — no
// token, secret, or 10/16/18-digit run (a more-specific route wins over the
// layer's catch-all server/routes/api/admin/[...].ts).
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({
  generated_at: '2026-06-28T14:32:15Z',
  partial: false,
  degraded: [],
  services: [
    {
      key: 'idp_backend',
      name: 'IdP Backend',
      status: 'healthy',
      summary: 'All checks passing',
      latency_p95_ms: 84,
      freshness_seconds: 12,
      checks: { database: true, cache: true, mail: true },
    },
    {
      key: 'queue_worker',
      name: 'Queue Worker',
      status: 'healthy',
      summary: 'No backlog',
      freshness_seconds: 9,
      queue: { pending_jobs: 2, failed_jobs: 0, oldest_pending_age_seconds: 9 },
    },
  ],
  metrics: {
    window_seconds: 86400,
    freshness_seconds: 30,
    queue: { pending_jobs: 2, failed_jobs: 0, oldest_pending_age_seconds: 9 },
    auth_funnel: { attempts: 1840, succeeded: 1795, denied: 45 },
    admin_activity: { actions: 320, denied: 4 },
  },
  freshness: { recent_events_seconds: 30 },
  logs: [
    {
      id: 'log-aurora-7',
      service: 'idp_backend',
      severity: 'info',
      message: 'Authorization code issued',
      reference: 'evt-7c2a',
      occurred_at: '2026-06-28T14:31:50Z',
    },
  ],
  traces: {
    status: 'unavailable',
    reason: 'No tracing backend configured',
    next_step: 'Configure an OTLP exporter',
    last_seen_trace_id: null,
  },
}))
