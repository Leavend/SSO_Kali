import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError } from '@/lib/api/api-client'
import { rolesApi } from '../../services/roles.api'
import { useRolesStore } from '../roles.store'

vi.mock('../../services/roles.api')
vi.mock('@/lib/api/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/api-client')>()
  return { ...actual, getLastRequestId: vi.fn<() => string>(() => 'req-test-id') }
})

const mockRolesResponse = {
  roles: [
    {
      slug: 'admin',
      label: 'Administrator',
      permissions: ['admin.users.read', 'admin.roles.read'],
    },
    { slug: 'auditor', label: 'Auditor', permissions: ['admin.audit.read'] },
  ],
}

const mockPermissionsResponse = {
  permissions: [
    { key: 'admin.users.read', label: 'Read Users', group: 'Users' },
    { key: 'admin.roles.read', label: 'Read Roles', group: 'RBAC' },
    { key: 'admin.audit.read', label: 'Read Audit', group: 'Audit' },
  ],
}

describe('useRolesStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('initializes with idle status and empty collections', () => {
      const store = useRolesStore()

      expect(store.status).toBe('idle')
      expect(store.roles).toEqual([])
      expect(store.permissions).toEqual([])
      expect(store.errorMessage).toBeNull()
      expect(store.requestId).toBeNull()
    })
  })

  describe('load()', () => {
    it('sets status to success and populates roles and permissions', async () => {
      vi.mocked(rolesApi.listRoles).mockResolvedValueOnce(mockRolesResponse)
      vi.mocked(rolesApi.listPermissions).mockResolvedValueOnce(mockPermissionsResponse)

      const store = useRolesStore()
      await store.load()

      expect(store.status).toBe('success')
      expect(store.roles).toHaveLength(2)
      expect(store.permissions).toHaveLength(3)
      expect(store.errorMessage).toBeNull()
    })

    it('sets status to loading during request', () => {
      vi.mocked(rolesApi.listRoles).mockReturnValueOnce(new Promise(() => {}))
      vi.mocked(rolesApi.listPermissions).mockReturnValueOnce(new Promise(() => {}))

      const store = useRolesStore()
      void store.load()

      expect(store.status).toBe('loading')
    })

    it('sets unauthenticated status on 401', async () => {
      vi.mocked(rolesApi.listRoles).mockRejectedValueOnce(
        new ApiError(401, 'Unauthenticated', 'req-401'),
      )
      vi.mocked(rolesApi.listPermissions).mockResolvedValueOnce(mockPermissionsResponse)

      const store = useRolesStore()
      await store.load()

      expect(store.status).toBe('unauthenticated')
      expect(store.errorMessage).toContain('Login ulang')
    })

    it('sets forbidden status on 403', async () => {
      vi.mocked(rolesApi.listRoles).mockRejectedValueOnce(new ApiError(403, 'Forbidden', 'req-403'))
      vi.mocked(rolesApi.listPermissions).mockResolvedValueOnce(mockPermissionsResponse)

      const store = useRolesStore()
      await store.load()

      expect(store.status).toBe('forbidden')
      expect(store.errorMessage).toContain('izin')
    })

    it('sets error status on network failure', async () => {
      vi.mocked(rolesApi.listRoles).mockRejectedValueOnce(new Error('Network error'))
      vi.mocked(rolesApi.listPermissions).mockResolvedValueOnce(mockPermissionsResponse)

      const store = useRolesStore()
      await store.load()

      expect(store.status).toBe('error')
      expect(store.errorMessage).toBeTruthy()
    })

    it('clears roles and permissions on error', async () => {
      vi.mocked(rolesApi.listRoles).mockResolvedValueOnce(mockRolesResponse)
      vi.mocked(rolesApi.listPermissions).mockResolvedValueOnce(mockPermissionsResponse)
      const store = useRolesStore()
      await store.load()

      vi.mocked(rolesApi.listRoles).mockRejectedValueOnce(new Error('fail'))
      vi.mocked(rolesApi.listPermissions).mockRejectedValueOnce(new Error('fail'))
      await store.load()

      expect(store.roles).toEqual([])
      expect(store.permissions).toEqual([])
    })
  })

  describe('actions', () => {
    it('createRole calls api and reloads roles', async () => {
      vi.mocked(rolesApi.createRole).mockResolvedValueOnce({ role: { slug: 'custom', name: 'Custom', label: 'Custom', permissions: [] } })
      vi.mocked(rolesApi.listRoles).mockResolvedValueOnce({ roles: [] })
      vi.mocked(rolesApi.listPermissions).mockResolvedValueOnce({ permissions: [] })
      
      const store = useRolesStore()
      await store.createRole({ slug: 'custom', name: 'Custom' })

      expect(rolesApi.createRole).toHaveBeenCalledWith({ slug: 'custom', name: 'Custom' })
      expect(store.actionStatus).toBe('success')
    })

    it('updateRole calls api and reloads roles', async () => {
      vi.mocked(rolesApi.updateRole).mockResolvedValueOnce({ role: { slug: 'custom', name: 'Custom New', label: 'Custom New', permissions: [] } })
      vi.mocked(rolesApi.listRoles).mockResolvedValueOnce({ roles: [] })
      vi.mocked(rolesApi.listPermissions).mockResolvedValueOnce({ permissions: [] })
      
      const store = useRolesStore()
      await store.updateRole('custom', { name: 'Custom New' })

      expect(rolesApi.updateRole).toHaveBeenCalledWith('custom', { name: 'Custom New' })
      expect(store.actionStatus).toBe('success')
    })

    it('deleteRole calls api and reloads roles', async () => {
      vi.mocked(rolesApi.deleteRole).mockResolvedValueOnce({ deleted: true, role_slug: 'custom' })
      vi.mocked(rolesApi.listRoles).mockResolvedValueOnce({ roles: [] })
      vi.mocked(rolesApi.listPermissions).mockResolvedValueOnce({ permissions: [] })
      
      const store = useRolesStore()
      await store.deleteRole('custom')

      expect(rolesApi.deleteRole).toHaveBeenCalledWith('custom')
      expect(store.actionStatus).toBe('success')
    })

    it('syncRolePermissions calls api and reloads roles', async () => {
      vi.mocked(rolesApi.syncRolePermissions).mockResolvedValueOnce({ role: { slug: 'custom', name: 'Custom', label: 'Custom', permissions: ['perm.a'] } })
      vi.mocked(rolesApi.listRoles).mockResolvedValueOnce({ roles: [] })
      vi.mocked(rolesApi.listPermissions).mockResolvedValueOnce({ permissions: [] })
      
      const store = useRolesStore()
      await store.syncRolePermissions('custom', ['perm.a'])

      expect(rolesApi.syncRolePermissions).toHaveBeenCalledWith('custom', ['perm.a'])
      expect(store.actionStatus).toBe('success')
    })
  })
})
