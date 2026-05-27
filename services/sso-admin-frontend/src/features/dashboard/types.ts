export type DashboardCounterGroup = Readonly<Record<string, number>>

export type DashboardSummary = {
  readonly generated_at: string
  readonly counters: {
    readonly users: DashboardCounterGroup
    readonly sessions: DashboardCounterGroup
    readonly clients: DashboardCounterGroup
    readonly audit: DashboardCounterGroup
    readonly incidents: DashboardCounterGroup
    readonly data_subject_requests: DashboardCounterGroup
  }
}
