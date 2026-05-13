/**
 * useMfaChallenge — placeholder composable UC-50 (Verify TOTP Challenge).
 *
 * Status: ON-HOLD. Implementasi akan dilakukan setelah backend
 * endpoint `/api/mfa/challenge/verify` ready.
 *
 * Composable ini akan mengemas:
 *   - Render challenge UI (TOTP input / recovery code input).
 *   - Submit verification code.
 *   - Handle retry + lockout.
 *   - Redirect ke portal setelah verified.
 */

import { ref } from 'vue'
import type {
  MfaChallenge,
  MfaChallengeVerifyPayload,
  MfaChallengeVerifyResponse,
} from '@/types/mfa.types'

export function useMfaChallenge() {
  const challenge = ref<MfaChallenge | null>(null)
  const pending = ref<boolean>(false)
  const error = ref<string | null>(null)
  const attemptsRemaining = ref<number>(5)

  // TODO: UC-50 — Implement when backend ready.
  function setChallenge(_challenge: MfaChallenge): void {
    void challenge.value
    throw new Error('[MFA] Not implemented: setChallenge. Waiting for backend endpoint.')
  }

  // TODO: UC-50 — Implement when backend ready.
  async function verify(_payload: MfaChallengeVerifyPayload): Promise<MfaChallengeVerifyResponse> {
    void pending.value
    void error.value
    void attemptsRemaining.value
    throw new Error('[MFA] Not implemented: verify. Waiting for backend endpoint.')
  }

  return {
    challenge,
    pending,
    error,
    attemptsRemaining,
    setChallenge,
    verify,
  }
}
