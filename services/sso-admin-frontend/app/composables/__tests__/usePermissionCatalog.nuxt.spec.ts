// *.nuxt.spec.ts → routed to the 'nuxt' env where mockNuxtImport is available.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ApiError } from '@/lib/api/api-client'
import { rolesApi } from '@/services/roles.api'
import { usePermissionCatalog } from '../usePermissionCatalog'
import type { AdminPermission, PermissionsResponse } from '@/types/users.types'

vi.mock('@/services/roles.api', () => ({
  rolesApi: { permissions: vi.fn<() => Promise<PermissionsResponse>>() },
}))

const data = ref<PermissionsResponse | null>(null)
const pending = ref(false)
const error = ref<unknown>(null)
const refreshMock = vi.fn<() => Promise<void>>(async () => {})
let capturedKey: string | null = null
let capturedHandler: (() => unknown) | null = null

mockNuxtImport('useAsyncData', () => {
  return (key: string, handler: () => unknown) => {
    capturedKey = key
    capturedHandler = handler
    return { data, pending, error, refresh: refreshMock }
  }
})

const base: AdminPermission = {
  slug: 'admin.users.read',
  name: 'Read users',
  description: 'View the user directory.',
  category: 'users',
}
const makePermission = (o: Partial<AdminPermission>): AdminPermission => ({ ...base, ...o })

const catalog: PermissionsResponse = {
  permissions: [
    makePermission({ slug: 'admin.users.read', name: 'Read users', category: 'users' }),
    makePermission({ slug: 'admin.roles.write', name: 'Write roles', category: 'roles' }),
  ],
}

beforeEach(() => {
  data.value = null
  pending.value = false
  error.value = null
  capturedKey = null
  capturedHandler = null
  vi.clearAllMocks()
})
afterEach(() => vi.clearAllMocks())

describe('usePermissionCatalog', () => {
  it('wires the permissions service under a stable asyncData key', () => {
    usePermissionCatalog()
    expect(capturedKey).toBe('admin-permissions')
    capturedHandler?.()
    expect(rolesApi.permissions).toHaveBeenCalledTimes(1)
  })

  it('derives loading / ready / empty and keeps null distinct from []', () => {
    const cat = usePermissionCatalog()
    expect(cat.viewState.value).toBe('loading')
    expect(cat.permissions.value).toBeNull()
    data.value = catalog
    expect(cat.viewState.value).toBe('ready')
    expect(cat.permissions.value?.map((p) => p.slug)).toEqual([
      'admin.users.read',
      'admin.roles.write',
    ])
    data.value = { permissions: [] }
    expect(cat.viewState.value).toBe('empty')
    expect(cat.permissions.value).toEqual([])
  })

  it('maps a first-load 403 to forbidden and exposes the redacted request id', () => {
    error.value = new ApiError(403, 'forbidden', 'forbidden', null, 'admin-req-CATALOG7')
    const cat = usePermissionCatalog()
    expect(cat.viewState.value).toBe('forbidden')
    expect(cat.requestId.value).toBe('admin-req-CATALOG7')
  })

  it('maps a first-load 401 to unauthenticated', () => {
    error.value = new ApiError(401, 'no session')
    expect(usePermissionCatalog().viewState.value).toBe('unauthenticated')
  })

  it('keeps the last good catalog on a background refresh failure (stale)', () => {
    data.value = catalog
    error.value = new ApiError(500, 'catalog down')
    const cat = usePermissionCatalog()
    expect(cat.viewState.value).toBe('ready')
    expect(cat.isStale.value).toBe(true)
  })

  it('passes pending through unchanged', () => {
    pending.value = true
    expect(usePermissionCatalog().pending.value).toBe(true)
  })

  it('refresh() delegates to the underlying asyncData refresh', async () => {
    await usePermissionCatalog().refresh()
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it('hydrates only masked catalog DTOs — no token field, no raw digit-run', () => {
    data.value = catalog
    const cat = usePermissionCatalog()
    const serialized = JSON.stringify({ permissions: cat.permissions.value })
    expect(serialized).not.toMatch(/access_token|refresh_token|id_token|Bearer|client_secret/i)
    expect(serialized).not.toMatch(/\b\d{16}\b|\b\d{18}\b|\b\d{10}\b/)
  })
})
