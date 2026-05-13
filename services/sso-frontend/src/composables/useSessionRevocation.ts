/**
 * useSessionRevocation — composable UC-27 + UC-32.
 *
 * Mengemas state confirm dialog dan loading untuk revoke satu sesi
 * dan revoke semua sesi milik user, sehingga pages tidak perlu
 * menyimpan state interaksi ini sendiri.
 */

import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { useProfileStore } from '@/stores/profile.store'
import { useSessionStore } from '@/stores/session.store'
import { useAuthRedirect } from '@/composables/useAuthRedirect'
import { useAsyncAction, type UseAsyncActionReturn } from '@/composables/useAsyncAction'
import type { RevokeAllSessionsResponse } from '@/types/profile.types'

export type UseSessionRevocationReturn = {
  readonly revokeOne: UseAsyncActionReturn<[string], void>
  readonly revokeAll: UseAsyncActionReturn<[], RevokeAllSessionsResponse>
  readonly pendingSingleRevocation: ComputedRef<boolean>
  readonly pendingGlobalLogout: ComputedRef<boolean>
  readonly confirmSingleOpen: Ref<boolean>
  readonly confirmGlobalOpen: Ref<boolean>
  readonly pendingSessionId: ComputedRef<string | null>
  readonly partialFailureWarning: Ref<string | null>
  askRevokeSession: (sessionId: string) => void
  askRevokeAll: () => void
  confirmRevokeSession: () => Promise<void>
  confirmRevokeAll: () => Promise<void>
}

export function useSessionRevocation(): UseSessionRevocationReturn {
  const profile = useProfileStore()
  const session = useSessionStore()
  const redirect = useAuthRedirect()

  const revokeOne = useAsyncAction((id: string) => profile.revokeSession(id))
  const revokeAll = useAsyncAction(() => profile.revokeAllSessions())

  const pendingSessionId = ref<string | null>(null)
  const confirmSingleOpen = ref<boolean>(false)
  const confirmGlobalOpen = ref<boolean>(false)

  const pendingSingleRevocation = computed<boolean>(() => revokeOne.pending.value)
  const pendingGlobalLogout = computed<boolean>(() => revokeAll.pending.value)

  function askRevokeSession(sessionId: string): void {
    pendingSessionId.value = sessionId
    confirmSingleOpen.value = true
  }

  function askRevokeAll(): void {
    confirmGlobalOpen.value = true
  }

  async function confirmRevokeSession(): Promise<void> {
    const sessionId = pendingSessionId.value
    pendingSessionId.value = null
    if (sessionId) {
      await revokeOne.run(sessionId)
    }
  }

  /** Warning message when logout partially failed (FR-002-AC-14). */
  const partialFailureWarning = ref<string | null>(null)

  async function confirmRevokeAll(): Promise<void> {
    partialFailureWarning.value = null
    const result = await revokeAll.run()
    if (result !== null) {
      // Check for partial failure (some back-channel notifications failed).
      if (result.failed_count && result.failed_count > 0) {
        const clients = result.failed_clients?.join(', ') ?? ''
        partialFailureWarning.value =
          `Logout berhasil untuk ${result.revoked_sessions} sesi, ` +
          `tetapi ${result.failed_count} aplikasi gagal dihubungi` +
          (clients ? ` (${clients})` : '') +
          `. Aplikasi tersebut mungkin masih aktif sementara.`
      }
      await session.logout()
      redirect.toLogin()
    }
  }

  return {
    revokeOne,
    revokeAll,
    pendingSingleRevocation,
    pendingGlobalLogout,
    confirmSingleOpen,
    confirmGlobalOpen,
    pendingSessionId: computed(() => pendingSessionId.value),
    partialFailureWarning,
    askRevokeSession,
    askRevokeAll,
    confirmRevokeSession,
    confirmRevokeAll,
  }
}
