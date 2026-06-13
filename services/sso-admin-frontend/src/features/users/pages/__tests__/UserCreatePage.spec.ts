import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useSessionStore } from '@/stores/session.store'
import UserCreatePage from '../UserCreatePage.vue'
import FormPageShell from '@/components/form/FormPageShell.vue'
import { useUsersStore } from '../../stores/users.store'
import { useI18n } from '@/composables/useI18n'

const pushSpy = vi.fn<(to: any) => any>()
vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: pushSpy,
  }),
}))

vi.mock('../../services/users.api', () => ({
  usersApi: {
    create: vi.fn<() => Promise<unknown>>(),
    list: vi.fn<() => Promise<unknown>>(),
    show: vi.fn<() => Promise<unknown>>(),
  },
}))

describe('UserCreatePage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    pushSpy.mockClear()
    useI18n().setLocale('en')
    useSessionStore().setPrincipal({
      subject_id: 'admin-1',
      email: 'admin@example.test',
      display_name: 'Admin One',
      role: 'admin',
      last_login_at: null,
      auth_context: {
        auth_time: null,
        amr: [],
        acr: null,
        mfa_enforced: false,
        mfa_verified: false,
      },
      permissions: {
        view_admin_panel: true,
        manage_sessions: true,
        capabilities: { 'admin.users.write': true },
        permissions: ['admin.users.write'],
        menus: [],
      },
    })
  })

  it('renders user creation fields', () => {
    const wrapper = mount(UserCreatePage)
    expect(wrapper.text()).toContain('Create User')
    expect(wrapper.find('input[name="create_email"]').exists()).toBe(true)
    expect(wrapper.find('input[name="create_display_name"]').exists()).toBe(true)
  })

  it('submits user creation successfully', async () => {
    const store = useUsersStore()
    const createSpy = vi.spyOn(store, 'createUser').mockImplementation(async () => {
      store.actionStatus = 'success'
      store.deliveryStatus = 'queued'
    })

    const wrapper = mount(UserCreatePage)
    await wrapper.find('input[name="create_email"]').setValue('ayu@example.test')
    await wrapper.find('input[name="create_given_name"]').setValue('Ayu')
    await wrapper.find('input[name="create_family_name"]').setValue('Lestari')
    await wrapper.findComponent(FormPageShell).vm.$emit('submit')

    expect(createSpy).toHaveBeenCalledWith({
      email: 'ayu@example.test',
      display_name: 'Ayu Lestari',
      given_name: 'Ayu',
      family_name: 'Lestari',
      role: 'user',
      local_account_enabled: true,
    })
    expect(pushSpy).toHaveBeenCalledWith({ name: 'admin.users' })
  })
})
