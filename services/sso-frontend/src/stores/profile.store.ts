/**
 * useProfileStore — self-service profile state.
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { profileApi } from '@/services/profile.api'
import { handleSessionExpiry } from '@/composables/handleSessionExpiry'
import type {
  ConnectedApp,
  ProfilePortal,
  ProfileUpdatePayload,
  RevokeAllSessionsResponse,
  UserSessionSummary,
} from '@/types/profile.types'

export const useProfileStore = defineStore('sso-profile', () => {
  const profile = ref<ProfilePortal | null>(null)
  const connectedApps = ref<readonly ConnectedApp[]>([])
  const sessions = ref<readonly UserSessionSummary[]>([])

  const scope = computed(() => profile.value?.authorization.scope ?? '')
  const roles = computed<readonly string[]>(() => profile.value?.authorization.roles ?? [])

  async function loadProfile(): Promise<void> {
    try {
      profile.value = await profileApi.getProfile()
    } catch (error: unknown) {
      if (handleSessionExpiry(error)) return
      throw error
    }
  }

  async function updateProfile(payload: ProfileUpdatePayload): Promise<void> {
    try {
      profile.value = await profileApi.updateProfile(payload)
    } catch (error: unknown) {
      if (handleSessionExpiry(error)) return
      throw error
    }
  }

  async function loadConnectedApps(): Promise<void> {
    try {
      connectedApps.value = await profileApi.getConnectedApps()
    } catch (error: unknown) {
      if (handleSessionExpiry(error)) return
      throw error
    }
  }

  async function revokeConnectedApp(clientId: string): Promise<void> {
    try {
      await profileApi.revokeConnectedApp(clientId)
      await loadConnectedApps()
    } catch (error: unknown) {
      if (handleSessionExpiry(error)) return
      throw error
    }
  }

  async function loadSessions(): Promise<void> {
    try {
      sessions.value = await profileApi.getSessions()
    } catch (error: unknown) {
      if (handleSessionExpiry(error)) return
      throw error
    }
  }

  async function revokeSession(sessionId: string): Promise<void> {
    try {
      await profileApi.revokeSession(sessionId)
      await loadSessions()
    } catch (error: unknown) {
      if (handleSessionExpiry(error)) return
      throw error
    }
  }

  async function revokeAllSessions(): Promise<RevokeAllSessionsResponse> {
    try {
      const response = await profileApi.revokeAllSessions()
      sessions.value = []
      return response
    } catch (error: unknown) {
      if (handleSessionExpiry(error)) {
        return { revoked: true, revoked_sessions: 0, revoked_refresh_tokens: 0 }
      }
      throw error
    }
  }

  function clear(): void {
    profile.value = null
    connectedApps.value = []
    sessions.value = []
  }

  return {
    profile,
    connectedApps,
    sessions,
    scope,
    roles,
    loadProfile,
    updateProfile,
    loadConnectedApps,
    revokeConnectedApp,
    loadSessions,
    revokeSession,
    revokeAllSessions,
    clear,
  }
})
