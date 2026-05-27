import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { policyApi } from '../services/policy.api'
import type { AdminPermission, AdminRole, SecurityPolicy } from '../types'

export type PolicyStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'unauthenticated'
  | 'forbidden'
  | 'error'
export type PolicyActionStatus = 'idle' | 'loading' | 'success' | 'step_up_required' | 'error'

const DEFAULT_CATEGORY = 'password'

export const usePolicyStore = defineStore('admin-policy', () => {
  const status = ref<PolicyStatus>('idle')
  const actionStatus = ref<PolicyActionStatus>('idle')
  const selectedCategory = ref(DEFAULT_CATEGORY)
  const policies = ref<readonly SecurityPolicy[]>([])
  const activePolicy = ref<Readonly<Record<string, unknown>> | null>(null)
  const roles = ref<readonly AdminRole[]>([])
  const permissions = ref<readonly AdminPermission[]>([])
  const errorMessage = ref<string | null>(null)
  const requestId = ref<string | null>(null)

  const activeVersion = computed(
    () => policies.value.find((policy) => policy.status === 'active') ?? null,
  )

  async function load(): Promise<void> {
    status.value = 'loading'
    errorMessage.value = null

    try {
      const [policyResponse, roleResponse, permissionResponse] = await Promise.all([
        policyApi.listPolicies(selectedCategory.value),
        policyApi.listRoles(),
        policyApi.listPermissions(),
      ])
      policies.value = policyResponse.policies
      activePolicy.value = policyResponse.active
      roles.value = roleResponse.roles
      permissions.value = permissionResponse.permissions
      requestId.value = getLastRequestId()
      status.value = 'success'
    } catch (error) {
      policies.value = []
      activePolicy.value = null
      roles.value = []
      permissions.value = []
      handleLoadError(error)
    }
  }

  async function selectCategory(category: string): Promise<void> {
    selectedCategory.value = category
    await load()
  }

  async function proposePolicy(
    payload: Readonly<Record<string, unknown>>,
    reason: string,
  ): Promise<void> {
    actionStatus.value = 'loading'
    errorMessage.value = null

    try {
      const response = await policyApi.proposePolicy(selectedCategory.value, { payload, reason })
      upsertPolicy(response.policy)
      requestId.value = getLastRequestId()
      actionStatus.value = 'success'
    } catch (error) {
      handleActionError(error)
    }
  }

  async function activatePolicy(version: number, reason: string): Promise<void> {
    await transitionPolicy(version, 'activate', reason)
  }

  async function rollbackPolicy(version: number, reason: string): Promise<void> {
    await transitionPolicy(version, 'rollback', reason)
  }

  async function transitionPolicy(
    version: number,
    action: 'activate' | 'rollback',
    reason: string,
  ): Promise<void> {
    actionStatus.value = 'loading'
    errorMessage.value = null

    try {
      const response =
        action === 'activate'
          ? await policyApi.activatePolicy(selectedCategory.value, version, { reason })
          : await policyApi.rollbackPolicy(selectedCategory.value, version, { reason })
      upsertPolicy(response.policy)
      requestId.value = getLastRequestId()
      actionStatus.value = 'success'
    } catch (error) {
      handleActionError(error)
    }
  }

  async function syncRolePermissions(
    roleSlug: string,
    permissionSlugs: readonly string[],
  ): Promise<void> {
    actionStatus.value = 'loading'
    errorMessage.value = null

    try {
      const response = await policyApi.syncRolePermissions(roleSlug, permissionSlugs)
      upsertRole(response.role)
      requestId.value = getLastRequestId()
      actionStatus.value = 'success'
    } catch (error) {
      handleActionError(error)
    }
  }

  function upsertPolicy(nextPolicy: SecurityPolicy): void {
    policies.value = policies.value.some((policy) => policy.id === nextPolicy.id)
      ? policies.value.map((policy) => (policy.id === nextPolicy.id ? nextPolicy : policy))
      : [nextPolicy, ...policies.value]
  }

  function upsertRole(nextRole: AdminRole): void {
    roles.value = roles.value.some((role) => role.slug === nextRole.slug)
      ? roles.value.map((role) => (role.slug === nextRole.slug ? nextRole : role))
      : [nextRole, ...roles.value]
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
        errorMessage.value = 'Kamu tidak memiliki izin untuk melihat policy/RBAC admin.'
        return
      }
    } else {
      requestId.value = getLastRequestId()
    }

    status.value = 'error'
    errorMessage.value = requestId.value
      ? `Policy/RBAC admin belum bisa dimuat. Coba lagi atau gunakan request ID ${requestId.value} untuk investigasi.`
      : 'Policy/RBAC admin belum bisa dimuat. Coba lagi beberapa saat lagi.'
  }

  function handleActionError(error: unknown): void {
    requestId.value =
      error instanceof ApiError ? (error.requestId ?? getLastRequestId()) : getLastRequestId()

    if (error instanceof ApiError && (error.status === 428 || error.status === 412)) {
      actionStatus.value = 'step_up_required'
      errorMessage.value =
        'Aksi policy/RBAC membutuhkan fresh-auth atau MFA assurance. Ulangi login admin lalu coba lagi.'
      return
    }

    actionStatus.value = 'error'
    errorMessage.value = requestId.value
      ? `Operasi policy/RBAC gagal. Gunakan request ID ${requestId.value} untuk investigasi.`
      : 'Operasi policy/RBAC gagal. Coba lagi beberapa saat lagi.'
  }

  return {
    status,
    actionStatus,
    selectedCategory,
    policies,
    activePolicy,
    activeVersion,
    roles,
    permissions,
    errorMessage,
    requestId,
    load,
    selectCategory,
    proposePolicy,
    activatePolicy,
    rollbackPolicy,
    syncRolePermissions,
  }
})
