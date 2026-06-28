import { describe, expect, it, vi } from 'vitest'
import type { RolesResponse } from '@/types/users.types'

const get = vi.fn<(path: string) => Promise<unknown>>()
vi.mock('@/lib/api/api-client', () => ({ apiClient: { get } }))

const { rolesApi } = await import('../roles.api')

describe('rolesApi', () => {
  it('GETs the same-origin BFF roles path and returns the DTO unchanged', async () => {
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
})
