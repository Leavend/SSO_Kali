import { ApiError } from '@/lib/api/api-error'

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
  const response = await fetch('/auth/callback', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    throw await ApiError.fromResponse(response)
  }

  return (await response.json()) as OidcCallbackSessionResult
}
