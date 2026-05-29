import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { policyApi } from '../../services/policy.api'
import { usePolicyStore } from '../policy.store'
import type { AdminPermission, AdminRole, SecurityPolicy } from '../../types'

vi.mock('../../services/policy.api', () => ({
  policyApi: {
    listPolicies:
      vi.fn<
        () => Promise<{ category: string; active: object; policies: readonly SecurityPolicy[] }>
      >(),
    proposePolicy: vi.fn<() => Promise<{ policy: SecurityPolicy }>>(),
    activatePolicy: vi.fn<() => Promise<{ policy: SecurityPolicy }>>(),
    rollbackPolicy: vi.fn<() => Promise<{ policy: SecurityPolicy }>>(),
    listRoles: vi.fn<() => Promise<{ roles: readonly AdminRole[] }>>(),
    listPermissions: vi.fn<() => Promise<{ permissions: readonly AdminPermission[] }>>(),
    createRole: vi.fn<() => Promise<{ role: AdminRole }>>(),
    updateRole: vi.fn<() => Promise<{ role: AdminRole }>>(),
    syncRolePermissions: vi.fn<() => Promise<{ role: AdminRole }>>(),
    deleteRole: vi.fn<() => Promise<{ deleted: boolean }>>(),
    syncUserRoles: vi.fn<() => Promise<{ user: { subject_id: string } }>>(),
  },
}))

vi.mock('@/lib/api/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/api-client')>()
  return {
    ...actual,
    getLastRequestId: vi.fn<() => string | null>(() => 'req-policy-1'),
  }
})

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

