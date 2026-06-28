import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/api-client'
import {
  isClientsListEmpty,
  resolveClientDetailViewState,
  resolveClientStatusTone,
  resolveClientsViewState,
} from '../clients-view-state'
import type { AdminClientDetail, AdminClientListItem } from '@/types/clients.types'

// Sample row — reads clearly as a fixture. Carries ONLY `has_secret_hash`; the
// plaintext client_secret never lives on a list/detail DTO.
const sample: AdminClientListItem = {
  client_id: 'sample-portal',
  display_name: 'Sample Portal',
  type: 'confidential',
  environment: 'live',
  app_base_url: 'https://sample.example.test',
  redirect_uris: ['https://sample.example.test/callback'],
  post_logout_redirect_uris: ['https://sample.example.test'],
  allowed_scopes: ['openid', 'profile'],
  backchannel_logout_uri: 'https://sample.example.test/bclogout',
  backchannel_logout_internal: false,
  owner_email: 'owner.sample@example.test',
  provisioning: 'jit',
  status: 'active',
  category: 'publik',
  has_secret_hash: true,
}

const detail: AdminClientDetail = {
  ...sample,
  activated_at: '2026-01-01T00:00:00Z',
  disabled_at: null,
  secret_rotated_at: '2026-06-01T00:00:00Z',
  secret_expires_at: '2026-12-01T00:00:00Z',
}

describe('isClientsListEmpty', () => {
  it('is true only for a zero-length list (no-data, distinct from forbidden)', () => {
    expect(isClientsListEmpty([])).toBe(true)
    expect(isClientsListEmpty([sample])).toBe(false)
  })
})

describe('resolveClientsViewState', () => {
  it('loading when no list and no error', () => {
    expect(resolveClientsViewState({ pending: true, error: null, list: null })).toBe('loading')
  })
  it('maps a first-load 401 to unauthenticated', () => {
    expect(
      resolveClientsViewState({
        pending: false,
        error: new ApiError(401, 'no session'),
        list: null,
      }),
    ).toBe('unauthenticated')
  })
  it('maps a first-load 403 to forbidden (distinct from empty)', () => {
    expect(
      resolveClientsViewState({
        pending: false,
        error: new ApiError(403, 'forbidden'),
        list: null,
      }),
    ).toBe('forbidden')
  })
  it('maps other first-load errors to error (incl. H3-shaped statusCode)', () => {
    expect(
      resolveClientsViewState({ pending: false, error: new ApiError(500, 'boom'), list: null }),
    ).toBe('error')
    expect(
      resolveClientsViewState({ pending: false, error: { statusCode: 502 }, list: null }),
    ).toBe('error')
  })
  it('empty vs ready once a list is present (a stale-refresh error keeps the snapshot)', () => {
    expect(resolveClientsViewState({ pending: false, error: null, list: [] })).toBe('empty')
    expect(resolveClientsViewState({ pending: false, error: null, list: [sample] })).toBe('ready')
    expect(
      resolveClientsViewState({ pending: false, error: new ApiError(500, 'boom'), list: [sample] }),
    ).toBe('ready')
    // an empty list with a background error is still "empty", never blanked to error
    expect(
      resolveClientsViewState({ pending: false, error: new ApiError(500, 'boom'), list: [] }),
    ).toBe('empty')
  })
})

describe('resolveClientDetailViewState', () => {
  it('loading when no client and no error', () => {
    expect(resolveClientDetailViewState({ pending: true, error: null, client: null })).toBe(
      'loading',
    )
  })
  it('maps a first-load 404 to not_found (distinct from error)', () => {
    expect(
      resolveClientDetailViewState({
        pending: false,
        error: new ApiError(404, 'missing'),
        client: null,
      }),
    ).toBe('not_found')
    expect(
      resolveClientDetailViewState({ pending: false, error: { statusCode: 404 }, client: null }),
    ).toBe('not_found')
  })
  it('maps 401/403/other first-load errors', () => {
    expect(
      resolveClientDetailViewState({ pending: false, error: new ApiError(401, 'x'), client: null }),
    ).toBe('unauthenticated')
    expect(
      resolveClientDetailViewState({ pending: false, error: new ApiError(403, 'x'), client: null }),
    ).toBe('forbidden')
    expect(
      resolveClientDetailViewState({ pending: false, error: new ApiError(500, 'x'), client: null }),
    ).toBe('error')
  })
  it('ready once the client is present, even on a background-refresh error', () => {
    expect(resolveClientDetailViewState({ pending: false, error: null, client: detail })).toBe(
      'ready',
    )
    expect(
      resolveClientDetailViewState({
        pending: false,
        error: new ApiError(500, 'x'),
        client: detail,
      }),
    ).toBe('ready')
  })
})

describe('resolveClientStatusTone', () => {
  it('maps client lifecycle statuses to Swiss tones (red reserved for genuinely critical)', () => {
    expect(resolveClientStatusTone('active')).toBe('success')
    expect(resolveClientStatusTone('staged')).toBe('warning')
    expect(resolveClientStatusTone('disabled')).toBe('neutral')
    expect(resolveClientStatusTone('decommissioned')).toBe('neutral')
    expect(resolveClientStatusTone(null)).toBe('neutral')
    expect(resolveClientStatusTone(undefined)).toBe('neutral')
    expect(resolveClientStatusTone('something-unknown')).toBe('neutral')
  })
})

describe('no-secret invariant (DTO boundary)', () => {
  it('the sample DTOs carry has_secret_hash only — never a client_secret field/value', () => {
    const blob = JSON.stringify({ sample, detail })
    expect(blob).not.toMatch(/client_secret/u)
    expect(blob).not.toMatch(/clientSecret/u)
    expect(blob).not.toMatch(/plaintext/u)
    expect(blob).toMatch(/has_secret_hash/u)
  })
})
