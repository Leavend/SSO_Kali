/**
 * Operational drill evidence catalog.
 *
 * The SSO backend admin contract intentionally does NOT serve drill evidence:
 * JWKS rotation, backup/restore, DR failover, incident response, and SIEM sink
 * verification are exercised through CI workflows and ops runbooks, which are
 * the systems of record. Coupling the auth backend to CI-artifact storage would
 * be wrong layering, so this page surfaces the real runbook references instead
 * of placeholder copy. Update this catalog when a runbook moves.
 */
export const OPS_RUNBOOK_BASE_URL = 'https://github.com/Leavend/SSO_Kali/blob/main'

export type OpsDrillEvidence = {
  /** Stable key for list rendering. */
  readonly key: string
  /** Human-readable drill name. */
  readonly title: string
  /** What the drill verifies, in operator terms. */
  readonly summary: string
  /** Where the authoritative evidence is produced (CI workflow / smoke scripts). */
  readonly systemOfRecord: string
  /** Repo-relative path to the runbook document of record. */
  readonly runbookPath: string
  /** Repo-relative path to the dated evidence pack. */
  readonly evidenceRef?: string
}

export const OPS_DRILLS: readonly OpsDrillEvidence[] = [
  {
    key: 'jwks-rotation',
    title: 'JWKS rotation drill',
    summary:
      'Rotasi signing key tanpa downtime: key baru dipublish ke JWKS sementara key lama tetap valid selama grace window verifikasi token.',
    systemOfRecord: 'CI workflow: .github/workflows/jwks-rotation-simulation.yml',
    runbookPath: 'docs/security/jwks-caching-rotation-runbook.md',
    evidenceRef: 'docs/ops/evidence/jwks-rotation-2026-05-30.md',
  },
  {
    key: 'discovery-jwks-availability',
    title: 'Discovery/JWKS availability drill',
    summary:
      'SLI smoke untuk OIDC discovery dan JWKS endpoint (latency + availability), dijalankan terhadap produksi.',
    systemOfRecord:
      'Smoke probes: scripts/sso-backend-oidc-production-smoke.sh, scripts/sso-backend-oidc-metadata-vps-latency-probe.sh',
    runbookPath: 'docs/runbooks/on-call-observability-runbook.md',
  },
  {
    key: 'backup-restore',
    title: 'Backup restore drill',
    summary:
      'Restore database/state dari backup terbaru lalu rekonsiliasi hasil; bukti dikumpulkan dalam evidence pack (docs/runbooks/backup-drill-evidence-pack.md).',
    systemOfRecord: 'CI workflow: .github/workflows/backup-restore-drill.yml',
    runbookPath: 'docs/runbooks/backup-restore-drill-runbook.md',
    evidenceRef: 'docs/ops/evidence/backup-restore-2026-05-30.md',
  },
  {
    key: 'dr-failover',
    title: 'DR failover drill',
    summary:
      'Failover/rollback VPS coexistence dengan signoff zero-downtime sebelum dan sesudah cutover.',
    systemOfRecord:
      'CI workflows: .github/workflows/rollback.yml, .github/workflows/vps-maintenance.yml',
    runbookPath: 'docs/runbooks/rollback-runbook-vps-coexistence.md',
    evidenceRef: 'docs/ops/evidence/incident-dr-failover-2026-05-30.md',
  },
  {
    key: 'incident-runbook',
    title: 'Incident runbook evidence',
    summary:
      'On-call routing, severity matrix, dan observability package untuk respons insiden SSO control plane.',
    systemOfRecord: 'On-call rotation + observability package',
    runbookPath: 'docs/runbooks/on-call-observability-runbook.md',
    evidenceRef: 'docs/ops/evidence/incident-dr-failover-2026-05-30.md',
  },
  {
    key: 'siem-sink',
    title: 'SIEM sink verification',
    summary:
      'Verifikasi forwarding audit log ke observability/SIEM sink; bukti in-app tersedia lewat export di halaman Audit Compliance.',
    systemOfRecord: 'Observability package + audit export (Audit Compliance)',
    runbookPath: 'docs/runbooks/on-call-observability-runbook.md',
    evidenceRef: 'docs/ops/evidence/siem-sink-2026-05-30.md',
  },
]

/** Builds an absolute, browser-resolvable runbook URL from a repo-relative path. */
export function runbookHref(runbookPath: string): string {
  return `${OPS_RUNBOOK_BASE_URL}/${runbookPath}`
}
