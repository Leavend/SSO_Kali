import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  CreateRolePayload,
  PermissionsResponse,
  RoleDeleteResponse,
  RoleMutationResponse,
  RolesResponse,
  SyncPermissionsPayload,
  UpdateRolePayload,
} from '@/types/users.types'

const get = vi.fn<(path: string) => Promise<unknown>>()
const post = vi.fn<(path: string, body?: unknown) => Promise<unknown>>()
const patch = vi.fn<(path: string, body?: unknown) => Promise<unknown>>()
const put = vi.fn<(path: string, body?: unknown) => Promise<unknown>>()
const del = vi.fn<(path: string) => Promise<unknown>>()
vi.mock('@/lib/api/api-client', () => ({
  apiClient: { get, post, patch, put, delete: del },
}))

const { rolesApi } = await import('../roles.api')

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  patch.mockReset()
  put.mockReset()
  del.mockReset()
})

describe('rolesApi — read seam', () => {
  it('list() GETs the same-origin BFF roles path and returns the DTO unchanged', async () => {
    const payload: RolesResponse = {
      roles: [
        {
          id: 1,
          slug: 'user',
          name: 'Pengguna',
          description: 'Akun pengguna standar',
          is_system: true,
          permissions: [{ slug: 'profile.read', name: 'Baca profil', category: 'profile' }],
          user_count: 1100,
          users_count: 1100,
        },
        {
          id: 2,
          slug: 'admin',
          name: 'Administrator',
          description: null,
          is_system: true,
          permissions: [{ slug: 'admin.roles.write', name: 'Kelola peran', category: null }],
          user_count: 4,
          users_count: 4,
        },
      ],
    }
    get.mockResolvedValue(payload)
    await expect(rolesApi.list()).resolves.toBe(payload)
    expect(get).toHaveBeenCalledWith('/api/admin/roles')
  })

  it('permissions() GETs the same-origin permission catalog path and passes the DTO through', async () => {
    const payload: PermissionsResponse = {
      permissions: [
        {
          slug: 'users.read',
          name: 'Read users',
          description: 'Allow reading user records',
          category: 'users',
        },
      ],
    }
    get.mockResolvedValue(payload)
    await expect(rolesApi.permissions()).resolves.toBe(payload)
    expect(get).toHaveBeenCalledWith('/api/admin/permissions')
  })
})

describe('rolesApi — create (store)', () => {
  it('store() POSTs slug + name + description + permission_slugs when all provided', async () => {
    const response: RoleMutationResponse = {
      role: {
        id: 9,
        slug: 'editor',
        name: 'Editor',
        description: 'Content editor (sample)',
        is_system: false,
        permissions: [{ slug: 'users.read', name: 'Read users', category: 'users' }],
        user_count: 0,
        users_count: 0,
      },
    }
    post.mockResolvedValue(response)
    const payload: CreateRolePayload = {
      slug: 'editor',
      name: 'Editor',
      description: 'Content editor (sample)',
      permission_slugs: ['users.read'],
    }
    await expect(rolesApi.store(payload)).resolves.toBe(response)
    expect(post).toHaveBeenCalledWith('/api/admin/roles', {
      slug: 'editor',
      name: 'Editor',
      description: 'Content editor (sample)',
      permission_slugs: ['users.read'],
    })
  })

  it('store() omits empty description and absent permission_slugs (slug + name only)', async () => {
    post.mockResolvedValue({ role: {} })
    const payload: CreateRolePayload = { slug: 'viewer', name: 'Viewer', description: null }
    await rolesApi.store(payload)
    expect(post).toHaveBeenCalledWith('/api/admin/roles', { slug: 'viewer', name: 'Viewer' })
  })
})

describe('rolesApi — update metadata', () => {
  it('update() PATCHes the slug path forwarding name and a meaningful null description', async () => {
    patch.mockResolvedValue({ role: {} })
    const payload: UpdateRolePayload = { name: 'Renamed Editor', description: null }
    await rolesApi.update('editor', payload)
    expect(patch).toHaveBeenCalledWith('/api/admin/roles/editor', {
      name: 'Renamed Editor',
      description: null,
    })
  })

  it('update() omits fields left undefined (description-only patch)', async () => {
    patch.mockResolvedValue({ role: {} })
    const payload: UpdateRolePayload = { description: 'Updated note (sample)' }
    await rolesApi.update('editor', payload)
    expect(patch).toHaveBeenCalledWith('/api/admin/roles/editor', {
      description: 'Updated note (sample)',
    })
  })
})

describe('rolesApi — sync permissions', () => {
  it('syncPermissions() PUTs permission_slugs to the slug permissions path', async () => {
    put.mockResolvedValue({ role: {} })
    const payload: SyncPermissionsPayload = { permission_slugs: ['users.read', 'users.write'] }
    await rolesApi.syncPermissions('editor', payload)
    expect(put).toHaveBeenCalledWith('/api/admin/roles/editor/permissions', {
      permission_slugs: ['users.read', 'users.write'],
    })
  })

  it('syncPermissions() forwards an empty array (clears all permissions)', async () => {
    put.mockResolvedValue({ role: {} })
    const payload: SyncPermissionsPayload = { permission_slugs: [] }
    await rolesApi.syncPermissions('editor', payload)
    expect(put).toHaveBeenCalledWith('/api/admin/roles/editor/permissions', {
      permission_slugs: [],
    })
  })
})

describe('rolesApi — destroy', () => {
  it('destroy() DELETEs the slug path and returns the delete envelope by identity', async () => {
    const response: RoleDeleteResponse = { deleted: true, role_slug: 'editor' }
    del.mockResolvedValue(response)
    await expect(rolesApi.destroy('editor')).resolves.toBe(response)
    expect(del).toHaveBeenCalledWith('/api/admin/roles/editor')
  })
})
