import { LOGIN_MESSAGES } from '@shared/messages'
import { normalizeBasePath } from '@shared/routes'

interface MessageResponse {
  readonly message?: string
}

const apiBasePath = normalizeBasePath(import.meta.env.VITE_PUBLIC_BASE_PATH)

export async function requestPasswordReset(loginName: string): Promise<string> {
  return await postMessage('/api/password-reset/request', { loginName })
}

export async function changePassword(userId: string, code: string, password: string): Promise<string> {
  return await postMessage('/api/password-reset/change', { userId, code, password })
}

async function postMessage(path: string, body: unknown): Promise<string> {
  const response = await fetch(`${apiBasePath}${path}`, requestInit(body))
  const payload = (await response.json()) as MessageResponse
  if (!response.ok) throw new Error(payload.message || LOGIN_MESSAGES.generic)
  return payload.message || LOGIN_MESSAGES.generic
}

function requestInit(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }
}
