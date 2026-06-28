// *.nuxt.spec.ts → routed to the 'nuxt' env where mockNuxtImport is available.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ApiError } from '@/lib/api/api-client'
import { rolesApi } from '@/services/roles.api'
import { useRolesList } from '../useRolesList'
import type { AdminRole, RolesResponse } from '@/types/users.types'

vi.mock('@/services/roles.api', () => ({
  rolesApi: { list: vi.fn<() => Promise<RolesResponse>>() },
}))

// Controllable useAsyncData stand-in: the test mutates data/pending/error and
// asserts the composable's derived state, and captures the key + handler so we
// can prove the composable wires the service under the contracted asyncData key.
const data = ref<RolesResponse | null>(null)
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

// One fully-typed sample role; overrides keep each case readable. Rows read
// clearly as samples — no fabricated personas, no raw secrets/PII.
const base: AdminRole = {
  id: 1,
  slug: 'support-agent',
  name: 'Support Agent',
  description: 'Reads tickets and user profiles.',
  is_system: false,
  permissions: [{ slug: 'admin.users.read', name: 'Read users', category: 'users' }],
  user_count: 3,
  users_count: 3,
}
const makeRole = (o: Partial<AdminRole>): AdminRole => ({ ...base, ...o })

const ready: RolesResponse = {
  roles: [
    makeRole({ id: 1, slug: 'support-agent', name: 'Support Agent' }),
    makeRole({ id: 2, slug: 'auditor', name: 'Auditor', is_system: true }),
  ],
}
const many: RolesResponse = {
  roles: Array.from({ length: 30 }, (_, i) =>
    makeRole({ id: i + 1, slug: `role-${i}`, name: `Role ${i}` }),
  ),
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

describe('useRolesList', () => {
  it('wires the roles service under a stable asyncData key', () => {
    useRolesList()
    expect(capturedKey).toBe('admin-roles-list')
    capturedHandler?.()
    expect(rolesApi.list).toHaveBeenCalledTimes(1)
  })

  it('derives loading / ready / empty and keeps null distinct from []', () => {
    const list = useRolesList()
    expect(list.viewState.value).toBe('loading')
    expect(list.roles.value).toBeNull()
    data.value = ready
    expect(list.viewState.value).toBe('ready')
    expect(list.roles.value).toHaveLength(2)
    expect(list.total.value).toBe(2)
    data.value = { roles: [] }
    expect(list.viewState.value).toBe('empty')
    expect(list.roles.value).toEqual([])
  })

  it('applies the search query to derived rows (name + slug, case-insensitive)', () => {
    data.value = ready
    const list = useRolesList()
    list.query.value = 'AUDIT'
    expect(list.filtered.value.map((r) => r.slug)).toEqual(['auditor'])
    expect(list.filteredTotal.value).toBe(1)
    list.query.value = 'support-agent'
    expect(list.filtered.value.map((r) => r.slug)).toEqual(['support-agent'])
    list.query.value = ''
    expect(list.filtered.value).toHaveLength(2)
  })

  it('paginates the filtered list and reports the page count', () => {
    data.value = many
    const list = useRolesList()
    expect(list.paged.value).toHaveLength(25)
    expect(list.pageCount.value).toBe(2)
    list.page.value = 2
    expect(list.paged.value).toHaveLength(5)
  })

  it('resets to page 1 when the query changes', async () => {
    data.value = many
    const list = useRolesList()
    list.page.value = 2
    list.query.value = 'Role 1'
    await nextTick()
    expect(list.page.value).toBe(1)
  })

  it('maps a first-load 403 to forbidden and exposes the redacted request id', () => {
    error.value = new ApiError(403, 'forbidden', 'forbidden', null, 'admin-req-DENIED42')
    const list = useRolesList()
    expect(list.viewState.value).toBe('forbidden')
    expect(list.requestId.value).toBe('admin-req-DENIED42')
  })

  it('maps a first-load 401 to unauthenticated', () => {
    error.value = new ApiError(401, 'no session')
    expect(useRolesList().viewState.value).toBe('unauthenticated')
  })

  it('keeps the last good list on a background refresh failure (stale)', () => {
    data.value = ready
    error.value = new ApiError(500, 'boom')
    const list = useRolesList()
    expect(list.viewState.value).toBe('ready')
    expect(list.isStale.value).toBe(true)
  })

  it('refresh() delegates to the underlying asyncData refresh', async () => {
    await useRolesList().refresh()
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it('hydrates only masked DTOs — no token field, no raw NIK/NIP/NISN digit-run', () => {
    // The composable passes the backend DTO through verbatim; it must never
    // introduce a token field or an un-masked identifier. The full SSR payload
    // leak gate over /roles is Task 7.11 — this guards the data boundary itself.
    data.value = many
    const list = useRolesList()
    const serialized = JSON.stringify({ roles: list.roles.value, paged: list.paged.value })
    expect(serialized).not.toMatch(/access_token|refresh_token|id_token|Bearer|client_secret/i)
    expect(serialized).not.toMatch(/\b\d{16}\b|\b\d{18}\b|\b\d{10}\b/)
  })
})
