import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { AdminDashboardPayload, AdminSessionView, ApiClient, ApiSession, ApiUser } from '@shared/admin'

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

export const useAdminStore = defineStore('admin', () => {
  const principal = ref<AdminSessionView | null>(null)
  const users = ref<ApiUser[]>([])
  const sessions = ref<ApiSession[]>([])
  const clients = ref<ApiClient[]>([])
  const status = ref<LoadState>('idle')
  const errorMessage = ref<string | null>(null)
  const redirectTo = ref<string | null>(null)

  const isAuthenticated = computed(() => principal.value !== null)
  const canManageSessions = computed(() => Boolean(principal.value?.permissions.manage_sessions))
  const activeUsers = computed(() => new Set(sessions.value.map((session) => session.subject_id)).size)
  const mfaUsers = computed(() => users.value.filter((user) => user.login_context?.mfa_required).length)

  async function bootstrap(): Promise<void> {
    if (principal.value || status.value === 'loading') return
    await ensureSession()
  }

  async function ensureSession(): Promise<boolean> {
    status.value = 'loading'
    errorMessage.value = null
    redirectTo.value = null

    try {
      const response = await fetchJson<{ principal: AdminSessionView }>('/api/session')
      principal.value = response.principal
      status.value = 'ready'
      return true
    } catch (error) {
      principal.value = null
      status.value = 'idle'
      redirectTo.value = redirectFromError(error)
      return false
    }
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
      status.value = 'error'
      errorMessage.value = errorMessageFrom(error)
      redirectTo.value = redirectFromError(error)
      if (redirectTo.value) window.location.assign(redirectTo.value)
    }
  }

  async function loadUsers(): Promise<void> {
    const payload = await fetchJson<{ users: ApiUser[] }>('/api/admin/users')
    users.value = payload.users
  }

  async function loadSessions(): Promise<void> {
    const payload = await fetchJson<{ sessions: ApiSession[] }>('/api/admin/sessions')
    sessions.value = payload.sessions
  }

  async function loadClients(): Promise<void> {
    const payload = await fetchJson<{ clients: ApiClient[] }>('/api/admin/clients')
    clients.value = payload.clients
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
    try {
      const payload = await fetchJson<{ expiresAt: number }>('/auth/refresh', { method: 'POST' })
      if (principal.value) principal.value = { ...principal.value, expiresAt: payload.expiresAt }
    } catch {
      principal.value = null
      window.location.assign('/session-expired')
    }
  }

  async function refreshWhenNeeded(): Promise<void> {
    if (!principal.value) return

    const secondsLeft = principal.value.expiresAt - Math.floor(Date.now() / 1000)
    if (secondsLeft <= 180) await refreshSession()
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

function redirectFromError(error: unknown): string | null {
  const apiError = error as ApiError
  if (apiError.redirectTo) return apiError.redirectTo
  if (apiError.status === 401) return '/'
  return null
}

function errorMessageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed.'
}
