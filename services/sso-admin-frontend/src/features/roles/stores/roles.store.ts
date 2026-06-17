import { ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import {
  isAdminProxyTransportFailure,
  formatTransportErrorMessage,
} from '@/lib/display-identifiers'
import { triggerStepUpReauth } from '@/lib/stepup/stepup'
import { rolesApi } from '../services/roles.api'
import type {
  AdminPermission,
  AdminPermissionApi,
  AdminRole,
  AdminRoleApi,
  CreateRolePayload,
  UpdateRolePayload,
} from '../types'

export type RolesStatus = 'idle' | 'loading' | 'success' | 'unauthenticated' | 'forbidden' | 'error'
export type RolesActionStatus = 'idle' | 'loading' | 'success' | 'step_up_required' | 'error'

const supportedRoleOrder = new Map<string, number>([
  ['admin', 0],
  ['user', 1],
])

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
      roles.value = rolesResponse.roles
        .map(normalizeRole)
        .filter((role) => supportedRoleOrder.has(role.slug.toLowerCase()))
        .sort((first, second) => roleSortRank(first) - roleSortRank(second))
      permissions.value = permissionsResponse.permissions.map(normalizePermission)
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
    if (isAdminProxyTransportFailure(error)) {
      errorMessage.value =
        formatTransportErrorMessage(requestId.value) ?? 'Roles & Permissions belum bisa dimuat.'
    } else {
      errorMessage.value = requestId.value
        ? `Roles & Permissions belum bisa dimuat. Gunakan request ID ${requestId.value} untuk investigasi.`
        : 'Roles & Permissions belum bisa dimuat. Coba lagi beberapa saat lagi.'
    }
  }

  function handleActionError(error: unknown): void {
    if (
      error instanceof ApiError &&
      (error.code === 'reauth_required' ||
        error.code === 'step_up_required' ||
        error.status === 428 ||
        error.status === 412)
    ) {
      actionStatus.value = 'step_up_required'
      actionError.value =
        'Aksi roles membutuhkan fresh-auth atau MFA assurance. Ulangi login admin lalu coba lagi.'
      triggerStepUpReauth()
      return
    }

    actionStatus.value = 'error'
    if (error instanceof ApiError) {
      actionError.value = error.message
    } else {
      actionError.value = 'Aksi gagal dilakukan. Coba beberapa saat lagi.'
    }
  }

  function normalizeRole(role: AdminRoleApi): AdminRole {
    return {
      ...role,
      label: role.label || role.name || role.slug || '',
      user_count: role.user_count ?? role.users_count ?? null,
      permissions: (role.permissions || [])
        .map((permission) =>
          typeof permission === 'string' ? permission : (permission.key ?? permission.slug ?? ''),
        )
        .filter(
          (permission: unknown): permission is string =>
            typeof permission === 'string' && permission.length > 0,
        ),
    }
  }

  function roleSortRank(role: AdminRole): number {
    return supportedRoleOrder.get(role.slug.toLowerCase()) ?? Number.MAX_SAFE_INTEGER
  }

  function normalizePermission(permission: AdminPermissionApi): AdminPermission {
    const key = permission.key ?? permission.slug ?? ''

    return {
      key,
      label: permission.label ?? permission.name ?? key,
      group: permission.group ?? permission.category ?? 'General',
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
