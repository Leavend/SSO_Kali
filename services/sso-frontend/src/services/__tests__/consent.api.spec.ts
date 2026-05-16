import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/lib/api/api-client'
import { ApiError } from '@/lib/api/api-error'
import {
  fetchConsentDetails,
  submitConsentDecision,
  type ConsentDetails,
} from '../consent.api'

describe('consent.api (FE-FR026-001 / FR-026)', () => {
  let getSpy: ReturnType<typeof vi.spyOn>
  let postSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    getSpy = vi.spyOn(apiClient, 'get')
    postSpy = vi.spyOn(apiClient, 'post')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches consent details via apiClient.get with the encoded query', async () => {
    const expected: ConsentDetails = {
      client: { client_id: 'sso-portal', display_name: 'Portal', type: 'public' },
      scopes: [{ name: 'openid', description: 'identity' }],
      state: 'state-123',
    }
    getSpy.mockResolvedValueOnce(expected)

    const result = await fetchConsentDetails({
      clientId: 'sso-portal',
      scope: 'openid profile',
      state: 'state-123',
    })

    expect(result).toEqual(expected)
    expect(getSpy).toHaveBeenCalledTimes(1)
    const url = getSpy.mock.calls[0]![0] as string
    expect(url.startsWith('/connect/consent?')).toBe(true)
    expect(url).toContain('client_id=sso-portal')
    expect(url).toContain('scope=openid+profile')
    expect(url).toContain('state=state-123')
  })

  it('submits consent decision via apiClient.post with state + decision', async () => {
    postSpy.mockResolvedValueOnce({ redirect_uri: 'https://app/callback?code=abc' })

    const result = await submitConsentDecision({ state: 'state-1', decision: 'allow' })

    expect(result).toEqual({ redirect_uri: 'https://app/callback?code=abc' })
    expect(postSpy).toHaveBeenCalledWith('/connect/consent', { state: 'state-1', decision: 'allow' })
  })

  it('rejects when backend returns an empty/invalid redirect_uri', async () => {
    postSpy.mockResolvedValueOnce({ redirect_uri: '' })

    await expect(
      submitConsentDecision({ state: 'state-1', decision: 'deny' }),
    ).rejects.toThrowError(/consent_decision_failed/u)
  })

  it('propagates ApiError from apiClient (419 / 429 / backend protocol errors)', async () => {
    const csrfError = new ApiError(419, 'Sesi keamanan kedaluwarsa.', 'csrf', [], 'http')
    postSpy.mockRejectedValueOnce(csrfError)

    await expect(
      submitConsentDecision({ state: 'state-1', decision: 'allow' }),
    ).rejects.toBe(csrfError)

    const rate = new ApiError(429, 'Terlalu banyak.', 'rate_limited', [], 'http', 30)
    postSpy.mockRejectedValueOnce(rate)

    await expect(
      submitConsentDecision({ state: 'state-1', decision: 'allow' }),
    ).rejects.toBe(rate)
  })
})
