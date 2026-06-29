/** Queue health snapshot (config-gated; present only when the backend enables it). */
export type OpsQueueCheck = {
  readonly pending_jobs: number
  readonly failed_jobs: number
  readonly oldest_pending_age_seconds: number | null
}

/**
 * The NARROWED `/ready` checks. database/redis are plain booleans (the real
 * `/ready` shape — the legacy `boolean | {object}` union belongs to the separate
 * `/health/ready` endpoint). The config-gated `external_idps` map is intentionally
 * absent: it is stripped at the parse boundary (see `parseOpsReadiness`) so no IdP
 * endpoint config can hydrate into `__NUXT_DATA__`.
 */
export type OpsReadinessChecks = {
  readonly database: boolean
  readonly redis: boolean
  readonly queue?: OpsQueueCheck
}

export type OpsReadiness = {
  readonly service: string
  readonly ready: boolean
  readonly checks: OpsReadinessChecks
}

/** Display labels passed into the dumb readiness card (page owns i18n). */
export type OpsReadinessLabels = {
  readonly ready: string
  readonly degraded: string
  readonly database: string
  readonly redis: string
  readonly queue: string
  readonly ok: string
  readonly down: string
  readonly pending: string
  readonly failed: string
  readonly oldest: string
}
