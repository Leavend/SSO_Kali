import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RouteLocationNormalized } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { resolveAuthGuard } from '../guards'
import { authApi } from '@/services/auth.api'

vi.mock('@/services/auth.api', () => ({
  authApi: {
    getSession: vi.fn(),
  },
}))

function route(overrides: Partial<RouteLocationNormalized> = {}): RouteLocationNormalized {
  return {
    fullPath: '/home',
    path: '/home',
    query: {},
    hash: '',
    name: 'portal.home',
    params: {},
    matched: [],
    redirectedFrom: undefined,
    meta: { requiresAuth: true },
    ...overrides,
  } as RouteLocationNormalized
}

describe('portal auth guard admin access', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('allows admin role users to access the normal SSO portal', async () => {
    vi.mocked(authApi.getSession).mockResolvedValue({
      authenticated: true,
      user: {
        id: 1,
        subject_id: 'sub_admin',
        email: 'admin@dev-sso.local',
        display_name: 'Admin User',
        roles: ['admin'],
      },
    })

    await expect(resolveAuthGuard(route())).resolves.toBe(true)
  })
})
