// Safe, masked observability-summary DTO for GET /admin/api/observability/summary.
// Every field is an aggregate metric, a service-health flag, a timestamp, or a
// masked log reference — NO token, secret, identifier, or raw PII (verified
// against the backend contract). Resilient: the backend degrades a failing
// section to a fallback, sets `partial=true`, and names it in `degraded`.
export type ObservabilityServiceStatus = 'healthy' | 'degraded' | 'down' | 'unknown'

export type ObservabilityQueue = {
  readonly pending_jobs: number
  readonly failed_jobs: number
  readonly oldest_pending_age_seconds: number | null
}

export type ObservabilityService = {
  readonly key: string
  readonly name: string
  readonly status: ObservabilityServiceStatus
  readonly summary: string
  readonly latency_p95_ms?: number | null
  readonly freshness_seconds?: number
  readonly checks?: Readonly<Record<string, boolean>>
  readonly queue?: ObservabilityQueue
}

export type ObservabilityMetrics = {
  readonly window_seconds: number
  readonly freshness_seconds?: number
  readonly queue?: ObservabilityQueue
  readonly performance?: Readonly<Record<string, unknown>>
  readonly auth_funnel?: Readonly<Record<string, number>>
  readonly admin_activity?: Readonly<Record<string, number>>
}

export type ObservabilityLogSeverity = 'info' | 'warning' | 'error' | string

export type ObservabilityLogEvent = {
  readonly id?: string
  readonly service: string
  readonly severity: ObservabilityLogSeverity
  readonly message: string
  readonly reference?: string | null
  readonly occurred_at?: string | null
}

export type ObservabilityTraces = {
  readonly status: string
  readonly reason: string
  readonly next_step?: string
  readonly last_seen_trace_id?: string | null
}

export type ObservabilitySummary = {
  readonly generated_at: string
  readonly partial: boolean
  readonly degraded: readonly string[]
  readonly services: readonly ObservabilityService[]
  readonly metrics: ObservabilityMetrics
  readonly freshness?: { readonly recent_events_seconds?: number }
  readonly logs: readonly ObservabilityLogEvent[]
  readonly traces: ObservabilityTraces
}
