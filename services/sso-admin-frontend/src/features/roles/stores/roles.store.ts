import { ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { rolesApi } from '../services/roles.api'
import type {
  AdminPermission,
  AdminRole,
  CreateRolePayload,
  UpdateRolePayload,
} from '../types'

export type RolesStatus = 'idle' | 'loading' | 'success' | 'unauthenticated' | 'forbidden' | 'error'
export type RolesActionStatus = 'idle' | 'loading' | 'success' | 'error'

export const useRolesStore = defineStore('admin-roles', () => {
  const status = ref<RolesStatus>('idle')
  const actionStatus = ref<RolesActionStatus>('idle')
  const roles = ref<readonly AdminRole[]>([])
  const permissions = ref<readonly AdminPermission[]>([])
  const errorMessage = ref<string | null>(null)
  const actionError = ref<string | null>(null)
  const requestId = ref<string | null>(null)

  async function load(): Promise<void> {
    status.value = 'loading'
    errorMessage.value = null

    try {
      const [rolesResponse, permissionsResponse] = await Promise.all([
        rolesApi.listRoles(),
        rolesApi.listPermissions(),
      ])
      roles.value = rolesResponse.roles.map((r: any) => ({
        ...r,
        label: r.label || r.name || r.slug || '',
        permissions: (r.permissions || []).map((p: any) =>
          p && typeof p === 'object' && 'slug' in p ? p.slug : p
        ),
      }))
      permissions.value = permissionsResponse.permissions
      requestId.value = getLastRequestId()
      status.value = 'success'
    } catch (error) {
      roles.value = []
      permissions.value = []
      handleLoadError(error)
    }
  }

  async function createRole(payload: CreateRolePayload): Promise<void> {
    actionStatus.value = 'loading'
    actionError.value = null
    try {
      await rolesApi.createRole(payload)
      actionStatus.value = 'success'
      await load()
    } catch (error) {
      handleActionError(error)
    }
  }

  async function updateRole(slug: string, payload: UpdateRolePayload): Promise<void> {
    actionStatus.value = 'loading'
    actionError.value = null
    try {
      await rolesApi.updateRole(slug, payload)
      actionStatus.value = 'success'
      await load()
    } catch (error) {
      handleActionError(error)
    }
  }

  async function deleteRole(slug: string): Promise<void> {
    actionStatus.value = 'loading'
    actionError.value = null
    try {
      await rolesApi.deleteRole(slug)
      actionStatus.value = 'success'
      await load()
    } catch (error) {
      handleActionError(error)
    }
  }

  async function syncRolePermissions(slug: string, permissionSlugs: string[]): Promise<void> {
    actionStatus.value = 'loading'
    actionError.value = null
    try {
      await rolesApi.syncRolePermissions(slug, permissionSlugs)
      actionStatus.value = 'success'
      await load()
    } catch (error) {
      handleActionError(error)
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

  function handleActionError(error: unknown): void {
    actionStatus.value = 'error'
    if (error instanceof ApiError) {
      actionError.value = error.message
    } else {
      actionError.value = 'Aksi gagal dilakukan. Coba beberapa saat lagi.'
    }
  }

  return {
    status,
    actionStatus,
    roles,
    permissions,
    errorMessage,
    actionError,
    requestId,
    load,
    createRole,
    updateRole,
    deleteRole,
    syncRolePermissions,
  }
})
