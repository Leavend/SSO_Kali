import type {
  AuditExportFilters,
  AuditExportFormat,
  ComplianceEvidencePackFilters,
  EvidencePackFormat,
} from '@/types/compliance.types'

// Carry-forward of the legacy `withQuery` contract: a value is included only
// when it is not undefined, null, or the empty string; everything else is
// String()-coerced. URLSearchParams does the encoding + "&" joining; we add the
// leading "?" ourselves so the service can concatenate it straight onto a path.
// Whitespace-only is intentionally NOT empty — it round-trips encoded.
function buildQuery(filters: Record<string, unknown>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  const query = params.toString()
  return query === '' ? '' : `?${query}`
}

export function buildAuditExportQuery(filters: AuditExportFilters): string {
  // `format` is required on the type and never empty, so the result always
  // carries at least `?format=…`.
  return buildQuery({
    format: filters.format,
    from: filters.from,
    to: filters.to,
    action: filters.action,
    outcome: filters.outcome,
    taxonomy: filters.taxonomy,
    admin_subject_id: filters.admin_subject_id,
    request_id: filters.request_id,
    support_reference: filters.support_reference,
  })
}

export function buildEvidencePackQuery(filters: ComplianceEvidencePackFilters): string {
  // Every field is optional, so a fully-empty filter yields "" (the service hits
  // the bare endpoint and the backend applies its own defaults).
  return buildQuery({
    format: filters.format,
    from: filters.from,
    to: filters.to,
    correlation_id: filters.correlation_id,
  })
}

// The evidence-pack backend requires a bounded scope: an explicit from+to window
// OR a correlation id. Reproduces the legacy client gate so the panel never POSTs
// a request the backend would 422.
export function canSubmitEvidencePack(filters: ComplianceEvidencePackFilters): boolean {
  return Boolean((filters.from && filters.to) || filters.correlation_id?.trim())
}

// Used only when the upstream `Content-Disposition` is absent; the format drives
// the extension so the downloaded file is still self-describing.
export function auditExportFallbackName(format: AuditExportFormat): string {
  return `admin-audit-events.${format}`
}

export function evidencePackFallbackName(format: EvidencePackFormat | undefined): string {
  return `compliance-evidence-pack.${format ?? 'zip'}`
}
