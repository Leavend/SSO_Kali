import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
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

function mountSuccess(
  roles: readonly AdminRole[] = [mockRole, mockSystemRole],
  permissions: readonly AdminPermission[] = [mockPermission],
) {
  const store = useRolesStore()
  store.status = 'success'
  store.roles = roles
  store.permissions = permissions
  return { store, wrapper: mount(RolesPage) }
}

function rowFor(wrapper: VueWrapper, text: string) {
  const row = wrapper.findAll('table.tbl tbody tr').find((r) => r.text().includes(text))
  if (!row) throw new Error(`No .tbl row found containing "${text}"`)
  return row
}

async function openDetailFor(wrapper: VueWrapper, text: string) {
  await rowFor(wrapper, text).trigger('click')
  return wrapper.find('.drawer-content')
}

describe('RolesPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    seedPrincipal({ 'admin.roles.write': true })
  })

  it('renders the roles as a .tbl table with name, slug, user count, and a status badge', () => {
    const { wrapper } = mountSuccess()

    const table = wrapper.find('table.tbl')
    expect(table.exists()).toBe(true)
    expect(table.text()).toContain('Custom Role Label')
    expect(table.text()).toContain('custom-role')
    expect(table.text()).toContain('Administrator')
    expect(table.text()).toContain('5 users')
    // System roles carry an explicit, non-colour-only status badge.
    expect(wrapper.find('.status[data-tone="info"]').exists()).toBe(true)
    expect(table.text()).toContain('System Role')
  })

  it('drops the legacy card grid in favour of the shared table', () => {
    const { wrapper } = mountSuccess()

    expect(wrapper.find('.roles-grid').exists()).toBe(false)
    expect(wrapper.find('.roles-card').exists()).toBe(false)
    expect(wrapper.find('.user-modal-overlay.roles-card').exists()).toBe(false)
  })

  it('opens a detail drawer with the role description and permissions when a row is clicked', async () => {
    const { wrapper } = mountSuccess()

    expect(wrapper.find('.drawer-content').exists()).toBe(false)

    const drawer = await openDetailFor(wrapper, 'Custom Role Label')

    expect(drawer.exists()).toBe(true)
    expect(drawer.attributes('role')).toBe('dialog')
    expect(drawer.text()).toContain('Custom description here')
    expect(drawer.text()).toContain('admin.users.read')
  })

  it('shows edit and delete in the drawer for custom roles but not system roles', async () => {
    const { wrapper } = mountSuccess()

    const customDrawer = await openDetailFor(wrapper, 'Custom Role Label')
    expect(customDrawer.text()).toContain('Edit')
    expect(customDrawer.text()).toContain('Delete')
    expect(customDrawer.text()).toContain('Manage Permissions')

    const systemDrawer = await openDetailFor(wrapper, 'Administrator')
    expect(systemDrawer.text()).not.toContain('Edit')
    expect(systemDrawer.text()).not.toContain('Delete')
    expect(systemDrawer.text()).toContain('Manage Permissions')
  })

  it('hides all write affordances for read-only principals but still allows viewing detail', async () => {
    seedPrincipal({})
    const { wrapper } = mountSuccess([mockRole])

    expect(wrapper.find('.create-role-btn').exists()).toBe(false)

    const drawer = await openDetailFor(wrapper, 'Custom Role Label')
    expect(drawer.exists()).toBe(true)
    expect(drawer.text()).not.toContain('Edit')
    expect(drawer.text()).not.toContain('Delete')
    expect(drawer.text()).not.toContain('Manage Permissions')
  })

  it('keeps the responsive action heading instead of inline desktop flex styles', () => {
    const { wrapper } = mountSuccess([mockRole])

    const heading = wrapper.get('.page-heading')
    expect(heading.classes()).toContain('page-heading--with-action')
    expect(heading.attributes('style')).toBeUndefined()
    expect(wrapper.get('.create-role-btn').classes()).toContain('create-role-btn')
  })

  it('submits the create role payload from the create dialog', async () => {
    const { store, wrapper } = mountSuccess([])
    const createSpy = vi.spyOn(store, 'createRole').mockResolvedValue()

    await wrapper.find('.create-role-btn').trigger('click')
    expect(wrapper.find('h3#create-role-title').exists()).toBe(true)

    await wrapper.find('input#create-slug').setValue('test-role')
    await wrapper.find('input#create-name').setValue('Test Role')
    await wrapper.find('textarea#create-description').setValue('Descr')
    await wrapper.find('form').trigger('submit')

    expect(createSpy).toHaveBeenCalledWith({
      slug: 'test-role',
      name: 'Test Role',
      description: 'Descr',
    })
  })

  it('requires destructive confirmation before deleting a role', async () => {
    const { store, wrapper } = mountSuccess([mockRole])
    const deleteSpy = vi.spyOn(store, 'deleteRole').mockResolvedValue()

    const drawer = await openDetailFor(wrapper, 'Custom Role Label')
    const deleteBtn = drawer.findAll('button').find((b) => b.text().includes('Delete'))!
    await deleteBtn.trigger('click')

    expect(wrapper.find('[data-testid="confirm-dialog-confirm"]').exists()).toBe(true)
    expect(deleteSpy).not.toHaveBeenCalled()

    await wrapper.find('[data-testid="confirm-dialog-confirm"]').trigger('click')
    expect(deleteSpy).toHaveBeenCalledWith('custom-role')
  })

  it('requires destructive confirmation before syncing permissions', async () => {
    const { store, wrapper } = mountSuccess([mockRole], [mockPermission])
    const syncSpy = vi.spyOn(store, 'syncRolePermissions').mockResolvedValue()

    const drawer = await openDetailFor(wrapper, 'Custom Role Label')
    const manageBtn = drawer.findAll('button').find((b) => b.text().includes('Manage Permissions'))!
    await manageBtn.trigger('click')

    await wrapper.find('input.role-checkbox-input').setValue(true)
    await wrapper.find('form').trigger('submit')

    expect(wrapper.find('[data-testid="confirm-dialog-confirm"]').exists()).toBe(true)
    expect(syncSpy).not.toHaveBeenCalled()

    await wrapper.find('[data-testid="confirm-dialog-confirm"]').trigger('click')
    expect(syncSpy).toHaveBeenCalledWith('custom-role', ['admin.users.read'])
  })

  it('renders a safe forbidden state without leaking backend internals', () => {
    const store = useRolesStore()
    store.status = 'forbidden'
    store.errorMessage = 'Kamu tidak memiliki izin untuk melihat roles & permissions.'

    const wrapper = mount(RolesPage)

    expect(wrapper.find('.ui-status-view').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('SQLSTATE')
  })

  it('renders an empty state when there is no data', () => {
    const store = useRolesStore()
    store.status = 'success'
    store.roles = []
    store.permissions = []

    const wrapper = mount(RolesPage)

    expect(wrapper.find('.ui-empty-state').exists()).toBe(true)
  })
})
