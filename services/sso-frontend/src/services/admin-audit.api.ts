import { adminBffDownload, adminBffRequest } from './admin-bff-client'
import type {
  AdminAuditEvent,
  AdminAuditFilters,
  AdminAuditIntegrity,
  AdminAuditPagination,
} from '@/types/admin.types'

export type AdminAuditListResponse = {
  readonly events: readonly AdminAuditEvent[]
  readonly pagination: AdminAuditPagination
}

export const adminAuditApi = {
  list(filters: AdminAuditFilters): Promise<AdminAuditListResponse> {
    return adminBffRequest<AdminAuditListResponse>(`/api/admin/audit/events${queryString(filters)}`)
  },

  async integrity(): Promise<AdminAuditIntegrity> {
    const data = await adminBffRequest<{ readonly integrity: AdminAuditIntegrity }>(
      '/api/admin/audit/integrity',
    )
    return data.integrity
  },

  export(filters: AdminAuditFilters, format: 'csv' | 'jsonl'): Promise<Blob> {
    return adminBffDownload(`/api/admin/audit/export${queryString({ ...filters, format })}`)
  },
}

function queryString(filters: AdminAuditFilters & { readonly format?: string }): string {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }

  const query = params.toString()
  return query ? `?${query}` : ''
}
