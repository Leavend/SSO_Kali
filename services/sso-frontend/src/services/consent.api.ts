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
  const response = await fetch(`/connect/consent?${query.toString()}`, {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  })

  if (!response.ok) throw new Error('consent_load_failed')
  return response.json() as Promise<ConsentDetails>
}

export async function submitConsentDecision(params: {
  readonly state: string
  readonly decision: ConsentDecision
}): Promise<{ readonly redirect_uri: string }> {
  const response = await fetch('/connect/consent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'include',
    body: JSON.stringify(params),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok || typeof payload.redirect_uri !== 'string' || payload.redirect_uri === '') {
    throw new Error('consent_decision_failed')
  }

  return payload as { readonly redirect_uri: string }
}
