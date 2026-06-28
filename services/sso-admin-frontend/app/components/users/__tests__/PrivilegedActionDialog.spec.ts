import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PrivilegedActionDialog from '../PrivilegedActionDialog.vue'

function render(props: Record<string, unknown> = {}) {
  return mount(PrivilegedActionDialog, {
    props: {
      open: true,
      title: 'Lock account',
      description: 'This signs the user out of every device and blocks new logins.',
      confirmLabel: 'Lock account',
      cancelLabel: 'Cancel',
      ...props,
    },
  })
}

describe('PrivilegedActionDialog', () => {
  it('shows the impact summary before submit', () => {
    const wrapper = render()
    expect(wrapper.get('[data-testid="privileged-action-impact"]').text()).toContain(
      'signs the user out of every device',
    )
  })

  it('primary destructive button is disabled until the required reason is valid', async () => {
    const wrapper = render({
      danger: true,
      reasonLabel: 'Reason',
      reasonRequired: true,
      reasonMax: 255,
      reason: '',
    })
    const confirm = wrapper.get('[data-testid="privileged-action-confirm"]')
    expect(confirm.attributes('disabled')).toBeDefined()

    await wrapper.setProps({ reason: 'Compromised credentials reported by user.' })
    expect(
      wrapper.get('[data-testid="privileged-action-confirm"]').attributes('disabled'),
    ).toBeUndefined()
  })

  it('emits update:reason as the operator types', async () => {
    const wrapper = render({ reasonLabel: 'Reason', reasonRequired: true })
    await wrapper.get('[data-testid="privileged-action-reason"]').setValue('Policy violation.')
    expect(wrapper.emitted('update:reason')?.at(-1)).toEqual(['Policy violation.'])
  })

  it('confirm button is disabled while submitting (no double-submit)', () => {
    const wrapper = render({ submitting: true })
    expect(
      wrapper.get('[data-testid="privileged-action-confirm"]').attributes('disabled'),
    ).toBeDefined()
  })

  it('cancel emits cancel and never confirm (cancel calls no API)', async () => {
    const wrapper = render()
    await wrapper.get('[data-testid="privileged-action-cancel"]').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('confirm emits confirm when enabled', async () => {
    const wrapper = render()
    await wrapper.get('[data-testid="privileged-action-confirm"]').trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })

  it('4.7 — renders a step-up notice/link when stepUpUrl is present', () => {
    const wrapper = render({
      stepUpUrl: '/auth/login?prompt=login',
      stepUpLabel: 'Re-authenticate',
    })
    const stepUp = wrapper.get('[data-testid="privileged-action-stepup"]')
    expect(stepUp.text()).toContain('Re-authenticate')
    expect(stepUp.get('a').attributes('href')).toBe('/auth/login?prompt=login')
  })

  it('4.8/4.9 — shows safe error copy + a REDACTED support reference, never the raw request id', () => {
    const wrapper = render({
      errorMessage: 'The action could not be completed. Please try again.',
      requestId: 'b3f1c2d4-aaaa-bbbb-cccc-1234567890ab',
    })
    const error = wrapper.get('[data-testid="privileged-action-error"]')
    expect(error.text()).toContain('could not be completed')
    // Correlation id is redacted to REF-XXXXXXXX; the raw id must NOT appear.
    expect(wrapper.get('[data-testid="privileged-action-ref"]').text()).toMatch(/^REF-[0-9A-Z]+$/)
    expect(wrapper.html()).not.toContain('b3f1c2d4-aaaa-bbbb-cccc-1234567890ab')
  })

  it('uses the danger confirm variant only when danger is set', () => {
    const danger = render({ danger: true })
    expect(danger.get('[data-testid="privileged-action-confirm"]').classes().join(' ')).toMatch(
      /danger/,
    )
  })
})
