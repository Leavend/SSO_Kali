import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/api-client'
import {
  resolveOidcFoundationViewState,
  resolveAvailabilityTone,
  resolveEvidenceTone,
  resolveConsistencyTone,
  resolveScopeLabelTone,
  resolveJwksKeyTone,
} from '@/lib/oidc-foundation/oidc-foundation-view-state'
import type { OidcFoundationSnapshot } from '@/types/oidc-foundation.types'

const SNAPSHOT = { checked_at: '2026-06-28T10:00:00Z' } as OidcFoundationSnapshot

describe('resolveOidcFoundationViewState', () => {
  it('loading without snapshot or error', () => {
    expect(resolveOidcFoundationViewState({ pending: true, error: null, snapshot: null })).toBe('loading')
  })
  it('ready with a snapshot', () => {
    expect(resolveOidcFoundationViewState({ pending: false, error: null, snapshot: SNAPSHOT })).toBe('ready')
  })
  it('maps 401/403/other with no snapshot', () => {
    expect(resolveOidcFoundationViewState({ pending: false, error: new ApiError(401, 'x'), snapshot: null })).toBe('unauthenticated')
    expect(resolveOidcFoundationViewState({ pending: false, error: new ApiError(403, 'x'), snapshot: null })).toBe('forbidden')
    expect(resolveOidcFoundationViewState({ pending: false, error: new ApiError(500, 'x'), snapshot: null })).toBe('error')
  })
  it('reads the plain hydration-shaped error (statusCode)', () => {
    expect(resolveOidcFoundationViewState({ pending: false, error: { statusCode: 403 }, snapshot: null })).toBe('forbidden')
  })
})

describe('oidc tone resolvers', () => {
  it('availability: healthy/degraded/unavailable/unknown', () => {
    expect(resolveAvailabilityTone('healthy')).toBe('success')
    expect(resolveAvailabilityTone('degraded')).toBe('warning')
    expect(resolveAvailabilityTone('unavailable')).toBe('danger')
    expect(resolveAvailabilityTone('unknown')).toBe('neutral')
  })
  it('evidence: available/recorded/stale/missing/failed', () => {
    expect(resolveEvidenceTone('available')).toBe('success')
    expect(resolveEvidenceTone('recorded')).toBe('success') // backend's real jwks_rotation value
    expect(resolveEvidenceTone('stale')).toBe('warning')
    expect(resolveEvidenceTone('missing')).toBe('danger')
    expect(resolveEvidenceTone('failed')).toBe('danger')
  })
  it('jwks key tone: published/active -> success, rotated -> warning, else neutral', () => {
    expect(resolveJwksKeyTone('published')).toBe('success') // backend's real key status
    expect(resolveJwksKeyTone('active')).toBe('success')
    expect(resolveJwksKeyTone('rotated')).toBe('warning')
    expect(resolveJwksKeyTone('retired')).toBe('neutral')
  })
  it('consistency: pass/warning/mismatch/unknown', () => {
    expect(resolveConsistencyTone('pass')).toBe('success')
    expect(resolveConsistencyTone('warning')).toBe('warning')
    expect(resolveConsistencyTone('mismatch')).toBe('danger')
    expect(resolveConsistencyTone('unknown')).toBe('neutral')
  })
  it('scope label: mapped/missing_label/unknown_custom/deprecated', () => {
    expect(resolveScopeLabelTone('mapped')).toBe('success')
    expect(resolveScopeLabelTone('missing_label')).toBe('warning')
    expect(resolveScopeLabelTone('unknown_custom')).toBe('warning')
    expect(resolveScopeLabelTone('deprecated')).toBe('neutral')
  })
})
