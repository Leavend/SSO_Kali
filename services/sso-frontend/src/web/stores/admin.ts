import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { AdminDashboardPayload, AdminSessionView, ApiClient, ApiSession, ApiUser } from '@shared/admin'

type LoadState = 'idle' | 'loading' | 'ready' | 'error'
type AdminAuthMessage = {
  readonly type: 'expired' | 'refreshed'
  readonly expiresAt?: number
}

const adminAuthChannelName = 'devsso-admin-auth-session'

export const useAdminStore = defineStore('admin', () => {
  const principal = ref<AdminSessionView | null>(null)
  const users = ref<ApiUser[]>([])
  const sessions = ref<ApiSession[]>([])
  const clients = ref<ApiClient[]>([])
  const status = ref<LoadState>('idle')
  const errorMessage = ref<string | null>(null)
  const redirectTo = ref<string | null>(null)
  let refreshInFlight: Promise<void> | null = null
  let authChannel: BroadcastChannel | null = null

  const isAuthenticated = computed(() => principal.value !== null)
  const canManageSessions = computed(() => Boolean(principal.value?.permissions.manage_sessions))
  const activeUsers = computed(() => new Set(sessions.value.map((session) => session.subject_id)).size)
  const mfaUsers = computed(() => users.value.filter((user) => user.login_context?.mfa_required).length)

  function clearSessionState(): void {
    principal.value = null
    users.value = []
    sessions.value = []
    clients.value = []
  }

  async function bootstrap(): Promise<void> {
    startAuthSync()
    if (principal.value || status.value === 'loading') return
    await ensureSession()
  }

  async function ensureSession(): Promise<boolean> {
    status.value = 'loading'
    errorMessage.value = null
    redirectTo.value = null
    let failure: unknown = null

    try {
      await loadPrincipal()
      return true
    } catch (error) {
      failure = error
    }

    if (isGuestSessionFailure(failure)) {
      clearSessionState()
      status.value = 'idle'
      redirectTo.value = null
      return false
    }

    if (await trySilentRefresh()) return retryPrincipalLoad(failure)

    clearSessionState()
    status.value = 'idle'
    redirectTo.value = redirectFromError(failure)
    return false
  }

  async function loadDashboard(): Promise<void> {
    status.value = 'loading'
    errorMessage.value = null

    try {
      const payload = await fetchJson<AdminDashboardPayload>('/api/admin/dashboard')
      principal.value = payload.principal
      users.value = [...payload.users]
      sessions.value = [...payload.sessions]
      clients.value = [...payload.clients]
      status.value = 'ready'
    } catch (error) {
      if (redirectAfterAuthFailure(error)) return
      status.value = 'error'
      errorMessage.value = errorMessageFrom(error)
    }
  }

  async function loadUsers(): Promise<void> {
    try {
      const payload = await fetchJson<{ users: ApiUser[] }>('/api/admin/users')
      users.value = payload.users
    } catch (error) {
      if (!redirectAfterAuthFailure(error)) throw error
    }
  }

  async function loadSessions(): Promise<void> {
    try {
      const payload = await fetchJson<{ sessions: ApiSession[] }>('/api/admin/sessions')
      sessions.value = payload.sessions
    } catch (error) {
      if (!redirectAfterAuthFailure(error)) throw error
    }
  }

  async function loadClients(): Promise<void> {
    try {
      const payload = await fetchJson<{ clients: ApiClient[] }>('/api/admin/clients')
      clients.value = payload.clients
    } catch (error) {
      if (!redirectAfterAuthFailure(error)) throw error
    }
  }

  async function fetchUser(subjectId: string): Promise<{ readonly user: ApiUser; readonly sessions: ApiSession[] }> {
    return fetchJson(`/api/admin/users/${encodeURIComponent(subjectId)}`)
  }

  async function revokeSession(sessionId: string): Promise<void> {
    await fetchJson(`/api/admin/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
    await loadSessions()
  }

  async function revokeUserSessions(subjectId: string): Promise<void> {
    await fetchJson(`/api/admin/users/${encodeURIComponent(subjectId)}/sessions`, { method: 'DELETE' })
    await loadSessions()
  }

  async function refreshSession(): Promise<void> {
    refreshInFlight ??= refreshWithBrowserLock().finally(() => {
      refreshInFlight = null
    })

    return refreshInFlight
  }

  async function refreshWithBrowserLock(): Promise<void> {
    return browserLock('devsso-admin-refresh', () => refreshSessionRequest(true, true))
  }

  async function refreshSessionRequest(redirectOnFailure: boolean, notifyOnFailure: boolean): Promise<void> {
    try {
      const payload = await fetchJson<{ expiresAt: number }>('/auth/refresh', { method: 'POST' })
      if (principal.value) principal.value = { ...principal.value, expiresAt: payload.expiresAt }
      broadcastAuthMessage({ type: 'refreshed', expiresAt: payload.expiresAt })
    } catch {
      clearSessionState()
      if (notifyOnFailure) broadcastAuthMessage({ type: 'expired' })
      if (redirectOnFailure) window.location.assign('/session-expired')
      throw new Error('Admin session refresh failed.')
    }
  }

  async function refreshWhenNeeded(): Promise<void> {
    if (!principal.value) return

    const secondsLeft = principal.value.expiresAt - Math.floor(Date.now() / 1000)
    if (secondsLeft > 180) return

    try {
      await refreshSession()
    } catch {
      // Redirect is handled by refreshSessionRequest.
    }
  }

  async function loadPrincipal(): Promise<void> {
    const response = await fetchJson<{ principal: AdminSessionView }>('/api/session')
    principal.value = response.principal
    status.value = 'ready'
  }

  async function retryPrincipalLoad(fallback: unknown): Promise<boolean> {
    try {
      await loadPrincipal()
      return true
    } catch (error) {
      clearSessionState()
      status.value = 'idle'
      redirectTo.value = redirectFromError(error) ?? redirectFromError(fallback)
      return false
    }
  }

  async function trySilentRefresh(): Promise<boolean> {
    try {
      await browserLock('devsso-admin-refresh', () => refreshSessionRequest(false, false))
      return true
    } catch {
      return false
    }
  }

  function redirectAfterAuthFailure(error: unknown): boolean {
    const target = redirectFromError(error)
    if (!target) return false

    clearSessionState()
    status.value = 'idle'
    redirectTo.value = target
    window.location.assign(target)
    return true
  }

  function startAuthSync(): void {
    if (authChannel || typeof BroadcastChannel === 'undefined') return
    authChannel = new BroadcastChannel(adminAuthChannelName)
    authChannel.addEventListener('message', syncAuthState)
  }

  function syncAuthState(event: MessageEvent<AdminAuthMessage>): void {
    if (event.data.type === 'expired') {
      clearSessionState()
      window.location.assign('/session-expired')
    }

    if (event.data.type === 'refreshed' && event.data.expiresAt && principal.value) {
      principal.value = { ...principal.value, expiresAt: event.data.expiresAt }
    }
  }

  return {
    principal,
    users,
    sessions,
    clients,
    status,
    errorMessage,
    redirectTo,
    isAuthenticated,
    canManageSessions,
    activeUsers,
    mfaUsers,
    bootstrap,
    ensureSession,
    loadDashboard,
    loadUsers,
    loadSessions,
    loadClients,
    fetchUser,
    revokeSession,
    revokeUserSessions,
    refreshSession,
    refreshWhenNeeded,
  }
})

type ApiError = Error & {
  readonly status?: number
  readonly redirectTo?: string
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...init?.headers,
    },
  })

  const payload = await response.json().catch(() => ({})) as {
    readonly message?: string
    readonly error?: string
    readonly redirectTo?: string
  }

  if (!response.ok) {
    const error = new Error(payload.message ?? `Request failed with HTTP ${response.status}`) as ApiError
    Object.defineProperty(error, 'status', { value: response.status })
    Object.defineProperty(error, 'redirectTo', { value: payload.redirectTo })
    throw error
  }

  return payload as T
}

function isGuestSessionFailure(error: unknown): boolean {
  const apiError = error as ApiError
  return apiError.status === 401 && redirectFromError(apiError) === '/'
}

function redirectFromError(error: unknown): string | null {
  const apiError = error as ApiError
  if (apiError.redirectTo) return apiError.redirectTo
  if (apiError.status === 401) return '/'
  return null
}

function errorMessageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed.'
}

function broadcastAuthMessage(message: AdminAuthMessage): void {
  if (typeof BroadcastChannel === 'undefined') return
  const channel = new BroadcastChannel(adminAuthChannelName)
  channel.postMessage(message)
  channel.close()
}

type BrowserLockManager = {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>
}

async function browserLock<T>(name: string, callback: () => Promise<T>): Promise<T> {
  const locks = (navigator as Navigator & { readonly locks?: BrowserLockManager }).locks
  return locks ? locks.request(name, callback) : callback()
}
