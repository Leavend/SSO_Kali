import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SecurityPasswordForm from '../SecurityPasswordForm.vue'
import { passwordRequirementStatuses, passwordStrengthSummary } from '@/lib/auth/password-policy'
import type { ChangePasswordPayload } from '@/types/profile.types'

const form: ChangePasswordPayload = {
  current_password: 'OldPassword123!',
  new_password: 'NewSecure456!',
  new_password_confirmation: 'NewSecure456!',
}

describe('SecurityPasswordForm', () => {
  function mountForm(canSubmit = true, password = form.new_password) {
    return mount(SecurityPasswordForm, {
      props: {
        form: { ...form, new_password: password },
        errors: {},
        strengthItems: [],
        strengthRequirements: passwordRequirementStatuses(password),
        strengthSummary: passwordStrengthSummary(password),
        isPending: false,
        canSubmit,
      },
    })
  }

  it('renders show-hide controls, strength checklist, and progress bar', async () => {
    const wrapper = mountForm()
    const revealButtons = wrapper.findAll('button[aria-label="Tampilkan password"]')
    const newPasswordInput = wrapper.find('input#new_password')
    const strengthBar = wrapper.find('[data-testid="password-strength-bar"]')

    expect(revealButtons).toHaveLength(3)
    expect(wrapper.find('[data-testid="password-strength-label"]').text()).toContain('Kuat · 5/5')
    expect(wrapper.text()).toContain('Minimal 12 karakter')
    expect(wrapper.text()).toContain('Karakter spesial')
    expect(wrapper.text()).toContain('* Semua kolom wajib diisi')
    expect(strengthBar.attributes('style')).toContain('width: 100%')

    await revealButtons[1]?.trigger('click')
    expect(newPasswordInput.attributes('type')).toBe('text')
  })

  it('invites typing in the empty password strength state', () => {
    const wrapper = mountForm(false, '')

    expect(wrapper.find('[data-testid="password-strength-label"]').text()).toContain(
      'Mulai mengetik untuk melihat kekuatan password · 0/5',
    )
  })

  it('emits field updates and blocks submit when password is not ready', async () => {
    const wrapper = mountForm(false)

    await wrapper.find('input#new_password').setValue('short')
    await wrapper.find('form').trigger('submit.prevent')
    const cancelButton = wrapper.findAll('button').find((button) => button.text() === 'Batal')
    await cancelButton?.trigger('click')

    expect(wrapper.emitted('update:field')?.[0]).toEqual(['new_password', 'short'])
    expect(wrapper.emitted('submit')).toHaveLength(1)
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })
})
