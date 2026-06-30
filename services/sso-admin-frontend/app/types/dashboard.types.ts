// Safe, masked dashboard summary DTO for GET /admin/api/dashboard/summary.
// Every field is an aggregate counter or a timestamp — no token, secret,
// identifier, or raw PII (verified against the backend contract). Counters are
// nullable: the backend degrades a single counter to `null` (and lists it in
// `degraded`) when its query fails, rather than failing the whole request.
export type DashboardCounter = number | null

export type DashboardCounterGroup = Readonly<Record<string, DashboardCounter>>

export type DashboardCounters = {
  readonly users: DashboardCounterGroup
  readonly sessions: DashboardCounterGroup
  readonly clients: DashboardCounterGroup
  readonly audit: DashboardCounterGroup
  readonly incidents: DashboardCounterGroup
  readonly data_subject_requests: DashboardCounterGroup
}

export type DashboardSummary = {
  readonly generated_at: string
  readonly partial: boolean
  readonly degraded: readonly string[]
  readonly counters: DashboardCounters
}

// Fixed render order for the grid; keyed to the backend counter groups and to
// the `dashboard.counters.<key>` i18n namespace.
export const DASHBOARD_GROUP_KEYS = [
  'users',
  'sessions',
  'clients',
  'audit',
  'incidents',
  'data_subject_requests',
] as const

export type DashboardGroupKey = (typeof DASHBOARD_GROUP_KEYS)[number]
