import { computed, ref } from 'vue'
import { supportReferenceCopy, presentSafeError } from '@/lib/api/safe-error-presenter'
import { adminDashboardApi } from '@/services/admin-dashboard.api'
import type { AdminDashboardSummary } from '@/types/admin.types'

export function useAdminDashboard() {
  const summary = ref<AdminDashboardSummary | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const supportReference = ref<string | null>(null)

  const cards = computed(() => {
    const counters = summary.value?.counters
    return counters
      ? [
          {
            label: 'Pengguna',
            value: counters.users.total,
            detail: `${counters.users.active} aktif · ${counters.users.locked} terkunci`,
          },
          {
            label: 'Sesi',
            value: counters.sessions.portal_active,
            detail: `${counters.sessions.rp_active} sesi RP aktif`,
          },
          {
            label: 'Client',
            value: counters.clients.total,
            detail: `${counters.clients.active} aktif · ${counters.clients.staged} staged`,
          },
          {
            label: 'Audit 24j',
            value: counters.audit.admin_last_24h,
            detail: `${counters.audit.auth_last_24h} event auth`,
          },
          {
            label: 'Insiden',
            value: counters.incidents.admin_denied_last_24h,
            detail: 'Denied admin API 24 jam',
          },
          {
            label: 'DSR',
            value: counters.data_subject_requests.submitted,
            detail: `${counters.data_subject_requests.fulfilled} fulfilled`,
          },
        ]
      : []
  })

  async function load(): Promise<void> {
    loading.value = true
    error.value = null
    supportReference.value = null
    try {
      summary.value = await adminDashboardApi.summary()
    } catch (caught) {
      const safe = presentSafeError(caught, 'Ringkasan admin tidak dapat dimuat.')
      error.value = safe.message
      supportReference.value = supportReferenceCopy(safe.supportReference)
    } finally {
      loading.value = false
    }
  }

  return { summary, cards, loading, error, supportReference, load }
}
