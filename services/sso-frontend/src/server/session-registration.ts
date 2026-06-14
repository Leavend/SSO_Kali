import { getConfig } from './config.js'

export async function registerClientSession(
  accessToken: string,
  requestId: string,
): Promise<boolean> {
  try {
    const response = await fetch(`${getConfig().internalBaseUrl}/connect/register-session`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Accept-Encoding': 'identity',
        'X-Request-Id': requestId,
      },
      signal: AbortSignal.timeout(5_000),
    })

    if (!response.ok) {
      console.error('Portal RP session registration failed:', response.status)
      return false
    }

    return true
  } catch (error) {
    console.error(
      'Portal RP session registration failed:',
      error instanceof Error ? error.message : error,
    )
    return false
  }
}
