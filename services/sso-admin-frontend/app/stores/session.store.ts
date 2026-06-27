import { computed, ref } from 'vue'
import { defineStore, skipHydrate } from 'pinia'
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
  // useState makes the SSR-resolved principal survive into the client payload;
  // skipHydrate stops Pinia from also serializing it (no double-hydration).
  // Only safe masked DTO/principal fields ever live here — never a token,
  // client secret, or raw NIK/NIP/NISN (those stay in Nitro event.context).
  const user = skipHydrate(useState<SsoUser | null>('admin-session:user', () => null))
  const principal = skipHydrate(
    useState<AdminPrincipal | null>('admin-session:principal', () => null),
  )
  const status = ref<SessionStatus>('idle')
  const lastEnsureResult = ref<SessionEnsureResult | null>(null)
  let bootstrapPromise: Promise<SessionEnsureResult> | null = null

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
    lastEnsureResult.value = null
  }

  async function ensureSession(force = false): Promise<SessionEnsureResult> {
    if (!force && principal.value !== null) return rememberEnsureResult('authenticated')

    status.value = 'loading'
    try {
      const response = await authApi.getPrincipal()
      setPrincipal(response.principal)
      lastEnsureResult.value = 'authenticated'
      return 'authenticated'
    } catch (error) {
      clear()

      if (error instanceof ApiError) {
        if (error.code === 'mfa_enrollment_required')
          return rememberEnsureResult('mfa_enrollment_required')
        if (error.code === 'invalid_upstream_response')
          return rememberEnsureResult('api_unreachable')
        if (requiresStepUp(error)) return rememberEnsureResult('step_up_required')
        if (error.status === 401) return rememberEnsureResult('unauthenticated')
        if (error.status === 403) return rememberEnsureResult('forbidden')
      }

      return rememberEnsureResult('error')
    }
  }

  function rememberEnsureResult(result: SessionEnsureResult): SessionEnsureResult {
    lastEnsureResult.value = result
    return result
  }

  function startSessionBootstrap(force = false): Promise<SessionEnsureResult> {
    if (!force && principal.value !== null) {
      lastEnsureResult.value = 'authenticated'
      return Promise.resolve('authenticated')
    }

    if (!force && bootstrapPromise) return bootstrapPromise

    bootstrapPromise = ensureSession(force).finally(() => {
      bootstrapPromise = null
    })

    return bootstrapPromise
  }

  async function ensurePrincipal(force = false): Promise<SessionEnsureResult> {
    return ensureSession(force)
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
    lastEnsureResult,
    isAuthenticated,
    roles,
    permissions,
    setUser,
    setPrincipal,
    clear,
    ensureSession,
    ensurePrincipal,
    startSessionBootstrap,
    hasPermission,
    hasEveryPermission,
  }
})
