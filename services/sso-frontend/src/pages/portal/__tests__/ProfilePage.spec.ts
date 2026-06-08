import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ProfilePage from '../ProfilePage.vue'
import { profileApi } from '@/services/profile.api'

vi.mock('@/services/profile.api', () => ({
  profileApi: {
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
  },
}))

const profileFixture = {
  profile: {
    subject_id: 'sub_preview_user',
    display_name: 'Bontang Preview User',
    given_name: 'Bontang',
    family_name: 'Preview User',
    email: 'preview.user@dev-sso.local',
    email_verified: true,
    status: 'active',
    profile_synced_at: '2026-05-20T16:00:00Z',
    last_login_at: '2026-05-20T18:25:00Z',
  },
  authorization: { scope: 'openid profile email', roles: ['portal-user'], permissions: [] },
  security: {
    session_id: 'sess_preview_current',
    mfa_required: true,
    last_seen_at: '2026-05-20T18:42:00Z',
  },
} as const

describe('ProfilePage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(profileApi.getProfile).mockResolvedValue(profileFixture)
    vi.mocked(profileApi.updateProfile).mockResolvedValue(profileFixture)
  })

  async function mountProfilePage(): Promise<ReturnType<typeof mount>> {
    const wrapper = mount(ProfilePage, {
      global: {
        stubs: {
          Skeleton: true,
        },
      },
    })

    await flushPromises()
    await nextTick()
    return wrapper
  }

  it('keeps every word from display name in editable name fields', async () => {
    const wrapper = await mountProfilePage()

    expect(wrapper.find('#profile-display-name').element).toHaveProperty(
      'value',
      'Bontang Preview User',
    )
    expect(wrapper.find('#profile-given-name').element).toHaveProperty('value', 'Bontang')
    expect(wrapper.find('#profile-family-name').element).toHaveProperty('value', 'Preview User')
    expect(wrapper.text()).toContain(
      'Nama depan dan nama belakang digabungkan otomatis sebagai nama tampilan',
    )
    expect(wrapper.text()).toContain('dihasilkan otomatis — bisa diubah manual')
  })

  it('keeps first and last name controls aligned with one shared helper row', async () => {
    const wrapper = await mountProfilePage()

    const nameFields = wrapper.find('[data-testid="profile-name-fields"]')
    const givenNameField = wrapper.find('[data-testid="profile-given-name-field"]')
    const familyNameField = wrapper.find('[data-testid="profile-family-name-field"]')
    const helper = wrapper.find('[data-testid="profile-name-helper"]')

    expect(nameFields.classes()).toContain('sm:items-start')
    expect(givenNameField.classes()).toContain('content-start')
    expect(familyNameField.classes()).toContain('content-start')
    expect(familyNameField.text()).not.toContain('Digabungkan otomatis sebagai nama tampilan.')
    expect(helper.text()).toContain(
      'Nama depan dan nama belakang digabungkan otomatis sebagai nama tampilan.',
    )
  })

  it('provides avatar upload affordance and changeable identity context', async () => {
    const wrapper = await mountProfilePage()

    expect(wrapper.find('[data-testid="profile-avatar-upload"]').text()).toContain('BPU')
    expect(wrapper.text()).toContain('Klik avatar untuk mengubah foto profil')
    expect(wrapper.text()).toContain('JPG, PNG, WebP · Maks 2MB')
    expect(wrapper.text()).toContain('preview.user@dev-sso.local')
    expect(wrapper.text()).toContain('Ganti Email')
    expect(wrapper.text()).toContain('Aktif')
    expect(wrapper.text()).not.toContain('active')
    expect(wrapper.text()).toContain('Status akun')
  })

  it('resets edits when the user cancels changes', async () => {
    const wrapper = await mountProfilePage()

    const displayNameInput = wrapper.find('#profile-display-name')
    await displayNameInput.setValue('Bontang Preview UserXXX')
    await nextTick()

    expect(
      wrapper.find('[data-testid="profile-save-button"]').attributes('disabled'),
    ).toBeUndefined()
    expect(wrapper.find('[data-testid="profile-cancel-button"]').exists()).toBe(true)

    await wrapper.find('[data-testid="profile-cancel-button"]').trigger('click')
    await nextTick()

    expect(displayNameInput.element).toHaveProperty('value', 'Bontang Preview User')
    expect(wrapper.find('[data-testid="profile-save-button"]').attributes()).toHaveProperty(
      'disabled',
    )
    expect(wrapper.text()).not.toContain('Tidak ada perubahan yang perlu disimpan')
    expect(wrapper.find('[data-testid="profile-save-button"]').attributes('title')).toBeUndefined()
  })

  it('submits updates, shows success feedback, and avoids duplicated security metadata', async () => {
    const wrapper = await mountProfilePage()

    await wrapper.find('#profile-given-name').setValue('Bontang Baru')
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()
    await nextTick()

    expect(profileApi.updateProfile).toHaveBeenCalledWith({
      display_name: 'Bontang Preview User',
      given_name: 'Bontang Baru',
      family_name: 'Preview User',
    })
    expect(wrapper.text()).toContain('Profil berhasil diperbarui')
    expect(wrapper.text()).not.toContain('Login Terakhir')
    expect(wrapper.text()).not.toContain('02.25.00')
    expect(wrapper.text()).not.toContain('integritas direktori')
  })
})
