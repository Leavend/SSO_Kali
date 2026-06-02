type SsoCompletionResponse = {
  readonly redirect_uri?: unknown
}

export type UseSsoCompletionReturn = {
  complete: (authRequestId: string) => Promise<string | null>
}

export function useSsoCompletion(): UseSsoCompletionReturn {
  async function complete(authRequestId: string): Promise<string | null> {
    const response = await fetch('/connect/sso-complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auth_request_id: authRequestId }),
      credentials: 'include',
    })

    if (!response.ok) return null

    const payload = (await response.json()) as SsoCompletionResponse
    return typeof payload.redirect_uri === 'string' && payload.redirect_uri.length > 0
      ? payload.redirect_uri
      : null
  }

  return { complete }
}
