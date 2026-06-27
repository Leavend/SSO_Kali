export type SsoWidgetApp = {
  readonly client_id: string
  readonly display_name: string
  readonly app_base_url: string
  readonly category: string
}

export type SsoWidgetAccount = {
  readonly account_id: string | null
  readonly subject_id: string
  readonly display_name: string
  readonly email: string
  readonly status: 'active' | 'session_expired'
  readonly is_current: boolean
}

type AppsResponse = { readonly apps: readonly SsoWidgetApp[] }
type AccountsResponse = { readonly accounts: readonly SsoWidgetAccount[] }
type SwitchResponse = {
  readonly success: boolean
  readonly error?: string
  readonly login_url?: string
}
type LogoutResponse = { readonly success: boolean; readonly error?: string }

export const ssoAccountWidgetApi = {
  async apps(): Promise<readonly SsoWidgetApp[]> {
    const response = await widgetFetch<AppsResponse>('/widget/apps')
    return response.apps
  },

  async accounts(): Promise<readonly SsoWidgetAccount[]> {
    const response = await widgetFetch<AccountsResponse>('/widget/accounts')
    return response.accounts
  },

  async switchAccount(accountId: string): Promise<SwitchResponse> {
    return widgetFetch<SwitchResponse>(
      '/widget/switch',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-SSO-Widget-Action': 'switch' },
        body: JSON.stringify({ account_id: accountId }),
      },
      true,
    )
  },

  async logout(): Promise<LogoutResponse> {
    return widgetFetch<LogoutResponse>(
      '/widget/logout',
      { method: 'POST', headers: { 'X-SSO-Widget-Action': 'logout' } },
      true,
    )
  },
}

export function safeWidgetAppUrl(value: string): string | null {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

async function widgetFetch<T>(
  path: string,
  init: RequestInit = {},
  acceptErrorPayload = false,
): Promise<T> {
  const response = await fetch(`${resolveWidgetBaseUrl()}${path}`, {
    ...init,
    credentials: 'include',
    headers: { Accept: 'application/json', ...init.headers },
  })

  const payload = (await response.json().catch(() => ({}))) as T
  if (!response.ok && acceptErrorPayload) return payload
  if (!response.ok) {
    const requestId = response.headers.get('x-request-id')
    throw new Error(
      requestId ? `sso_widget_request_failed:${requestId}` : 'sso_widget_request_failed',
    )
  }
  return payload
}

/**
 * Resolve the base the credentialed account-widget endpoints live on.
 *
 * Default is SAME-ORIGIN: an empty base resolves `/widget/*` relative to the
 * admin origin. The admin BFF proxies those paths to the backend and holds the
 * host-only `__Host-sso_session` cookie minted first-party at the OIDC callback,
 * so the credentialed fetch is first-party and the cookie is always sent — no
 * cross-host `__Host-` problem, no CORS, no third-party-cookie dependency.
 *
 * `NUXT_PUBLIC_SSO_WIDGET_BASE_URL` remains a documented override for a
 * cross-origin front-door host; leave it unset for the same-origin default.
 */
export function resolveWidgetBaseUrl(): string {
  return useRuntimeConfig().public.ssoWidgetBaseUrl.replace(/\/$/u, '')
}
