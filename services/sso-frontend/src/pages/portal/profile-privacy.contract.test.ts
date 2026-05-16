import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError } from '@/lib/api/api-error'
import { useProfileStore } from '@/stores/profile.store'
import ProfilePage from './ProfilePage.vue'

vi.mock('@/services/profile.api', () => ({
  profileApi: {
    getProfile: vi.fn().mockResolvedValue({
      profile: {
        subject_id: 'sub-sensitive-123',
        display_name: null,
        given_name: null,
        family_name: null,
        email: null,
        status: 'active',
        last_login_at: null,
        password: 'NeverRender123!',
        subject_uuid: 'uuid-secret',
        phone_number: '+6200000000',
      },
      authorization: { scope: '', roles: [], permissions: [] },
      security: { session_id: 'session-secret', risk_score: 0, mfa_required: false, last_seen_at: null },
    }),
    updateProfile: vi.fn().mockRejectedValue(
      new ApiError(500, 'Layanan SSO sedang tidak tersedia. Coba lagi nanti.', 'server_error'),
    ),
  },
}))

describe('ProfilePage minimization contract', () => {
  it('renders only approved profile fields and ignores extra PII from the backend', async () => {
    setActivePinia(createPinia())
    const wrapper = mount(ProfilePage, { global: { stubs: { Skeleton: true } } })
    await flush()

    const approved = wrapper.find('[data-testid="profile-approved-fields"]')

    expect(approved.text()).toContain('Nama Tampilan')
    expect(approved.text()).toContain('Email')
    expect(approved.text()).toContain('Status')
    expect(wrapper.text()).not.toContain('sub-sensitive-123')
    expect(wrapper.text()).not.toContain('uuid-secret')
    expect(wrapper.text()).not.toContain('NeverRender123!')
    expect(wrapper.text()).not.toContain('+6200000000')
  })

  it('degrades gracefully when optional profile fields are absent', async () => {
    setActivePinia(createPinia())
    const wrapper = mount(ProfilePage, { global: { stubs: { Skeleton: true } } })
    await flush()

    expect(wrapper.text()).toContain('Belum tersedia')
    expect(wrapper.text()).not.toContain('null')
    expect(wrapper.text()).not.toContain('undefined')
  })

  it('uses the central safe error presenter instead of raw thrown messages', async () => {
    setActivePinia(createPinia())
    const store = useProfileStore()
    store.profile = {
      profile: { subject_id: 'sub', display_name: 'User', status: 'active' },
      authorization: { scope: '', roles: [], permissions: [] },
      security: { session_id: 's', risk_score: 0, mfa_required: false, last_seen_at: null },
    }
    const wrapper = mount(ProfilePage, { global: { stubs: { Skeleton: true } } })
    await wrapper.find('#profile-display-name').setValue('Updated User')
    await wrapper.find('form').trigger('submit.prevent')
    await flush()

    expect(wrapper.text()).toContain('Layanan SSO sedang tidak tersedia. Coba lagi nanti.')
    expect(wrapper.text()).not.toContain('SQLSTATE')
    expect(wrapper.text()).not.toContain('Stack trace')
  })
})

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
  await nextTick()
}
