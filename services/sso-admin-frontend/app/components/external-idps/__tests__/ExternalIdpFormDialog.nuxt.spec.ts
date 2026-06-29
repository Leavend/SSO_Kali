import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ExternalIdpFormDialog from '../ExternalIdpFormDialog.vue'
import type { ExternalIdentityProvider } from '@/types/external-idps.types'

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const PROVIDER: ExternalIdentityProvider = {
  provider_key: 'acme',
  display_name: 'Acme IdP',
  issuer: 'https://idp.acme.test',
  metadata_url: 'https://idp.acme.test/.well-known/openid-configuration',
  client_id: 'sso-client',
  allowed_algorithms: ['RS256'],
  scopes: ['openid'],
  priority: 100,
  enabled: true,
  is_backup: false,
  tls_validation_enabled: true,
  signature_validation_enabled: false,
  has_client_secret: true,
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('ExternalIdpFormDialog — create mode', () => {
  it('starts blank and blocks submit with field errors on empty required fields', async () => {
    const wrapper = await mountSuspended(ExternalIdpFormDialog, {
      props: { open: true, mode: 'create' as const },
    })
    await wrapper.find('[data-testid="external-idp-form"]').trigger('submit')
    expect(wrapper.emitted('submit')).toBeFalsy()
    // a field error rendered for the empty required key
    expect(wrapper.find('[data-testid="external-idp-form"]').text()).toContain(
      'external_idps.field_required',
    )
  })

  it('emits a create payload with a non-empty secret and split algorithms', async () => {
    const wrapper = await mountSuspended(ExternalIdpFormDialog, {
      props: { open: true, mode: 'create' as const },
    })
    await wrapper.find('[data-testid="idp-field-provider_key"]').setValue('acme')
    await wrapper.find('[data-testid="idp-field-display_name"]').setValue('Acme IdP')
    await wrapper.find('[data-testid="idp-field-issuer"]').setValue('https://idp.acme.test')
    await wrapper.find('[data-testid="idp-field-metadata_url"]').setValue('https://idp.acme.test/m')
    await wrapper.find('[data-testid="idp-field-client_id"]').setValue('sso-client')
    await wrapper.find('[data-testid="idp-field-client_secret"]').setValue('topsecret')
    await wrapper.find('[data-testid="idp-field-algorithms"]').setValue('RS256, ES256')
    await wrapper.find('[data-testid="external-idp-form"]').trigger('submit')
    const events = wrapper.emitted('submit')
    expect(events).toBeTruthy()
    expect(events![0]![0]).toMatchObject({
      provider_key: 'acme',
      client_secret: 'topsecret',
      allowed_algorithms: ['RS256', 'ES256'],
    })
  })
})

describe('ExternalIdpFormDialog — edit mode', () => {
  it('prefills from the provider but leaves the secret blank, and emits an update payload omitting the blank secret', async () => {
    const wrapper = await mountSuspended(ExternalIdpFormDialog, {
      props: { open: true, mode: 'edit' as const, provider: PROVIDER },
    })
    expect(
      (wrapper.find('[data-testid="idp-field-display_name"]').element as HTMLInputElement).value,
    ).toBe('Acme IdP')
    expect(
      (wrapper.find('[data-testid="idp-field-client_secret"]').element as HTMLInputElement).value,
    ).toBe('')
    // provider_key is immutable in edit mode
    expect(
      wrapper.find('[data-testid="idp-field-provider_key"]').attributes('disabled'),
    ).toBeDefined()
    await wrapper.find('[data-testid="idp-field-display_name"]').setValue('Acme Renamed')
    await wrapper.find('[data-testid="external-idp-form"]').trigger('submit')
    const events = wrapper.emitted('submit')
    expect(events).toBeTruthy()
    const payload = events![0]![0] as Record<string, unknown>
    expect(payload.display_name).toBe('Acme Renamed')
    expect('client_secret' in payload).toBe(false) // blank secret omitted
    expect(payload.tls_validation_enabled).toBe(true) // edit-only switch present
  })

  it('renders the safe errorMessage + a redacted REF + the step-up link', async () => {
    const wrapper = await mountSuspended(ExternalIdpFormDialog, {
      props: {
        open: true,
        mode: 'create' as const,
        errorMessage: 'A provider with that key already exists.',
        requestId: 'req-dup-123',
        stepUpUrl: 'https://idp.example/step-up',
      },
    })
    expect(wrapper.find('[data-testid="external-idp-form-error"]').text()).toContain(
      'already exists',
    )
    expect(wrapper.find('[data-testid="external-idp-form-ref"]').text()).toMatch(/^REF-/u)
    expect(wrapper.html()).not.toContain('req-dup-123') // raw id never rendered
    expect(wrapper.find('[data-testid="external-idp-form-stepup"]').attributes('href')).toBe(
      'https://idp.example/step-up',
    )
  })
})
