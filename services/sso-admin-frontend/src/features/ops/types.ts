export type OpsQueueCheck = {
  readonly pending_jobs: number
  readonly failed_jobs: number
  readonly oldest_pending_age_seconds: number | null
}

export type OpsReadinessChecks = {
  readonly database?:
    | boolean
    | { readonly ok?: boolean; readonly latency_ms?: number; readonly error?: string }
  readonly redis?:
    | boolean
    | { readonly ok?: boolean; readonly latency_ms?: number; readonly error?: string }
  readonly queue?: OpsQueueCheck
  readonly signing_keys?: { readonly ok?: boolean; readonly error?: string }
  readonly [key: string]: unknown
}

export type OpsReadiness = {
  readonly service: string
  readonly ready: boolean
  readonly checks: OpsReadinessChecks
  readonly timestamp?: string
}
