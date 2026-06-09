import { getConfig } from './config.js'

/**
 * Register this admin RP session with the IdP back-channel session registry.
 *
 * The backend (`POST /connect/register-session`) reads the `sid` + `client_id`
 * straight from the presented access token, so no request body is needed. This
 * is what makes the admin panel:
 *   1. appear in the user's connected-apps list (`/apps`), and
 *   2. reachable by OIDC single sign-out — `PerformSingleSignOut` revokes the
 *      session's access tokens and dispatches a back-channel logout to the
 *      admin client's `backchannel_logout_uri`.
 *
 * Without this call the admin BFF session is invisible to the IdP, so logging
 * out of the portal (or anywhere else) cannot terminate the admin session.
 *
 * Best-effort by design: a registration failure must never block login or token
 * refresh, so the network error is swallowed after logging.
 */
export async function registerClientSession(accessToken: string, requestId: string): Promise<void> {
  try {
    await fetch(`${getConfig().internalBaseUrl}/connect/register-session`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Accept-Encoding': 'identity',
        'X-Request-Id': requestId,
      },
      signal: AbortSignal.timeout(5_000),
    })
  } catch (error) {
    console.error(
      'Admin RP session registration failed:',
      error instanceof Error ? error.message : error,
    )
  }
}
