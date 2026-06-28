// *.nuxt.spec.ts → routed to the 'nuxt' env where mockNuxtImport is available.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ApiError } from '@/lib/api/api-client'
import { usersApi } from '@/services/users.api'
import { useUsersList } from '../useUsersList'
import type { AdminUserListItem, UserListResponse } from '@/types/users.types'

vi.mock('@/services/users.api', () => ({
  usersApi: { list: vi.fn<() => Promise<UserListResponse>>() },
}))

// Controllable useAsyncData stand-in: the test mutates data/pending/error and
// asserts the composable's derived state, and captures the key + handler so we
// can prove the composable wires the service correctly.
const data = ref<UserListResponse | null>(null)
const pending = ref(false)
const error = ref<unknown>(null)
const refreshMock = vi.fn(async () => {})
let capturedKey: string | null = null
let capturedHandler: (() => unknown) | null = null

mockNuxtImport('useAsyncData', () => {
  return (key: string, handler: () => unknown) => {
    capturedKey = key
    capturedHandler = handler
    return { data, pending, error, refresh: refreshMock }
  }
})

const base: AdminUserListItem = {
  id: 1,
  subject_id: 'usr_budi',
  email: 'budi.santoso@example.test',
  given_name: 'Budi',
  family_name: 'Santoso',
  display_name: 'Budi Santoso',
  role: 'user',
  status: 'active',
  effective_status: 'active',
  disabled_at: null,
  disabled_reason: null,
  locked_at: null,
  locked_until: null,
  locked_reason: null,
  locked_by_subject_id: null,
  lock_count: 0,
  local_account_enabled: true,
  profile_synced_at: null,
  email_verified_at: null,
  last_login_at: null,
  created_at: '2026-01-01T00:00:00Z',
  nik: '••••••••••••3456',
  nip: null,
  nisn: null,
  birth_date: null,
  mfa_enrolled: false,
  mfa_methods: [],
  mfa_mandatory: false,
  roles: [],
  login_context: null,
}
const makeUser = (o: Partial<AdminUserListItem>): AdminUserListItem => ({ ...base, ...o })

const ready: UserListResponse = {
  users: [
    makeUser({
      subject_id: 'usr_budi',
      display_name: 'Budi Santoso',
      email: 'budi@example.test',
      effective_status: 'active',
    }),
    makeUser({
      subject_id: 'usr_citra',
      display_name: 'Citra Lestari',
      email: 'citra@example.test',
      effective_status: 'locked',
    }),
  ],
}
const many: UserListResponse = {
  users: Array.from({ length: 30 }, (_, i) =>
    makeUser({ subject_id: `usr_${i}`, email: `u${i}@example.test`, display_name: `User ${i}` }),
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

describe('useUsersList', () => {
  it('wires the service under a stable asyncData key', () => {
    useUsersList()
    expect(capturedKey).toBe('admin-users-list')
    capturedHandler?.()
    expect(usersApi.list).toHaveBeenCalledTimes(1)
  })

  it('derives loading / ready / empty from the list', () => {
    const list = useUsersList()
    expect(list.viewState.value).toBe('loading')
    data.value = ready
    expect(list.viewState.value).toBe('ready')
    expect(list.users.value).toHaveLength(2)
    data.value = { users: [] }
    expect(list.viewState.value).toBe('empty')
  })

  it('applies the search query and status filter to derived rows', () => {
    data.value = ready
    const list = useUsersList()
    list.query.value = 'citra'
    expect(list.filtered.value.map((u) => u.subject_id)).toEqual(['usr_citra'])
    expect(list.filteredTotal.value).toBe(1)
    list.query.value = ''
    list.statusFilter.value = 'locked'
    expect(list.filtered.value.map((u) => u.subject_id)).toEqual(['usr_citra'])
    expect(list.total.value).toBe(2)
  })

  it('paginates the filtered list and reports the page count', () => {
    data.value = many
    const list = useUsersList()
    expect(list.paged.value).toHaveLength(25)
    expect(list.pageCount.value).toBe(2)
    list.page.value = 2
    expect(list.paged.value).toHaveLength(5)
  })

  it('resets to page 1 when the query or status filter changes', async () => {
    data.value = many
    const list = useUsersList()
    list.page.value = 2
    list.query.value = 'User 1'
    await nextTick()
    expect(list.page.value).toBe(1)
  })

  it('maps a first-load 403 to forbidden and exposes the redacted request id', () => {
    error.value = new ApiError(403, 'forbidden', 'forbidden', null, 'admin-req-DENIED42')
    const list = useUsersList()
    expect(list.viewState.value).toBe('forbidden')
    expect(list.requestId.value).toBe('admin-req-DENIED42')
  })

  it('maps a first-load 401 to unauthenticated', () => {
    error.value = new ApiError(401, 'no session')
    expect(useUsersList().viewState.value).toBe('unauthenticated')
  })

  it('keeps the last good list on a background refresh failure (stale)', () => {
    data.value = ready
    error.value = new ApiError(500, 'boom')
    const list = useUsersList()
    expect(list.viewState.value).toBe('ready')
    expect(list.isStale.value).toBe(true)
  })

  it('refresh() delegates to the underlying asyncData refresh', async () => {
    await useUsersList().refresh()
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it('hydrates only masked DTOs — no token and no raw NIK/NIP/NISN digit-run leaks', () => {
    // The composable passes the masked backend DTO through verbatim; it must
    // never introduce a token field or an un-masked identifier. (The full SSR
    // payload leak gate over /users is Task 4.13; this guards the data boundary.)
    data.value = many
    const list = useUsersList()
    const serialized = JSON.stringify({ users: list.users.value, paged: list.paged.value })
    expect(serialized).not.toMatch(/access_token|refresh_token|id_token|Bearer|client_secret/i)
    expect(serialized).not.toMatch(/\b\d{16}\b|\b\d{18}\b|\b\d{10}\b/)
  })
})
