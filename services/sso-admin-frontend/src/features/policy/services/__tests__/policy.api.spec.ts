import { describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/lib/api/api-client'
import { policyApi } from '../policy.api'

vi.mock('@/lib/api/api-client', () => ({
  apiClient: {
    get: vi.fn<() => Promise<unknown>>(),
    post: vi.fn<() => Promise<unknown>>(),
    patch: vi.fn<() => Promise<unknown>>(),
    put: vi.fn<() => Promise<unknown>>(),
  },
}))

describe('policyApi', () => {
  it('uses explicit admin BFF routes for policies and RBAC', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({})
    vi.mocked(apiClient.post).mockResolvedValue({})
    vi.mocked(apiClient.patch).mockResolvedValue({})
    vi.mocked(apiClient.put).mockResolvedValue({})

    await policyApi.listPolicies('password')
    await policyApi.proposePolicy('password', {
      payload: { min_length: 14 },
      reason: 'Raise baseline',
    })
    await policyApi.activatePolicy('password', 2, { reason: 'Approved change' })
    await policyApi.rollbackPolicy('password', 1, { reason: 'Incident rollback' })
    await policyApi.listRoles()
    await policyApi.listPermissions()
    await policyApi.createRole({ slug: 'auditor-lite', name: 'Auditor Lite' })
    await policyApi.updateRole('auditor-lite', { name: 'Auditor Lite Updated' })
    await policyApi.syncRolePermissions('auditor-lite', ['admin.audit.read'])

    expect(apiClient.get).toHaveBeenNthCalledWith(1, '/api/admin/security-policies/password')
    expect(apiClient.post).toHaveBeenNthCalledWith(1, '/api/admin/security-policies/password', {
      payload: { min_length: 14 },
      reason: 'Raise baseline',
    })
    expect(apiClient.post).toHaveBeenNthCalledWith(
      2,
      '/api/admin/security-policies/password/2/activate',
      { reason: 'Approved change' },
    )
    expect(apiClient.post).toHaveBeenNthCalledWith(
      3,
      '/api/admin/security-policies/password/1/rollback',
      { reason: 'Incident rollback' },
    )
    expect(apiClient.get).toHaveBeenNthCalledWith(2, '/api/admin/roles')
    expect(apiClient.get).toHaveBeenNthCalledWith(3, '/api/admin/permissions')
    expect(apiClient.post).toHaveBeenNthCalledWith(4, '/api/admin/roles', {
      slug: 'auditor-lite',
      name: 'Auditor Lite',
    })
    expect(apiClient.patch).toHaveBeenCalledWith('/api/admin/roles/auditor-lite', {
      name: 'Auditor Lite Updated',
    })
    expect(apiClient.put).toHaveBeenCalledWith('/api/admin/roles/auditor-lite/permissions', {
      permission_slugs: ['admin.audit.read'],
    })
  })
})
