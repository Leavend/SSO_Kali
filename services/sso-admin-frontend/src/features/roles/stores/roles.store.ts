import { ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { rolesApi } from '../services/roles.api'
import type { AdminPermission, AdminRole } from '../types'

export type RolesStatus = 'idle' | 'loading' | 'success' | 'unauthenticated' | 'forbidden' | 'error'

export const useRolesStore = defineStore('admin-roles', () => {
  const status = ref<RolesStatus>('idle')
  const roles = ref<readonly AdminRole[]>([])
  const permissions = ref<readonly AdminPermission[]>([])
  const errorMessage = ref<string | null>(null)
  const requestId = ref<string | null>(null)

  async function load(): Promise<void> {
    status.value = 'loading'
    errorMessage.value = null

    try {
      const [rolesResponse, permissionsResponse] = await Promise.all([
        rolesApi.listRoles(),
        rolesApi.listPermissions(),
      ])
      roles.value = rolesResponse.roles
      permissions.value = permissionsResponse.permissions
      requestId.value = getLastRequestId()
      status.value = 'success'
    } catch (error) {
      roles.value = []
      permissions.value = []
      handleLoadError(error)
    }
  }

  function handleLoadError(error: unknown): void {
    if (error instanceof ApiError) {
      requestId.value = error.requestId ?? getLastRequestId()

      if (error.status === 401) {
        status.value = 'unauthenticated'
        errorMessage.value = 'Sesi admin berakhir. Login ulang untuk melanjutkan.'
        return
      }

      if (error.status === 403) {
        status.value = 'forbidden'
        errorMessage.value = 'Kamu tidak memiliki izin untuk melihat roles & permissions.'
        return
      }
    } else {
      requestId.value = getLastRequestId()
    }

    status.value = 'error'
    errorMessage.value = requestId.value
      ? `Roles & Permissions belum bisa dimuat. Gunakan request ID ${requestId.value} untuk investigasi.`
      : 'Roles & Permissions belum bisa dimuat. Coba lagi beberapa saat lagi.'
  }

  return {
    status,
    roles,
    permissions,
    errorMessage,
    requestId,
    load,
  }
})
