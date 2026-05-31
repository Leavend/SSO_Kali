import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError } from '@/lib/api/api-client'
import { authApi } from '@/services/auth.api'
import type { AdminPrincipal, SsoUser } from '@/types/auth.types'

export type SessionStatus = 'idle' | 'loading' | 'ready'
export type SessionEnsureResult =
  | 'authenticated'
  | 'unauthenticated'
  | 'forbidden'
  | 'mfa_enrollment_required'
  | 'step_up_required'
  | 'api_unreachable'
  | 'error'

export const useSessionStore = defineStore('admin-session', () => {
  const user = ref<SsoUser | null>(null)
  const principal = ref<AdminPrincipal | null>(null)
  const status = ref<SessionStatus>('idle')

  const isAuthenticated = computed<boolean>(() => user.value !== null)
  const roles = computed<readonly string[]>(() => user.value?.roles ?? [])
  const permissions = computed<Readonly<Record<string, boolean>>>(
    () => principal.value?.permissions.capabilities ?? {},
  )

  function setUser(nextUser: SsoUser): void {
    user.value = nextUser
    status.value = 'ready'
  }

  function setPrincipal(nextPrincipal: AdminPrincipal): void {
    principal.value = nextPrincipal
    user.value = userFromPrincipal(nextPrincipal)
    status.value = 'ready'
  }

  function clear(): void {
    user.value = null
    principal.value = null
    status.value = 'idle'
  }

  async function ensureSession(): Promise<SessionEnsureResult> {
    if (principal.value !== null) return 'authenticated'

    status.value = 'loading'
    try {
      const response = await authApi.getPrincipal()
      setPrincipal(response.principal)
      return 'authenticated'
    } catch (error) {
      clear()

      if (error instanceof ApiError) {
        if (error.code === 'mfa_enrollment_required') return 'mfa_enrollment_required'
        if (error.code === 'invalid_upstream_response') return 'api_unreachable'
        if (requiresStepUp(error)) return 'step_up_required'
        if (error.status === 401) return 'unauthenticated'
        if (error.status === 403) return 'forbidden'
      }

      return 'error'
    }
  }

  async function ensurePrincipal(): Promise<SessionEnsureResult> {
    return ensureSession()
  }

  function hasPermission(permission: string): boolean {
    return permissions.value[permission] === true
  }

  function userFromPrincipal(nextPrincipal: AdminPrincipal): SsoUser {
    return {
      id: 0,
      subject_id: nextPrincipal.subject_id,
      email: nextPrincipal.email,
      display_name: nextPrincipal.display_name,
      roles: [nextPrincipal.role],
    }
  }

  function hasEveryPermission(requiredPermissions: readonly string[]): boolean {
    return requiredPermissions.every((permission) => hasPermission(permission))
  }

  function requiresStepUp(error: ApiError): boolean {
    if (error.code === 'step_up_required') return true
    if (error.code === 'reauth_required') return true
    if (error.code === 'mfa_required') return true
    return error.status === 412 || error.status === 428
  }

  return {
    user,
    principal,
    status,
    isAuthenticated,
    roles,
    permissions,
    setUser,
    setPrincipal,
    clear,
    ensureSession,
    ensurePrincipal,
    hasPermission,
    hasEveryPermission,
  }
})
