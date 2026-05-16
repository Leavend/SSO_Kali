/**
 * Consent API \u2014 UC-13 explicit OAuth consent decision.
 *
 * FE-FR026-001 / FR-026: routes through the central `apiClient` so we get
 *   - X-Request-ID + X-XSRF-TOKEN
 *   - Accept-Language propagation
 *   - Default 30s timeout
 *   - Typed `ApiError` (status, code, retry-after)
 *   - 401/419/429/5xx mapped to safe localized copy in `ApiError.fromResponse`
 */

import { apiClient } from '@/lib/api/api-client'

export type ConsentDecision = 'allow' | 'deny'

export type ConsentScope = {
  readonly name: string
  readonly description: string
  readonly claims?: readonly string[]
}

export type ConsentDetails = {
  readonly client: {
    readonly client_id: string
    readonly display_name: string
    readonly type: string
  }
  readonly scopes: readonly ConsentScope[]
  readonly state: string
}

export type ConsentDecisionResult = {
  readonly redirect_uri: string
}

export async function fetchConsentDetails(params: {
  readonly clientId: string
  readonly scope: string
  readonly state: string
}): Promise<ConsentDetails> {
  const query = new URLSearchParams({
    client_id: params.clientId,
    scope: params.scope,
    state: params.state,
  })

  return apiClient.get<ConsentDetails>(`/connect/consent?${query.toString()}`)
}

export async function submitConsentDecision(params: {
  readonly state: string
  readonly decision: ConsentDecision
}): Promise<ConsentDecisionResult> {
  const payload = await apiClient.post<ConsentDecisionResult | { redirect_uri?: unknown }>(
    '/connect/consent',
    params,
  )

  if (
    !payload ||
    typeof (payload as ConsentDecisionResult).redirect_uri !== 'string' ||
    (payload as ConsentDecisionResult).redirect_uri.length === 0
  ) {
    throw new Error('consent_decision_failed')
  }

  return payload as ConsentDecisionResult
}
