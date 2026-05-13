/**
 * MFA Challenge Store — FR-019 / UC-67.
 *
 * Menyimpan state challenge MFA selama proses login.
 * Challenge disimpan sementara antara halaman login dan halaman MFA challenge.
 *
 * 1 store = 1 domain state (MFA challenge lifecycle).
 */

import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { SsoLoginMfaRequired } from '@/types/auth.types'

export type MfaChallengeState = SsoLoginMfaRequired['challenge'] & {
  /** OIDC context jika login via /connect/local-login */
  readonly oidc_context?: {
    readonly client_id: string
    readonly redirect_uri: string
    readonly code_challenge: string
    readonly state: string
    readonly nonce: string
    readonly scope: string
  } | null
}

export const useMfaChallengeStore = defineStore('mfa-challenge', () => {
  const challenge = ref<MfaChallengeState | null>(null)

  function setChallenge(data: MfaChallengeState): void {
    challenge.value = data
  }

  function clear(): void {
    challenge.value = null
  }

  /** Check apakah challenge masih valid (belum expired). */
  function isExpired(): boolean {
    if (!challenge.value) return true
    return new Date(challenge.value.expires_at).getTime() < Date.now()
  }

  return {
    challenge,
    setChallenge,
    clear,
    isExpired,
  }
})
