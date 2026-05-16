import { reactive, ref } from 'vue'
import { presentSafeError, supportReferenceCopy } from '@/lib/api/safe-error-presenter'
import { adminAuditApi, type AdminAuditListResponse } from '@/services/admin-audit.api'
import type { AdminAuditEvent, AdminAuditFilters, AdminAuditIntegrity } from '@/types/admin.types'

export function useAdminAuditTrail() {
  const events = ref<readonly AdminAuditEvent[]>([])
  const integrity = ref<AdminAuditIntegrity | null>(null)
  const pagination = ref<AdminAuditListResponse['pagination'] | null>(null)
  const loading = ref(false)
  const exporting = ref(false)
  const error = ref<string | null>(null)
  const success = ref<string | null>(null)
  const supportReference = ref<string | null>(null)
  const filters = reactive({
    limit: 25,
    action: '',
    outcome: '',
    taxonomy: '',
    admin_subject_id: '',
    from: '',
    to: '',
    cursor: undefined as string | undefined,
  })

  async function load(): Promise<void> {
    loading.value = true
    clearNotice()
    try {
      const data = await adminAuditApi.list(filters)
      events.value = data.events
      pagination.value = data.pagination
    } catch (caught) {
      setError(caught, 'Audit trail tidak dapat dimuat.')
    } finally {
      loading.value = false
    }
  }

  async function checkIntegrity(): Promise<void> {
    loading.value = true
    clearNotice()
    try {
      integrity.value = await adminAuditApi.integrity()
    } catch (caught) {
      setError(caught, 'Status integritas audit tidak dapat dimuat.')
    } finally {
      loading.value = false
    }
  }

  async function exportTrail(format: 'csv' | 'jsonl'): Promise<void> {
    exporting.value = true
    clearNotice()
    try {
      const blob = await adminAuditApi.export(filters, format)
      downloadBlob(blob, `admin-audit-events.${format}`)
      success.value = `Export ${format.toUpperCase()} berhasil disiapkan.`
    } catch (caught) {
      setError(caught, 'Export audit tidak dapat diproses.')
    } finally {
      exporting.value = false
    }
  }

  async function nextPage(): Promise<void> {
    filters.cursor = pagination.value?.next_cursor ?? undefined
    await load()
  }

  async function previousPage(): Promise<void> {
    filters.cursor = pagination.value?.previous_cursor ?? undefined
    await load()
  }

  return {
    events,
    integrity,
    pagination,
    filters,
    loading,
    exporting,
    error,
    success,
    supportReference,
    load,
    checkIntegrity,
    exportTrail,
    nextPage,
    previousPage,
  }

  function clearNotice(): void {
    error.value = null
    success.value = null
    supportReference.value = null
  }

  function setError(caught: unknown, fallback: string): void {
    const safe = presentSafeError(caught, fallback)
    error.value = safe.message
    supportReference.value = supportReferenceCopy(safe.supportReference)
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  if (typeof document === 'undefined') return
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(href)
}
