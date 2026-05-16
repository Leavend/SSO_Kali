import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { presentSafeError } from '@/lib/api/safe-error-presenter'
import { adminPrincipalApi } from '@/services/admin-principal.api'
import type { AdminPrincipal } from '@/types/admin.types'

export const useAdminConsoleStore = defineStore('admin-console', () => {
  const principal = ref<AdminPrincipal | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const permissions = computed<readonly string[]>(
    () => principal.value?.permissions.permissions ?? [],
  )
  const capabilities = computed<Readonly<Record<string, boolean>>>(
    () => principal.value?.permissions.capabilities ?? {},
  )

  async function load(): Promise<void> {
    if (principal.value || loading.value) return
    loading.value = true
    error.value = null
    try {
      principal.value = await adminPrincipalApi.me()
    } catch (caught) {
      principal.value = null
      error.value = presentSafeError(caught, 'Konteks admin tidak dapat dimuat.').message
    } finally {
      loading.value = false
    }
  }

  function can(permission: string): boolean {
    return capabilities.value[permission] === true || permissions.value.includes(permission)
  }

  return { principal, loading, error, permissions, capabilities, load, can }
})
