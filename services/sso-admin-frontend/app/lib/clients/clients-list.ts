import type { AdminClientListItem, ClientRegistration, ClientStatus } from '@/types/clients.types'

// The backend `GET /api/admin/clients` returns a flat `{ clients }` with no query
// params (extract-legacy §6), so search / status-filter / pagination are derived
// client-side over the hydrated, already-masked list. 25 mirrors the Phase-4
// Users table page size.
export const CLIENTS_PAGE_SIZE = 25

export type ClientsStatusFilter = 'all' | ClientStatus

// A registration carries no `category`, `backchannel_logout_internal`, or secret
// timestamps — it is a strict subset of the list item. Lift it into the merged
// shape explicitly so the overlay below stays fully typed (no `Record` cast).
function registrationToListItem(reg: ClientRegistration): AdminClientListItem {
  return {
    client_id: reg.client_id,
    display_name: reg.display_name,
    type: reg.type,
    environment: reg.environment,
    app_base_url: reg.app_base_url,
    redirect_uris: reg.redirect_uris,
    post_logout_redirect_uris: reg.post_logout_redirect_uris,
    allowed_scopes: reg.allowed_scopes,
    backchannel_logout_uri: reg.backchannel_logout_uri,
    owner_email: reg.owner_email,
    provisioning: reg.provisioning,
    status: reg.status,
    has_secret_hash: reg.has_secret_hash,
  }
}

// Parity-critical (extract-legacy §5): per-field `runtime[k] ?? registration[k]`
// so a registration's display_name / type / owner_email / backchannel survives a
// runtime row whose field is null. Fields the runtime DTO owns exclusively
// (category, backchannel_logout_internal) come straight from runtime.
function overlay(runtime: AdminClientListItem, base: AdminClientListItem): AdminClientListItem {
  return {
    client_id: runtime.client_id,
    display_name: runtime.display_name ?? base.display_name,
    type: runtime.type ?? base.type,
    environment: runtime.environment ?? base.environment,
    app_base_url: runtime.app_base_url ?? base.app_base_url,
    redirect_uris: runtime.redirect_uris ?? base.redirect_uris,
    post_logout_redirect_uris: runtime.post_logout_redirect_uris ?? base.post_logout_redirect_uris,
    allowed_scopes: runtime.allowed_scopes ?? base.allowed_scopes,
    backchannel_logout_uri: runtime.backchannel_logout_uri ?? base.backchannel_logout_uri,
    backchannel_logout_internal:
      runtime.backchannel_logout_internal ?? base.backchannel_logout_internal,
    owner_email: runtime.owner_email ?? base.owner_email,
    provisioning: runtime.provisioning ?? base.provisioning,
    status: runtime.status ?? base.status,
    category: runtime.category ?? base.category,
    has_secret_hash: runtime.has_secret_hash ?? base.has_secret_hash,
  }
}

// Seed from registrations first so registration-only (e.g. `staged`) clients
// still appear; then overlay runtime per-field. Replaces the legacy
// `mergeClientMetadata` `Record<string, unknown>` cast with a typed merge.
export function mergeClients(
  runtime: readonly AdminClientListItem[],
  registrations: readonly ClientRegistration[],
): readonly AdminClientListItem[] {
  const merged = new Map<string, AdminClientListItem>()
  for (const reg of registrations) {
    merged.set(reg.client_id, registrationToListItem(reg))
  }
  for (const client of runtime) {
    const base = merged.get(client.client_id)
    merged.set(client.client_id, base ? overlay(client, base) : client)
  }
  return [...merged.values()]
}

// Case-insensitive substring over the operator-meaningful fields (display name,
// client id); status filters on `status`. No PII fields exist on a client.
export function filterClients(
  list: readonly AdminClientListItem[],
  opts: { query: string; status: ClientsStatusFilter },
): readonly AdminClientListItem[] {
  const q = opts.query.trim().toLowerCase()
  return list.filter((client) => {
    if (opts.status !== 'all' && client.status !== opts.status) return false
    if (q === '') return true
    return (
      (client.display_name ?? '').toLowerCase().includes(q) ||
      client.client_id.toLowerCase().includes(q)
    )
  })
}

// 1-based page; page < 1 is clamped to the first page so a stale page ref can
// never index before the start of the list.
export function paginateClients(
  list: readonly AdminClientListItem[],
  page: number,
  size: number = CLIENTS_PAGE_SIZE,
): readonly AdminClientListItem[] {
  const start = (Math.max(1, page) - 1) * size
  return list.slice(start, start + size)
}

// Always at least one page so the folio renders "01 / 01" for an empty result.
export function clientsPageCount(total: number, size: number = CLIENTS_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size))
}
