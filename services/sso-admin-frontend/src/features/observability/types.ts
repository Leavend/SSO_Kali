export type ObservabilityServiceStatus = 'healthy' | 'degraded' | 'down' | 'unknown'

export type ObservabilityService = {
  readonly key: 'sso-backend' | 'sso-portal' | 'admin-sso' | string
  readonly name: string
  readonly status: ObservabilityServiceStatus
  readonly summary: string
  readonly latency_p95_ms?: number | null
  readonly freshness_seconds?: number | null
  readonly checks?: Readonly<Record<string, unknown>>
  readonly queue?: ObservabilityQueueMetrics
}

export type ObservabilityQueueMetrics = {
  readonly pending_jobs: number
  readonly failed_jobs: number
  readonly oldest_pending_age_seconds: number | null
}

export type ObservabilityLogEvent = {
  readonly id?: string
  readonly service: string
  readonly severity: 'info' | 'warning' | 'error' | string
  readonly message: string
  readonly reference?: string | null
  readonly occurred_at?: string | null
}

export type ObservabilityTraceState = {
  readonly status: 'available' | 'unavailable' | 'partial' | string
  readonly reason: string
  readonly next_step?: string | null
  readonly last_seen_trace_id?: string | null
}

export type ObservabilitySummary = {
  readonly generated_at: string
  readonly partial: boolean
  readonly degraded: readonly string[]
  readonly services: readonly ObservabilityService[]
  readonly metrics: {
    readonly window_seconds: number
    readonly freshness_seconds?: number | null
    readonly queue?: ObservabilityQueueMetrics
    readonly performance?: Readonly<Record<string, unknown>>
    readonly auth_funnel?: Readonly<Record<string, number>>
    readonly admin_activity?: Readonly<Record<string, number>>
  }
  readonly freshness?: {
    readonly recent_events_seconds?: number | null
  }
  readonly logs: readonly ObservabilityLogEvent[]
  readonly traces: ObservabilityTraceState
}
