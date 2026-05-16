import { apiClient } from '@/lib/api/api-client'

export type OidcCallbackSessionResult = {
  readonly authenticated: true
  readonly post_login_redirect: string
}

export type OidcCallbackSessionInput = {
  readonly code: string
  readonly state: string
}

export async function completeOidcCallback(
  input: OidcCallbackSessionInput,
): Promise<OidcCallbackSessionResult> {
  return apiClient.post<OidcCallbackSessionResult>('/auth/callback', input)
}
