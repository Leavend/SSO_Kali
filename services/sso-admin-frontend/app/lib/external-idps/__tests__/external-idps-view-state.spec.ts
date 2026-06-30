import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/api-client'
import {
  resolveEnabledTone,
  resolveExternalIdpsViewState,
  resolveHealthTone,
} from '../external-idps-view-state'
import type { ExternalIdentityProvider } from '@/types/external-idps.types'

const provider = (over: Partial<ExternalIdentityProvider> = {}): ExternalIdentityProvider => ({
  provider_key: 'acme',
  display_name: 'Acme IdP',
  issuer: 'https://idp.acme.test',
  metadata_url: 'https://idp.acme.test/.well-known/openid-configuration',
  client_id: 'sso-client',
  enabled: true,
  has_client_secret: true,
  health_status: 'healthy',
  ...over,
})

describe('resolveExternalIdpsViewState', () => {
  it('is loading when nothing resolved yet', () => {
    expect(resolveExternalIdpsViewState({ pending: true, error: null, providers: null })).toBe(
      'loading',
    )
  })
  it('maps 401/403/other (no prior list) to unauthenticated/forbidden/error', () => {
    expect(
      resolveExternalIdpsViewState({
        pending: false,
        error: new ApiError(401, 'x'),
        providers: null,
      }),
    ).toBe('unauthenticated')
    expect(
      resolveExternalIdpsViewState({
        pending: false,
        error: new ApiError(403, 'x'),
        providers: null,
      }),
    ).toBe('forbidden')
    expect(
      resolveExternalIdpsViewState({
        pending: false,
        error: new ApiError(500, 'x'),
        providers: null,
      }),
    ).toBe('error')
  })
  it('is empty / ready by list length', () => {
    expect(resolveExternalIdpsViewState({ pending: false, error: null, providers: [] })).toBe(
      'empty',
    )
    expect(
      resolveExternalIdpsViewState({ pending: false, error: null, providers: [provider()] }),
    ).toBe('ready')
  })
  it('keeps a good list on a background-refresh error (ready)', () => {
    expect(
      resolveExternalIdpsViewState({
        pending: false,
        error: new ApiError(500, 'x'),
        providers: [provider()],
      }),
    ).toBe('ready')
  })
})

describe('resolveHealthTone', () => {
  it('maps health_status to a distinct accessible tone (paired with a label in the badge)', () => {
    expect(resolveHealthTone('healthy')).toBe('success')
    expect(resolveHealthTone('unhealthy')).toBe('danger')
    expect(resolveHealthTone('unknown')).toBe('neutral')
    expect(resolveHealthTone(null)).toBe('neutral')
    expect(resolveHealthTone('something')).toBe('neutral')
  })
})

describe('resolveEnabledTone', () => {
  it('enabled=success, disabled=neutral', () => {
    expect(resolveEnabledTone(true)).toBe('success')
    expect(resolveEnabledTone(false)).toBe('neutral')
    expect(resolveEnabledTone(undefined)).toBe('neutral')
  })
})
