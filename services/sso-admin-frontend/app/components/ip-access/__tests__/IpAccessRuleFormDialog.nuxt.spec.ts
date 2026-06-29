// app/components/ip-access/__tests__/IpAccessRuleFormDialog.nuxt.spec.ts
// Mirrors the shipped ExternalIdpFormDialog.nuxt.spec.ts: nuxt env (mountSuspended,
// for the teleported dialog), t returns the key, and submit is triggered on the
// FORM element (a bare <button type=submit> click does NOT fire @submit.prevent in
// this test env — proven by the shipped dialog tests).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import IpAccessRuleFormDialog from '../IpAccessRuleFormDialog.vue'
import type { IpAccessRuleCreatePayload } from '@/types/ip-access.types'

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

afterEach(() => {
  vi.clearAllMocks()
})

describe('IpAccessRuleFormDialog — create', () => {
  it('blocks submit and surfaces field errors on empty required fields', async () => {
    const wrapper = await mountSuspended(IpAccessRuleFormDialog, { props: { open: true } })
    await wrapper.find('[data-testid="ip-access-form"]').trigger('submit')
    expect(wrapper.emitted('submit')).toBeFalsy()
    expect(wrapper.find('[data-testid="ip-access-form"]').text()).toContain(
      'ip_access.field_required',
    )
  })

  it('emits a built create payload for a valid form (default mode block)', async () => {
    const wrapper = await mountSuspended(IpAccessRuleFormDialog, { props: { open: true } })
    await wrapper.find('[data-testid="ip-access-field-cidr"]').setValue('203.0.113.0/24')
    await wrapper.find('[data-testid="ip-access-field-reason"]').setValue('maintenance')
    await wrapper.find('[data-testid="ip-access-form"]').trigger('submit')
    const events = wrapper.emitted('submit')
    expect(events).toBeTruthy()
    expect(events![0]![0] as IpAccessRuleCreatePayload).toEqual({
      cidr: '203.0.113.0/24',
      mode: 'block',
      reason: 'maintenance',
    })
  })

  it('renders a SAFE error banner + redacted REF (never the raw request id)', async () => {
    const wrapper = await mountSuspended(IpAccessRuleFormDialog, {
      props: {
        open: true,
        errorMessage: 'The rule could not be saved.',
        requestId: 'req-abc12345',
      },
    })
    expect(wrapper.find('[data-testid="ip-access-form-error"]').text()).toContain(
      'The rule could not be saved.',
    )
    expect(wrapper.find('[data-testid="ip-access-form-ref"]').text()).toMatch(/^REF-/u)
    expect(wrapper.html()).not.toContain('req-abc12345')
  })

  it('renders a step-up link when stepUpUrl is set', async () => {
    const wrapper = await mountSuspended(IpAccessRuleFormDialog, {
      props: { open: true, stepUpUrl: 'https://idp.example/step-up' },
    })
    expect(wrapper.find('[data-testid="ip-access-form-stepup"]').attributes('href')).toBe(
      'https://idp.example/step-up',
    )
  })
})
