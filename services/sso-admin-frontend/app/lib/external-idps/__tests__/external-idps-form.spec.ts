import { describe, expect, it } from 'vitest'
import {
  buildCreatePayload,
  buildUpdatePayload,
  validateProviderForm,
  type ExternalIdpFormModel,
} from '../external-idps-form'

const base: ExternalIdpFormModel = {
  provider_key: 'acme',
  display_name: 'Acme IdP',
  issuer: 'https://idp.acme.test',
  metadata_url: 'https://idp.acme.test/.well-known/openid-configuration',
  client_id: 'sso-client',
  client_secret: '',
  algorithms: 'RS256, ES256',
  scopes: 'openid, profile',
  priority: '100',
  enabled: true,
  is_backup: false,
  tls_validation_enabled: true,
  signature_validation_enabled: true,
}

describe('validateProviderForm (create)', () => {
  it('passes a complete valid form', () => {
    expect(validateProviderForm(base, 'create')).toEqual({ valid: true, fieldErrors: {} })
  })
  it('flags each missing required field', () => {
    const r = validateProviderForm(
      { ...base, provider_key: '', display_name: '  ', client_id: '' },
      'create',
    )
    expect(r.valid).toBe(false)
    expect(Object.keys(r.fieldErrors).sort()).toEqual(['client_id', 'display_name', 'provider_key'])
  })
  it('flags a bad provider_key shape', () => {
    expect(
      validateProviderForm({ ...base, provider_key: 'Bad Key!' }, 'create').fieldErrors
        .provider_key,
    ).toBeTruthy()
  })
  it('flags non-https issuer/metadata', () => {
    const r = validateProviderForm(
      { ...base, issuer: 'http://x', metadata_url: 'ftp://y' },
      'create',
    )
    expect(r.fieldErrors.issuer).toBeTruthy()
    expect(r.fieldErrors.metadata_url).toBeTruthy()
  })
})

describe('validateProviderForm (edit)', () => {
  it('does not require provider_key (immutable on edit) and passes a valid edit', () => {
    expect(validateProviderForm({ ...base, provider_key: '' }, 'edit')).toEqual({
      valid: true,
      fieldErrors: {},
    })
  })
  it('still rejects a non-https metadata_url when present', () => {
    expect(
      validateProviderForm({ ...base, metadata_url: 'http://x' }, 'edit').fieldErrors.metadata_url,
    ).toBeTruthy()
  })
})

describe('buildCreatePayload', () => {
  it('splits comma fields, coerces priority, and includes a non-empty secret', () => {
    expect(buildCreatePayload({ ...base, client_secret: 'topsecret' })).toEqual({
      provider_key: 'acme',
      display_name: 'Acme IdP',
      issuer: 'https://idp.acme.test',
      metadata_url: 'https://idp.acme.test/.well-known/openid-configuration',
      client_id: 'sso-client',
      client_secret: 'topsecret',
      allowed_algorithms: ['RS256', 'ES256'],
      scopes: ['openid', 'profile'],
      priority: 100,
      enabled: true,
      is_backup: false,
    })
  })
  it('omits client_secret when blank', () => {
    expect(buildCreatePayload(base).client_secret).toBeUndefined()
  })
})

describe('buildUpdatePayload', () => {
  it('omits client_secret when blank (keep existing) and includes the edit-only switches', () => {
    const p = buildUpdatePayload(base)
    expect(p.client_secret).toBeUndefined()
    expect(p.tls_validation_enabled).toBe(true)
    expect(p.signature_validation_enabled).toBe(true)
    expect(p.allowed_algorithms).toEqual(['RS256', 'ES256'])
  })
  it('includes a freshly typed secret', () => {
    expect(buildUpdatePayload({ ...base, client_secret: 'rotated' }).client_secret).toBe('rotated')
  })
})

describe('payload builders — cleared optional fields are omitted (not 0/[])', () => {
  it('omits priority/algorithms/scopes when the operator clears them', () => {
    const cleared: ExternalIdpFormModel = { ...base, priority: '', algorithms: '', scopes: '' }
    const create = buildCreatePayload(cleared)
    expect('priority' in create).toBe(false)
    expect('allowed_algorithms' in create).toBe(false)
    expect('scopes' in create).toBe(false)
    const update = buildUpdatePayload(cleared)
    expect('priority' in update).toBe(false)
    expect('allowed_algorithms' in update).toBe(false)
    expect('scopes' in update).toBe(false)
  })
})
