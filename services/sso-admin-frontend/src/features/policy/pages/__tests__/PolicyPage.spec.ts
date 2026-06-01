import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useSessionStore } from '@/stores/session.store'
import PolicyPage from '../PolicyPage.vue'
import { usePolicyStore } from '../../stores/policy.store'
import type { AdminRole, SecurityPolicy } from '../../types'

vi.mock('../../services/policy.api', () => ({
  policyApi: {
    listPolicies: vi.fn<() => Promise<unknown>>(),
    proposePolicy: vi.fn<() => Promise<unknown>>(),
    activatePolicy: vi.fn<() => Promise<unknown>>(),
    rollbackPolicy: vi.fn<() => Promise<unknown>>(),
    listRoles: vi.fn<() => Promise<unknown>>(),
    listPermissions: vi.fn<() => Promise<unknown>>(),
    createRole: vi.fn<() => Promise<unknown>>(),
    updateRole: vi.fn<() => Promise<unknown>>(),
    syncRolePermissions: vi.fn<() => Promise<unknown>>(),
    deleteRole: vi.fn<() => Promise<unknown>>(),
    syncUserRoles: vi.fn<() => Promise<unknown>>(),
  },
}))

const policy: SecurityPolicy = {
  id: 1,
  category: 'password',
  version: 1,
  status: 'active',
  payload: { min_length: 12 },
  effective_at: '2026-05-27T00:00:00Z',
  activated_at: '2026-05-27T00:00:00Z',
  superseded_at: null,
  actor_subject_id: 'sub_admin',
  reason: 'Baseline',
  created_at: '2026-05-27T00:00:00Z',
  updated_at: '2026-05-27T00:00:00Z',
}

const role: AdminRole = {
  id: 1,
  slug: 'auditor',
  name: 'Auditor',
  description: 'Audit read-only',
  is_system: true,
  users_count: 2,
  permissions: [{ slug: 'admin.audit.read', name: 'Audit read', category: 'audit' }],
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
      manage_sessions: capabilities['admin.sessions.terminate'] === true,
      capabilities,
      permissions: Object.keys(capabilities),
      menus: [],
    },
  })
}

function seedFullAccessPrincipal(): void {
  seedPrincipal({
    'admin.security-policy.write': true,
    'admin.security-policy.activate': true,
    'admin.roles.write': true,
    'admin.sessions.terminate': true,
  })
}

