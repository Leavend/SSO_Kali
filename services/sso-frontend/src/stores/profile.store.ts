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

type ProfileLoadStatus = 'loading' | 'success' | 'error'

export const useProfileStore = defineStore('sso-profile', () => {
  const profile = ref<ProfilePortal | null>(null)
  const connectedApps = ref<readonly ConnectedApp[]>([])
  const sessions = ref<readonly UserSessionSummary[]>([])
  const connectedAppsStatus = ref<ProfileLoadStatus>('loading')
  const sessionsStatus = ref<ProfileLoadStatus>('loading')

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
    connectedAppsStatus.value = 'loading'
    try {
      connectedApps.value = await profileApi.getConnectedApps()
      connectedAppsStatus.value = 'success'
    } catch (error: unknown) {
      if (handleSessionExpiry(error)) return
      connectedAppsStatus.value = 'error'
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
    sessionsStatus.value = 'loading'
    try {
      sessions.value = await profileApi.getSessions()
      sessionsStatus.value = 'success'
    } catch (error: unknown) {
      if (handleSessionExpiry(error)) return
      sessionsStatus.value = 'error'
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
        return {
          revoked: true,
          revoked_sessions: 0,
          revoked_refresh_tokens: 0,
        }
      }
      throw error
    }
  }

  function clear(): void {
    profile.value = null
    connectedApps.value = []
    sessions.value = []
    connectedAppsStatus.value = 'loading'
    sessionsStatus.value = 'loading'
  }

  return {
    profile,
    connectedApps,
    sessions,
    connectedAppsStatus,
    sessionsStatus,
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
