/**
 * useOidcLogout — composable FR-002 RP-Initiated Logout.
 *
 * Tanggung jawab:
 *   1. Clear local session state (Pinia).
 *   2. Call `POST /api/auth/logout` (clear server cookie).
 *   3. Broadcast logout ke semua tab via BroadcastChannel.
 *   4. Redirect ke OIDC `end_session_endpoint` dengan `id_token_hint`
 *      dan `post_logout_redirect_uri` (FR-002-AC-10).
 *   5. Fallback ke login page jika OIDC config tidak tersedia.
 *
 * Catatan:
 *   - `id_token_hint` disimpan di memory (ref) setelah OIDC callback sukses.
 *   - Composable ini menggantikan direct `session.logout()` + `redirect.toLogin()`
 *     untuk flow yang memerlukan centralized logout.
 */

import { ref } from 'vue'
import { useSessionStore } from '@/stores/session.store'
import { useAuthRedirect } from '@/composables/useAuthRedirect'
import { getLocationPort } from '@/lib/browser/location-port'
import { readOidcConfig } from '@/lib/oidc/config'
import { logger } from '@/lib/logger'

const BROADCAST_CHANNEL_NAME = 'dev-sso.logout' as const

/** In-memory id_token storage — set setelah OIDC callback sukses. */
const idTokenHint = ref<string | null>(null)

export type UseOidcLogoutReturn = {
  /** Set id_token setelah OIDC callback sukses. */
  setIdTokenHint: (token: string) => void
  /** Clear id_token (e.g. saat token expired). */
  clearIdTokenHint: () => void
  /** Perform full RP-Initiated Logout (FR-002). */
  logout: () => Promise<void>
  /** Listen for logout broadcast dari tab lain. */
  listenForLogoutBroadcast: (onLogout: () => void) => () => void
}

export function useOidcLogout(): UseOidcLogoutReturn {
  const session = useSessionStore()
  const redirect = useAuthRedirect()

  function setIdTokenHint(token: string): void {
    idTokenHint.value = token
  }

  function clearIdTokenHint(): void {
    idTokenHint.value = null
  }

  async function logout(): Promise<void> {
    // 1. Clear server session (cookie).
    try {
      await session.logout()
    } catch (error) {
      logger.warn('Server logout failed, continuing with local cleanup', {
        error: error instanceof Error ? error.message : String(error),
      })
    }

    // 2. Broadcast logout ke semua tab.
    broadcastLogout()

    // 3. Clear id_token dari memory.
    const hint = idTokenHint.value
    clearIdTokenHint()

    // 4. Redirect ke end_session_endpoint (RP-Initiated Logout).
    try {
      const config = readOidcConfig()
      const endSessionUrl = buildEndSessionUrl(config, hint)
      getLocationPort().assign(endSessionUrl)
    } catch {
      // Fallback: OIDC config tidak tersedia (native cookie mode).
      redirect.toLogin()
    }
  }

  function broadcastLogout(): void {
    if (typeof BroadcastChannel === 'undefined') return
    try {
      const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME)
      channel.postMessage({ type: 'logout' })
      channel.close()
    } catch {
      // BroadcastChannel not supported — silent fallback.
    }
  }

  function listenForLogoutBroadcast(onLogout: () => void): () => void {
    if (typeof BroadcastChannel === 'undefined') return () => {}

    const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME)
    function handler(event: MessageEvent): void {
      const data = event.data as { type?: string } | undefined
      if (data?.type === 'logout') {
        session.clear()
        onLogout()
      }
    }
    channel.addEventListener('message', handler)

    return () => {
      channel.removeEventListener('message', handler)
      channel.close()
    }
  }

  return { setIdTokenHint, clearIdTokenHint, logout, listenForLogoutBroadcast }
}

function buildEndSessionUrl(
  config: { end_session_endpoint: string; client_id: string; post_logout_redirect_uri: string },
  idTokenHint: string | null,
): string {
  const url = new URL(config.end_session_endpoint)
  url.searchParams.set('client_id', config.client_id)
  url.searchParams.set('post_logout_redirect_uri', config.post_logout_redirect_uri)

  if (idTokenHint) {
    url.searchParams.set('id_token_hint', idTokenHint)
  }

  return url.toString()
}
