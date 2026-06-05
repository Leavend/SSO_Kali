import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useSessionStore } from '@/stores/session.store'
import RolesPage from '../RolesPage.vue'
import { useRolesStore } from '../../stores/roles.store'
import type { AdminRole, AdminPermission } from '../../types'

vi.mock('../../services/roles.api', () => ({
  rolesApi: {
    listRoles: vi.fn<() => Promise<unknown>>(),
    listPermissions: vi.fn<() => Promise<unknown>>(),
    createRole: vi.fn<() => Promise<unknown>>(),
    updateRole: vi.fn<() => Promise<unknown>>(),
    deleteRole: vi.fn<() => Promise<unknown>>(),
    syncRolePermissions: vi.fn<() => Promise<unknown>>(),
  },
}))

const mockRole: AdminRole = {
  slug: 'custom-role',
  label: 'Custom Role Label',
  description: 'Custom description here',
  is_system: false,
  permissions: ['admin.users.read'],
  user_count: 5,
}

const mockSystemRole: AdminRole = {
  slug: 'admin',
  label: 'Administrator',
  description: 'System admin role',
  is_system: true,
  permissions: ['admin.users.read', 'admin.roles.read'],
  user_count: 1,
}

const mockPermission: AdminPermission = {
  key: 'admin.users.read',
  label: 'Read Users',
  group: 'Users',
}

function seedPrincipal(capabilities: Record<string, boolean>): void {
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
      manage_sessions: false,
      capabilities,
      permissions: Object.keys(capabilities),
      menus: [],
    },
  })
}

describe('RolesPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    seedPrincipal({
      'admin.roles.write': true,
    })
  })

  it('renders roles list, system tags, user counts, and permissions matrix', () => {
    const store = useRolesStore()
    store.status = 'success'
    store.roles = [mockRole, mockSystemRole]
    store.permissions = [mockPermission]

    const wrapper = mount(RolesPage)

    expect(wrapper.text()).toContain('Roles & Permissions')
    expect(wrapper.text()).toContain('Custom Role Label')
    expect(wrapper.text()).toContain('custom-role')
    expect(wrapper.text()).toContain('5 users')
    expect(wrapper.text()).toContain('System Role')
    expect(wrapper.text()).toContain('admin.users.read')
  })

  it('hides edit and delete controls for system roles', () => {
    const store = useRolesStore()
    store.status = 'success'
    store.roles = [mockRole, mockSystemRole]

    const wrapper = mount(RolesPage)

    // Custom role card should have Edit and Delete buttons
    const customCard = wrapper.find('[aria-label="Role: Custom Role Label"]')
    expect(customCard.text()).toContain('Edit')
    expect(customCard.text()).toContain('Delete')

    // System role card should NOT have Edit and Delete buttons
    const systemCard = wrapper.find('[aria-label="Role: Administrator"]')
    expect(systemCard.text()).not.toContain('Edit')
    expect(systemCard.text()).not.toContain('Delete')
    // But it should have Manage Permissions button
    expect(systemCard.text()).toContain('Manage Permissions')
  })

  it('hides write actions completely for read-only principals', () => {
    seedPrincipal({}) // No write permissions
    const store = useRolesStore()
    store.status = 'success'
    store.roles = [mockRole]

    const wrapper = mount(RolesPage)

    expect(wrapper.find('.create-role-btn').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Edit')
    expect(wrapper.text()).not.toContain('Delete')
    expect(wrapper.text()).not.toContain('Manage Permissions')
  })

  it('submits create role payload and opens create dialog modal', async () => {
    const store = useRolesStore()
    store.status = 'success'
    store.roles = []
    const createSpy = vi.spyOn(store, 'createRole').mockResolvedValue()

    const wrapper = mount(RolesPage)

    await wrapper.find('.create-role-btn').trigger('click')

    // Modal is open
    expect(wrapper.find('h3#create-role-title').exists()).toBe(true)

    // Fill the inputs
    await wrapper.find('input#create-slug').setValue('test-role')
    await wrapper.find('input#create-name').setValue('Test Role')
    await wrapper.find('textarea#create-description').setValue('Descr')

    // Submit form
    await wrapper.find('form').trigger('submit')

    expect(createSpy).toHaveBeenCalledWith({
      slug: 'test-role',
      name: 'Test Role',
      description: 'Descr',
    })
  })

  it('requires destructive confirmations when deleting a role', async () => {
    const store = useRolesStore()
    store.status = 'success'
    store.roles = [mockRole]
    const deleteSpy = vi.spyOn(store, 'deleteRole').mockResolvedValue()

    const wrapper = mount(RolesPage)

    // Click Delete button by searching for button text
    const deleteBtn = wrapper.findAll('button').find((b) => b.text().includes('Delete'))!
    await deleteBtn.trigger('click')

    // Assert ConfirmDialog for delete is rendered
    expect(wrapper.find('[data-testid="confirm-dialog-confirm"]').exists()).toBe(true)
    expect(deleteSpy).not.toHaveBeenCalled()

    // Confirm the action
    await wrapper.find('[data-testid="confirm-dialog-confirm"]').trigger('click')
    expect(deleteSpy).toHaveBeenCalledWith('custom-role')
  })

  it('requires destructive confirmations when syncing permissions', async () => {
    const store = useRolesStore()
    store.status = 'success'
    store.roles = [mockRole]
    store.permissions = [mockPermission]
    const syncSpy = vi.spyOn(store, 'syncRolePermissions').mockResolvedValue()

    const wrapper = mount(RolesPage)

    // Click Manage Permissions button
    const managePermsBtn = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Manage Permissions'))!
    await managePermsBtn.trigger('click')

    // Toggle a checkbox in the modal
    const checkbox = wrapper.find('input.role-checkbox-input')
    await checkbox.setValue(true)

    // Submit the form
    await wrapper.find('form').trigger('submit')

    // Confirm dialog should be shown, api should not be called yet
    expect(wrapper.find('[data-testid="confirm-dialog-confirm"]').exists()).toBe(true)
    expect(syncSpy).not.toHaveBeenCalled()

    // Click confirm in the ConfirmDialog
    await wrapper.find('[data-testid="confirm-dialog-confirm"]').trigger('click')
    expect(syncSpy).toHaveBeenCalledWith('custom-role', ['admin.users.read'])
  })
})
