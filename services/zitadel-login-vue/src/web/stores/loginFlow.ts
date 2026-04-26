import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { LOGIN_MESSAGES } from '@shared/messages'
import { normalizeBasePath, sanitizeFlowId, sanitizeLoginName, sanitizeOtpCode } from '@shared/routes'

interface StepResponse {
  readonly nextStep?: 'login' | 'password' | 'otp' | 'signedin'
  readonly loginName?: string
  readonly redirectUrl?: string
  readonly message?: string
}

const apiBasePath = normalizeBasePath(import.meta.env.VITE_PUBLIC_BASE_PATH)

export const useLoginFlowStore = defineStore('login-flow', () => {
  const authRequest = ref<string | null>(null)
  const loginName = ref('')
  const errorMessage = ref('')
  const isLoading = ref(false)
  const displayName = computed(() => loginName.value || 'akun Anda')

  function hydrateFromRoute(value: unknown): string | null {
    authRequest.value = sanitizeFlowId(value)
    return authRequest.value
  }

  async function submitAuthRequest(value: string): Promise<'login' | 'password' | null> {
    const response = await postStep('/api/session/auth-request', { authRequest: value })
    if (response?.loginName) loginName.value = sanitizeLoginName(response.loginName)
    return response?.nextStep === 'password' ? 'password' : 'login'
  }

  async function submitLoginName(value: string): Promise<'password' | null> {
    loginName.value = sanitizeLoginName(value)
    if (!loginName.value) return failInput(LOGIN_MESSAGES.invalidLoginName)
    const response = await postStep('/api/session/user', { loginName: loginName.value, authRequest: authRequest.value })
    return response?.nextStep === 'password' ? 'password' : null
  }

  async function submitPassword(password: string): Promise<'otp' | 'signedin' | null> {
    if (!password) return failInput(LOGIN_MESSAGES.invalidPassword)
    const response = await postStep('/api/session/password', { password })
    return continueFlow(response)
  }

  async function submitOtp(code: string): Promise<'signedin' | null> {
    const sanitized = sanitizeOtpCode(code)
    if (sanitized.length < 6) return failInput(LOGIN_MESSAGES.invalidOtp)
    const response = await postStep('/api/session/totp', { code: sanitized })
    return continueFlow(response) === 'signedin' ? 'signedin' : null
  }

  function failInput<T>(message: string): T | null {
    errorMessage.value = message
    return null
  }

  async function postStep(path: string, body: unknown): Promise<StepResponse | null> {
    return withLoading(async () => requestStep(path, body))
  }

  function continueFlow(response: StepResponse | null): 'otp' | 'signedin' | null {
    if (!response) return null
    if (response.redirectUrl) window.location.assign(response.redirectUrl)
    if (response.nextStep === 'otp') return 'otp'
    return response.nextStep === 'signedin' || response.redirectUrl ? 'signedin' : null
  }

  async function withLoading<T>(task: () => Promise<T>): Promise<T | null> {
    isLoading.value = true
    errorMessage.value = ''
    try {
      return await task()
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : LOGIN_MESSAGES.generic
      return null
    } finally {
      isLoading.value = false
    }
  }

  return {
    authRequest,
    displayName,
    errorMessage,
    hydrateFromRoute,
    isLoading,
    loginName,
    submitAuthRequest,
    submitLoginName,
    submitOtp,
    submitPassword,
  }
})

async function requestStep(path: string, body: unknown): Promise<StepResponse> {
  const response = await fetch(`${apiBasePath}${path}`, requestInit(body))
  const payload = (await response.json()) as StepResponse
  if (!response.ok) throw new Error(payload.message || LOGIN_MESSAGES.generic)
  return payload
}

function requestInit(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }
}
