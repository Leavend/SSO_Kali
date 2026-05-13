/**
 * useTokenLifecycle — UC-19 Silent Refresh untuk OIDC token mode.
 *
 * Tanggung jawab:
 *   1. Schedule refresh ~180s sebelum `expires_in` habis.
 *   2. Lock antar-tab via BroadcastChannel supaya hanya 1 tab yang refresh.
 *   3. Pause saat tab hidden, immediate refresh saat visible kembali.
 *   4. Fallback ke `onExpired()` bila refresh gagal (redirect login).
 *
 * Catatan:
 *   - Composable ini hanya aktif bila portal dikonfigurasi sebagai OIDC client
 *     (env `VITE_OIDC_*` diset). Untuk native cookie mode, pakai `useSessionHeartbeat`.
 *   - Token disimpan di memory (ref) — tidak pernah di localStorage (standar §13.1).
 *   - Refresh token dikirim ke `/oauth2/token` dengan `grant_type=refresh_token`.
 */

import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { useDocumentVisibility } from '@vueuse/core'
import { ApiError, isApiError } from '@/lib/api/api-error'

const REFRESH_MARGIN_SECONDS = 180 as const
const MIN_REFRESH_INTERVAL_MS = 10_000 as const
const BROADCAST_CHANNEL_NAME = 'dev-sso.token-lifecycle' as const

export type TokenState = {
  readonly access_token: string
  readonly refresh_token: string | null
  readonly expires_at: number // Unix ms
  readonly token_endpoint: string
  readonly client_id: string
}

export type UseTokenLifecycleOptions = {
  /** Reactive ref ke token state. Null = belum login / native mode. */
  readonly tokenState: Ref<TokenState | null>
  /** Callback saat refresh berhasil — caller update tokenState. */
  readonly onRefreshed: (newTokens: RefreshedTokens) => void
  /** Callback saat refresh gagal dan user harus re-login. */
  readonly onExpired: () => void
}

export type RefreshedTokens = {
  readonly access_token: string
  readonly refresh_token: string | null
  readonly expires_in: number
}

export function useTokenLifecycle(options: UseTokenLifecycleOptions): void {
  const { tokenState, onRefreshed, onExpired } = options
  const visibility = useDocumentVisibility()
  const refreshing = ref<boolean>(false)

  let timer: ReturnType<typeof setTimeout> | null = null
  let channel: BroadcastChannel | null = null

  function scheduleRefresh(): void {
    clearSchedule()
    const state = tokenState.value
    if (!state) return

    const nowMs = Date.now()
    const marginMs = REFRESH_MARGIN_SECONDS * 1000
    const refreshAtMs = state.expires_at - marginMs
    const delayMs = Math.max(refreshAtMs - nowMs, MIN_REFRESH_INTERVAL_MS)

    timer = setTimeout(() => void performRefresh(), delayMs)
  }

  function clearSchedule(): void {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  async function performRefresh(): Promise<void> {
    const state = tokenState.value
    if (!state || !state.refresh_token || refreshing.value) return

    refreshing.value = true

    try {
      // Broadcast lock: announce refresh start.
      channel?.postMessage({ type: 'refresh_start' })

      const result = await exchangeRefreshToken(state)
      onRefreshed(result)
      channel?.postMessage({ type: 'refresh_done', tokens: result })
      scheduleRefresh()
    } catch (error) {
      if (isApiError(error) && !error.isRetryable()) {
        onExpired()
      } else {
        // Retryable: schedule lagi setelah 10s.
        timer = setTimeout(() => void performRefresh(), MIN_REFRESH_INTERVAL_MS)
      }
    } finally {
      refreshing.value = false
    }
  }

  function handleVisibilityChange(): void {
    if (visibility.value === 'visible') {
      const state = tokenState.value
      if (state && Date.now() >= state.expires_at - REFRESH_MARGIN_SECONDS * 1000) {
        void performRefresh()
      } else {
        scheduleRefresh()
      }
    } else {
      clearSchedule()
    }
  }

  function handleBroadcast(event: MessageEvent): void {
    const data = event.data as { type?: string; tokens?: RefreshedTokens } | undefined
    if (!data) return

    if (data.type === 'refresh_done' && data.tokens) {
      // Sibling tab sudah refresh — update local state tanpa network call.
      onRefreshed(data.tokens)
      scheduleRefresh()
    }
  }

  function initChannel(): void {
    if (typeof BroadcastChannel === 'undefined') return
    channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME)
    channel.addEventListener('message', handleBroadcast)
  }

  function destroyChannel(): void {
    if (channel) {
      channel.removeEventListener('message', handleBroadcast)
      channel.close()
      channel = null
    }
  }

  watch(visibility, handleVisibilityChange)
  watch(tokenState, scheduleRefresh, { immediate: false })

  onMounted(() => {
    initChannel()
    scheduleRefresh()
  })

  onBeforeUnmount(() => {
    clearSchedule()
    destroyChannel()
  })
}

async function exchangeRefreshToken(state: TokenState): Promise<RefreshedTokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: state.client_id,
    refresh_token: state.refresh_token!,
  })

  const response = await fetch(state.token_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
    credentials: 'omit',
  })

  if (!response.ok) {
    throw await ApiError.fromResponse(response)
  }

  const json = (await response.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
  }

  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? null,
    expires_in: json.expires_in,
  }
}
