/**
 * useSessionHeartbeat — polling periodik ke backend untuk memperpanjang
 * sliding idle TTL cookie sso_session dan sekaligus mendeteksi sesi expired.
 *
 * Backend `SsoSessionService::currentUser()` melakukan `touchLastSeen()`
 * pada tiap hit `/api/auth/session`, jadi polling ini sekaligus berfungsi
 * sebagai "silent refresh" idle timer.
 *
 * Di-pause saat tab tidak visible untuk hemat request, lalu segera
 * melakukan heartbeat ketika user kembali aktif.
 */

import { onBeforeUnmount, onMounted } from 'vue'
import { useDocumentVisibility, useIntervalFn } from '@vueuse/core'
import { useSessionStore } from '@/stores/session.store'

const DEFAULT_INTERVAL_MS = 60_000 as const

export type UseSessionHeartbeatOptions = {
  readonly intervalMs?: number
  readonly onExpired?: () => void
}

export function useSessionHeartbeat(options: UseSessionHeartbeatOptions = {}): void {
  const interval = options.intervalMs ?? DEFAULT_INTERVAL_MS
  const session = useSessionStore()
  const visibility = useDocumentVisibility()

  async function tick(): Promise<void> {
    if (!session.isAuthenticated) return
    const ok = await session.ensureSession()
    if (!ok) options.onExpired?.()
  }

  const { pause, resume } = useIntervalFn(tick, interval, {
    immediate: false,
    immediateCallback: false,
  })

  function handleVisibility(value: 'visible' | 'hidden' | 'prerender' | 'unloaded'): void {
    if (value === 'visible') {
      resume()
      void tick()
    } else {
      pause()
    }
  }

  onMounted(() => {
    handleVisibility(visibility.value)
  })

  onBeforeUnmount(() => {
    pause()
  })
}
