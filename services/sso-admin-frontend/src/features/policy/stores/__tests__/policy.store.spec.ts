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
})
