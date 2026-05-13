/**
 * OIDC Token API — bungkus `POST /oauth2/token` (authorization_code grant + PKCE).
 *
 * Dipakai oleh `useOidcCallback` setelah authorize callback.
 * Tidak pakai `apiClient` karena:
 *   1. `/oauth2/token` mengembalikan shape OAuth2 (snake_case) dan
 *      biasanya memerlukan `application/x-www-form-urlencoded` body.
 *   2. Error response memakai format RFC 6749 (`error`, `error_description`).
 */

import { ApiError } from '@/lib/api/api-error'

export type TokenResponse = {
  readonly access_token: string
  readonly token_type: 'Bearer'
  readonly expires_in: number
  readonly id_token: string
  readonly refresh_token?: string
  readonly scope?: string
}

export type TokenExchangeInput = {
  readonly token_endpoint: string
  readonly client_id: string
  readonly code: string
  readonly redirect_uri: string
  readonly code_verifier: string
}

export async function exchangeAuthorizationCode(
  input: TokenExchangeInput,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: input.client_id,
    code: input.code,
    redirect_uri: input.redirect_uri,
    code_verifier: input.code_verifier,
  })

  const response = await fetch(input.token_endpoint, {
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

  return (await response.json()) as TokenResponse
}
