/**
 * MFA Challenge Store — FR-019 / UC-67 / BE-FR019-001.
 *
 * Menyimpan state challenge MFA selama proses login.
 * Challenge disimpan sementara antara halaman login dan halaman MFA challenge.
 *
 * BE-FR019-001: pending OIDC authorization context tidak lagi disimpan di
 * client. Backend mengikat konteks ke challenge_id server-side dan akan
 * mengembalikan `continuation.redirect_uri` saat MFA berhasil. Frontend
 * cukup memegang opaque challenge handle.
 *
 * 1 store = 1 domain state (MFA challenge lifecycle).
 */

import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { SsoLoginMfaRequired } from '@/types/auth.types'

export type MfaChallengeState = SsoLoginMfaRequired['challenge']

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