describe('PolicyPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    seedFullAccessPrincipal()
  })

  it('renders security policy, RBAC, step-up evidence, and request ID', () => {
    const store = usePolicyStore()
    store.status = 'success'
    store.policies = [policy]
    store.roles = [role]
    store.permissions = role.permissions
    store.requestId = 'req-policy-1'

    const wrapper = mount(PolicyPage)

    expect(wrapper.text()).toContain('Policy & RBAC')
    expect(wrapper.text()).toContain('password')
    expect(wrapper.text()).toContain('version 1')
    expect(wrapper.text()).toContain('Auditor')
    expect(wrapper.text()).toContain('admin.audit.read')
    expect(wrapper.text()).toContain('Policy evidence')
    expect(wrapper.text()).toContain('Request ID')
    expect(wrapper.text()).toContain('req-policy-1')
    expect(wrapper.text()).not.toMatch(/Bearer|refreshToken|SQLSTATE/i)
  })

  it('renders safe forbidden state', () => {
    const store = usePolicyStore()
    store.status = 'forbidden'
    store.errorMessage = 'Kamu tidak memiliki izin untuk melihat policy/RBAC admin.'

    const wrapper = mount(PolicyPage)

    expect(wrapper.text()).toContain('Akses policy ditolak')
    expect(wrapper.text()).not.toContain('SQLSTATE')
  })

  it('renders empty state when no policy or RBAC evidence exists', () => {
    const store = usePolicyStore()
    store.status = 'success'
    store.policies = []
    store.roles = []
    store.permissions = []

    const wrapper = mount(PolicyPage)

    expect(wrapper.text()).toContain('Belum ada policy atau RBAC evidence untuk ditampilkan.')
    expect(wrapper.find('.ui-empty-state').exists()).toBe(true)
  })

  it('uses shared state, table, and form primitives', async () => {
    const store = usePolicyStore()
    store.status = 'loading'

    const wrapper = mount(PolicyPage)

    expect(wrapper.find('.ui-skeleton').exists()).toBe(true)

    store.status = 'forbidden'
    store.errorMessage = 'Kamu tidak memiliki izin untuk melihat policy/RBAC admin.'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.ui-status-view').exists()).toBe(true)

    store.status = 'success'
    store.policies = [policy]
    store.roles = [role]
    store.permissions = role.permissions
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.ui-data-list').exists()).toBe(true)
    expect(wrapper.find('.ui-form-field').exists()).toBe(true)
    expect(wrapper.find('.ui-control').exists()).toBe(true)
  })

  it('renders create role form with name, slug, description inputs', async () => {
    const store = usePolicyStore()
    store.status = 'success'
    store.policies = [policy]
    store.roles = [role]
    store.permissions = role.permissions

    const wrapper = mount(PolicyPage)

    expect(wrapper.text()).toContain('Create Role')
    await wrapper.find('button.create-role-toggle').trigger('click')
    expect(wrapper.find('input[name="create-role-name"]').exists()).toBe(true)
    expect(wrapper.find('input[name="create-role-slug"]').exists()).toBe(true)
    expect(wrapper.find('textarea[name="create-role-description"]').exists()).toBe(true)
  })

  it('hides delete button for system roles', () => {
    const store = usePolicyStore()
    store.status = 'success'
    store.policies = [policy]
    store.roles = [role]
    store.permissions = role.permissions

    const wrapper = mount(PolicyPage)

    expect(wrapper.text()).toContain('Auditor')
    expect(wrapper.find('button[aria-label="Delete role auditor"]').exists()).toBe(false)
  })

  it('hides policy and role write actions for read-only principals', () => {
    seedPrincipal({})
    const store = usePolicyStore()
    store.status = 'success'
    store.policies = [policy]
    store.roles = [{ ...role, is_system: false }]
    store.permissions = role.permissions

    const wrapper = mount(PolicyPage)

    expect(wrapper.text()).not.toContain('Create draft')
    expect(wrapper.text()).not.toContain('Activate')
    expect(wrapper.text()).not.toContain('Rollback')
    expect(wrapper.text()).not.toContain('Create Role')
    expect(wrapper.text()).not.toContain('Edit')
    expect(wrapper.text()).not.toContain('Delete')
  })

  it('requires session termination permission for role deletion', () => {
    seedPrincipal({ 'admin.roles.write': true })
    const store = usePolicyStore()
    store.status = 'success'
    store.policies = [policy]
    store.roles = [{ ...role, is_system: false }]
    store.permissions = role.permissions

    const wrapper = mount(PolicyPage)

    expect(wrapper.text()).toContain('Create Role')
    expect(wrapper.text()).toContain('Edit')
    expect(wrapper.text()).not.toContain('Delete')
  })

  it('does not activate policy before confirmation and cancel is no-op', async () => {
    const store = usePolicyStore()
    store.status = 'success'
    store.policies = [policy]
    store.roles = [role]
    store.permissions = role.permissions
    const activateSpy = vi.spyOn(store, 'activatePolicy')

    const wrapper = mount(PolicyPage)

    await wrapper.find('button.policy-activate-button').trigger('click')
    expect(activateSpy).not.toHaveBeenCalled()

    await wrapper.find('[data-testid="confirm-dialog-cancel"]').trigger('click')
    expect(activateSpy).not.toHaveBeenCalled()
  })

  it('rolls back policy only after confirmation', async () => {
    const store = usePolicyStore()
    store.status = 'success'
    store.policies = [policy]
    store.roles = [role]
    store.permissions = role.permissions
    const rollbackSpy = vi.spyOn(store, 'rollbackPolicy')

    const wrapper = mount(PolicyPage)

    await wrapper.find('button.policy-rollback-button').trigger('click')
    await wrapper.find('[data-testid="confirm-dialog-confirm"]').trigger('click')

    expect(rollbackSpy).toHaveBeenCalledWith(1, 'Security governance update')
  })

  it('deletes a role only after confirmation', async () => {
    const store = usePolicyStore()
    store.status = 'success'
    store.policies = [policy]
    store.roles = [{ ...role, is_system: false }]
    store.permissions = role.permissions
    const deleteSpy = vi.spyOn(store, 'deleteRole')

    const wrapper = mount(PolicyPage)

    await wrapper.find('button[aria-label="Delete role auditor"]').trigger('click')
    expect(deleteSpy).not.toHaveBeenCalled()

    await wrapper.find('[data-testid="confirm-dialog-confirm"]').trigger('click')

    expect(deleteSpy).toHaveBeenCalledWith('auditor')
  })
})
