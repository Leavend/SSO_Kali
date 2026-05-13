/**
 * useSessionStore — auth session state (user, authentication flag).
 *
 * Delegasi HTTP ke authApi. Tidak memanipulasi DOM / navigasi.
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { authApi } from '@/services/auth.api'
import type { SsoLoginPayload, SsoLoginResponse, SsoUser } from '@/types/auth.types'

export type SessionStatus = 'idle' | 'loading' | 'ready' | 'error'

export const useSessionStore = defineStore('sso-session', () => {
  const user = ref<SsoUser | null>(null)
  const status = ref<SessionStatus>('idle')

  const isAuthenticated = computed<boolean>(() => user.value !== null)
  const displayName = computed<string>(() => user.value?.display_name ?? '')
  const roles = computed<readonly string[]>(() => user.value?.roles ?? [])

  function clear(): void {
    user.value = null
  }

  async function ensureSession(): Promise<boolean> {
    status.value = 'loading'
    try {
      const response = await authApi.getSession()
      if (response.authenticated) {
        user.value = response.user
        status.value = 'ready'
        return true
      }
      clear()
      status.value = 'idle'
      return false
    } catch {
      clear()
      status.value = 'idle'
      return false
    }
  }

  async function login(payload: SsoLoginPayload): Promise<SsoLoginResponse> {
    const response = await authApi.login(payload)
    if (response.authenticated) {
      user.value = response.user
      status.value = 'ready'
    }
    return response
  }

  async function logout(): Promise<void> {
    try {
      await authApi.logout()
    } catch {
      // Tetap clear state meski backend gagal — UX konsisten "logged out".
    }
    clear()
    status.value = 'idle'
  }

  return {
    user,
    status,
    isAuthenticated,
    displayName,
    roles,
    ensureSession,
    login,
    logout,
    clear,
  }
})
