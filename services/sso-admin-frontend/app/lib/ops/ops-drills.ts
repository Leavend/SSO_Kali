/**
 * Operational drill evidence catalog.
 *
 * The SSO backend admin contract intentionally does NOT serve drill evidence:
 * JWKS rotation, backup/restore, DR failover, incident response, and SIEM-sink
 * verification are exercised through CI workflows and ops runbooks, which are the
 * systems of record. Coupling the auth backend to CI-artifact storage would be
 * wrong layering, so this page surfaces the real runbook references instead.
 *
 * ponytail: drill content is operator-facing technical REFERENCE (file paths, CI
 * workflow names) — inherently non-localized identifiers, not UI chrome — so it
 * lives as a data module rather than i18n keys. Update the catalog when a runbook
 * moves.
 */
export const OPS_RUNBOOK_BASE_URL = 'https://github.com/Leavend/SSO_Kali/blob/main'

export type OpsDrill = {
  /** Stable key for list rendering + testids. */
  readonly key: string
  /** Human-readable drill name. */
  readonly title: string
  /** What the drill verifies, in operator terms. */
  readonly summary: string
  /** Where the authoritative evidence is produced (CI workflow / smoke scripts). */
  readonly systemOfRecord: string
  /** Repo-relative path to the runbook document of record. */
  readonly runbookPath: string
  /** Repo-relative path to the dated evidence pack, when one exists. */
  readonly evidenceRef?: string
}

export const OPS_DRILLS: readonly OpsDrill[] = [
  {
    key: 'jwks-rotation',
    title: 'JWKS rotation drill',
    summary:
      'Rotate the signing key with zero downtime: the new key publishes to JWKS while the previous key stays valid through the token-verification grace window.',
    systemOfRecord: 'CI workflow: .github/workflows/jwks-rotation-simulation.yml',
    runbookPath: 'docs/security/jwks-caching-rotation-runbook.md',
    evidenceRef: 'docs/ops/evidence/jwks-rotation-2026-05-30.md',
  },
  {
    key: 'discovery-jwks-availability',
    title: 'Discovery / JWKS availability drill',
    summary:
      'SLI smoke for the OIDC discovery and JWKS endpoints (latency + availability), run against production.',
    systemOfRecord:
      'Smoke probes: scripts/sso-backend-oidc-production-smoke.sh, scripts/sso-backend-oidc-metadata-vps-latency-probe.sh',
    runbookPath: 'docs/runbooks/on-call-observability-runbook.md',
  },
  {
    key: 'backup-restore',
    title: 'Backup restore drill',
    summary:
      'Restore the database/state from the latest backup and reconcile the result; evidence is collected in the dated evidence pack.',
    systemOfRecord: 'CI workflow: .github/workflows/backup-restore-drill.yml',
    runbookPath: 'docs/runbooks/backup-restore-drill-runbook.md',
    evidenceRef: 'docs/ops/evidence/backup-restore-2026-05-30.md',
  },
  {
    key: 'dr-failover',
    title: 'DR failover drill',
    summary:
      'Fail over / roll back the VPS coexistence pair with a zero-downtime signoff before and after cutover.',
    systemOfRecord:
      'CI workflows: .github/workflows/rollback.yml, .github/workflows/vps-maintenance.yml',
    runbookPath: 'docs/runbooks/rollback-runbook-vps-coexistence.md',
    evidenceRef: 'docs/ops/evidence/incident-dr-failover-2026-05-30.md',
  },
  {
    key: 'incident-runbook',
    title: 'Incident runbook evidence',
    summary:
      'On-call routing, severity matrix, and observability package for SSO control-plane incident response.',
    systemOfRecord: 'On-call rotation + observability package',
    runbookPath: 'docs/runbooks/on-call-observability-runbook.md',
    evidenceRef: 'docs/ops/evidence/incident-dr-failover-2026-05-30.md',
  },
  {
    key: 'siem-sink',
    title: 'SIEM sink verification',
    summary:
      'Verify audit-log forwarding to the observability / SIEM sink; in-app evidence is available via the export on the Audit Compliance page.',
    systemOfRecord: 'Observability package + audit export (Audit Compliance)',
    runbookPath: 'docs/runbooks/on-call-observability-runbook.md',
    evidenceRef: 'docs/ops/evidence/siem-sink-2026-05-30.md',
  },
]

/** Builds an absolute, browser-resolvable runbook URL from a repo-relative path. */
export function runbookHref(runbookPath: string): string {
  return `${OPS_RUNBOOK_BASE_URL}/${runbookPath}`
}
