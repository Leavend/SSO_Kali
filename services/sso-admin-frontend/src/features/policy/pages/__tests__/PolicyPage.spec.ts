import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
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

describe('PolicyPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
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
})