describe('usePolicyStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(policyApi.listPolicies).mockReset()
    vi.mocked(policyApi.proposePolicy).mockReset()
    vi.mocked(policyApi.activatePolicy).mockReset()
    vi.mocked(policyApi.rollbackPolicy).mockReset()
    vi.mocked(policyApi.listRoles).mockReset()
    vi.mocked(policyApi.listPermissions).mockReset()
    vi.mocked(policyApi.createRole).mockReset()
    vi.mocked(policyApi.updateRole).mockReset()
    vi.mocked(policyApi.syncRolePermissions).mockReset()
    vi.mocked(policyApi.deleteRole).mockReset()
    vi.mocked(policyApi.syncUserRoles).mockReset()
    vi.mocked(getLastRequestId).mockReturnValue('req-policy-1')
  })

  it('loads policy versions, roles, permissions, and request evidence', async () => {
    vi.mocked(policyApi.listPolicies).mockResolvedValue({
      category: 'password',
      active: policy.payload,
      policies: [policy],
    })
    vi.mocked(policyApi.listRoles).mockResolvedValue({ roles: [role] })
    vi.mocked(policyApi.listPermissions).mockResolvedValue({ permissions: role.permissions })
    const store = usePolicyStore()

    await store.load()

    expect(store.status).toBe('success')
    expect(store.policies).toEqual([policy])
    expect(store.roles).toEqual([role])
    expect(store.permissions).toEqual(role.permissions)
    expect(store.requestId).toBe('req-policy-1')
  })

  it('proposes draft policy and stores evidence', async () => {
    vi.mocked(policyApi.proposePolicy).mockResolvedValue({
      policy: { ...policy, version: 2, status: 'draft' },
    })
    const store = usePolicyStore()
    store.policies = [policy]

    await store.proposePolicy({ min_length: 14 }, 'Raise baseline')

    expect(store.policies[0]?.version).toBe(2)
    expect(policyApi.proposePolicy).toHaveBeenCalledWith('password', {
      payload: { min_length: 14 },
      reason: 'Raise baseline',
    })
  })

  it('maps step-up errors to safe copy', async () => {
    vi.mocked(policyApi.activatePolicy).mockRejectedValue(
      new ApiError(428, 'raw ACR trace', 'fresh_auth_required', null, 'req-step-up'),
    )
    const store = usePolicyStore()

    await store.activatePolicy(1, 'Approve')

    expect(store.actionStatus).toBe('step_up_required')
    expect(store.requestId).toBe('req-step-up')
    expect(store.errorMessage).toBe(
      'Aksi policy/RBAC membutuhkan fresh-auth atau MFA assurance. Ulangi login admin lalu coba lagi.',
    )
    expect(store.errorMessage).not.toContain('raw ACR')
  })

  it('maps forbidden errors to safe copy', async () => {
    vi.mocked(policyApi.listPolicies).mockRejectedValue(
      new ApiError(403, 'SQLSTATE forbidden leak'),
    )
    const store = usePolicyStore()

    await store.load()

    expect(store.status).toBe('forbidden')
    expect(store.errorMessage).toBe('Kamu tidak memiliki izin untuk melihat policy/RBAC admin.')
    expect(store.errorMessage).not.toContain('SQLSTATE')
  })

  describe('role CRUD', () => {
    it('creates a role and appends to list', async () => {
      const newRole: AdminRole = {
        id: 2,
        slug: 'operator',
        name: 'Operator',
        permissions: [],
      }
      vi.mocked(policyApi.createRole).mockResolvedValue({ role: newRole })
      const store = usePolicyStore()
      store.roles = [role]

      await store.createRole({ slug: 'operator', name: 'Operator' })

      expect(policyApi.createRole).toHaveBeenCalledWith({ slug: 'operator', name: 'Operator' })
      expect(store.roles).toHaveLength(2)
      expect(store.roles[1]?.slug).toBe('operator')
      expect(store.actionStatus).toBe('success')
    })

    it('updates a role and upserts in list', async () => {
      const updated: AdminRole = { ...role, name: 'Auditor Updated' }
      vi.mocked(policyApi.updateRole).mockResolvedValue({ role: updated })
      const store = usePolicyStore()
      store.roles = [role]

      await store.updateRole('auditor', { name: 'Auditor Updated' })

      expect(policyApi.updateRole).toHaveBeenCalledWith('auditor', { name: 'Auditor Updated' })
      expect(store.roles[0]?.name).toBe('Auditor Updated')
    })

    it('deletes a non-system role and removes from list', async () => {
      const nonSystemRole: AdminRole = { ...role, slug: 'temp-role', is_system: false }
      vi.mocked(policyApi.deleteRole).mockResolvedValue({ deleted: true })
      const store = usePolicyStore()
      store.roles = [role, nonSystemRole]

      await store.deleteRole('temp-role')

      expect(policyApi.deleteRole).toHaveBeenCalledWith('temp-role')
      expect(store.roles).toHaveLength(1)
      expect(store.roles[0]?.slug).toBe('auditor')
    })

    it('rejects delete for system role', async () => {
      const store = usePolicyStore()
      store.roles = [role]

      await store.deleteRole('auditor')

      expect(policyApi.deleteRole).not.toHaveBeenCalled()
      expect(store.roles).toHaveLength(1)
      expect(store.actionStatus).toBe('error')
      expect(store.errorMessage).toContain('system')
    })

    it('maps create role step-up 428 to safe copy', async () => {
      vi.mocked(policyApi.createRole).mockRejectedValue(
        new ApiError(428, 'raw ACR trace', 'fresh_auth_required'),
      )
      const store = usePolicyStore()

      await store.createRole({ slug: 'operator', name: 'Operator' })

      expect(store.actionStatus).toBe('step_up_required')
      expect(store.errorMessage).toContain('fresh-auth')
    })

    it('syncs user roles', async () => {
      vi.mocked(policyApi.syncUserRoles).mockResolvedValue({
        user: { subject_id: 'sub_admin' },
      })
      const store = usePolicyStore()

      await store.syncUserRoles('sub_admin', ['admin', 'auditor'])

      expect(policyApi.syncUserRoles).toHaveBeenCalledWith('sub_admin', ['admin', 'auditor'])
      expect(store.actionStatus).toBe('success')
    })
  })
})
