import { describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import SsoErrorTemplateFormDialog from '@/components/sso-error-templates/SsoErrorTemplateFormDialog.vue'
import type { SsoErrorTemplate } from '@/types/sso-error-templates.types'

// Mirror IpAccessRuleFormDialog.nuxt.spec.ts: a key-returning t() keeps the
// assertions locale-independent (the real default locale is 'id').
vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const template: SsoErrorTemplate = {
  error_code: 'access_denied',
  locale: 'en',
  title: 'Access denied',
  message: 'You do not have access.',
  action_label: 'Back to sign-in',
  action_url: 'https://sso.example/help',
  retry_allowed: false,
  alternative_login_allowed: true,
  is_enabled: true,
}

describe('SsoErrorTemplateFormDialog', () => {
  it('prefills the inputs from the selected template on open', async () => {
    const wrapper = await mountSuspended(SsoErrorTemplateFormDialog, {
      props: { open: true, template },
    })
    const title = wrapper.find('[data-testid="sso-template-field-title"]')
      .element as HTMLInputElement
    expect(title.value).toBe('Access denied')
  })

  it('emits submit with the carried-through locale + edited copy when valid', async () => {
    const wrapper = await mountSuspended(SsoErrorTemplateFormDialog, {
      props: { open: true, template },
    })
    await wrapper.get('[data-testid="sso-template-form"]').trigger('submit')
    const payload = wrapper.emitted('submit')?.[0]?.[0]
    expect(payload).toMatchObject({ locale: 'en', title: 'Access denied' })
  })

  it('blocks submit and shows a field error when title is cleared', async () => {
    const wrapper = await mountSuspended(SsoErrorTemplateFormDialog, {
      props: { open: true, template },
    })
    await wrapper.get('[data-testid="sso-template-field-title"]').setValue('')
    await wrapper.get('[data-testid="sso-template-form"]').trigger('submit')
    expect(wrapper.emitted('submit')).toBeUndefined()
  })

  it('renders a step-up link and a redacted reference when provided', async () => {
    const wrapper = await mountSuspended(SsoErrorTemplateFormDialog, {
      props: {
        open: true,
        template,
        errorMessage: 'Could not save',
        requestId: 'req-abcdef12',
        stepUpUrl: '/admin/step-up?next=/sso-error-templates',
      },
    })
    expect(wrapper.find('[data-testid="sso-template-form-stepup"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="sso-template-form-ref"]').text()).toContain('REF-')
  })
})
