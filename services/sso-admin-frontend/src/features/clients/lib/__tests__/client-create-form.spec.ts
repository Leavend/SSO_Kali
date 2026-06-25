import { describe, expect, it } from 'vitest'
import {
  initialClientCreateForm,
  toClientCreatePayload,
  validateClientCreateForm,
  type ClientCreateForm,
} from '../client-create-form'

function validForm(overrides: Partial<ClientCreateForm> = {}): ClientCreateForm {
  return {
    clientId: 'customer-portal',
    displayName: 'Customer Portal',
    ownerEmail: 'owner@example.test',
    redirectUri: 'https://app.example.test/auth/callback',
    backchannelLogoutUri: '',
    clientType: 'public',
    category: 'publik',
    scopes: 'openid\nprofile\nemail',
    ...overrides,
  }
}

describe('client-create-form category', () => {
  it('starts with no category so the admin must choose explicitly', () => {
    expect(initialClientCreateForm().category).toBeNull()
  })

  it('flags a missing category as a required-field error', () => {
    const errors = validateClientCreateForm(validForm({ category: null }))

    expect(errors.category).toBe('clients.validation_category')
  })

  it('accepts an explicitly chosen category', () => {
    expect(validateClientCreateForm(validForm({ category: 'kepegawaian' })).category).toBeUndefined()
  })

  it('includes the chosen category in the create payload', () => {
    expect(toClientCreatePayload(validForm({ category: 'kepegawaian' })).category).toBe('kepegawaian')
  })

  it('refuses to build a payload until a category is chosen', () => {
    expect(() => toClientCreatePayload(validForm({ category: null }))).toThrow(
      'Client category must be selected before submitting.',
    )
  })
})
