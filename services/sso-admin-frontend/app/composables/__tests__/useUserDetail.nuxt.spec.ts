// *.nuxt.spec.ts → routed to the 'nuxt' env where mockNuxtImport is available.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ApiError } from '@/lib/api/api-client'
import { usersApi } from '@/services/users.api'
import { useUserDetail } from '../useUserDetail'
import type { UserDetailResponse } from '@/types/users.types'

vi.mock('@/services/users.api', () => ({
  usersApi: { show: vi.fn<(id: string) => Promise<UserDetailResponse>>() },
}))

// Controllable useAsyncData stand-in: the test mutates data/pending/error and
// asserts the composable's derived state. Captures the key + handler so we can
// prove the composable wires the service under the per-subject key.
const data = ref<UserDetailResponse | null>(null)
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

// Detail DTO as the backend returns it: government identifiers already MASKED,
// session id is a raw technical value the page (not this composable) masks.
const ready: UserDetailResponse = {
  user: {
    id: 7,
    subject_id: 'usr_sample_7',
    email: 'sample.operator@example.test',
    given_name: 'Sample',
    family_name: 'Operator',
    display_name: 'Sample Operator',
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
    email_verified_at: '2026-01-02T00:00:00Z',
    last_login_at: '2026-06-20T08:00:00Z',
    created_at: '2025-12-01T00:00:00Z',
    nik: '32********7654',
    nip: '1990********003',
    nisn: '00****8421',
    birth_date: '1990-**-**',
    mfa_enrolled: true,
    mfa_methods: ['totp'],
    mfa_mandatory: false,
    roles: [{ slug: 'user', name: 'User', is_system: true }],
  },
  login_context: {
    ip_address: '203.0.113.7',
    mfa_required: false,
    last_seen_at: '2026-06-27T09:00:00Z',
  },
  sessions: [
    {
      id: 'sess_raw_abcdef0123456789',
      ip_address: '203.0.113.7',
      user_agent: 'Sample/1.0',
      last_seen_at: '2026-06-27T09:00:00Z',
      created_at: '2026-06-20T08:00:00Z',
    },
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

describe('useUserDetail', () => {
  it('wires the service under a stable per-subject asyncData key', () => {
    useUserDetail('usr_sample_7')
    expect(capturedKey).toBe('admin-user-detail:usr_sample_7')
    capturedHandler?.()
    expect(usersApi.show).toHaveBeenCalledWith('usr_sample_7')
  })

  it('keys distinctly per subject id', () => {
    useUserDetail('usr_a')
    expect(capturedKey).toBe('admin-user-detail:usr_a')
    useUserDetail('usr_b')
    expect(capturedKey).toBe('admin-user-detail:usr_b')
  })

  it('accepts a getter for the subject id', () => {
    useUserDetail(() => 'usr_from_getter')
    expect(capturedKey).toBe('admin-user-detail:usr_from_getter')
    capturedHandler?.()
    expect(usersApi.show).toHaveBeenCalledWith('usr_from_getter')
  })

  it('exposes user, login context and sessions from the ready response', () => {
    data.value = ready
    const detail = useUserDetail('usr_sample_7')
    expect(detail.viewState.value).toBe('ready')
    expect(detail.user.value).toEqual(ready.user)
    expect(detail.loginContext.value).toEqual(ready.login_context)
    expect(detail.sessions.value).toEqual(ready.sessions)
  })

  it('returns null user / null context / empty sessions before data resolves (loading)', () => {
    const detail = useUserDetail('usr_sample_7')
    expect(detail.viewState.value).toBe('loading')
    expect(detail.user.value).toBeNull()
    expect(detail.loginContext.value).toBeNull()
    expect(detail.sessions.value).toEqual([])
  })

  it('maps a first-load 404 to not_found', () => {
    error.value = new ApiError(404, 'not found')
    expect(useUserDetail('usr_missing').viewState.value).toBe('not_found')
  })

  it('maps a first-load 403 to forbidden and exposes the redacted request id', () => {
    error.value = new ApiError(403, 'forbidden', 'forbidden', null, 'admin-req-DENIED42')
    const detail = useUserDetail('usr_sample_7')
    expect(detail.viewState.value).toBe('forbidden')
    expect(detail.requestId.value).toBe('admin-req-DENIED42')
  })

  it('maps a first-load 401 to unauthenticated', () => {
    error.value = new ApiError(401, 'no session')
    expect(useUserDetail('usr_sample_7').viewState.value).toBe('unauthenticated')
  })

  it('passes government identifiers through exactly as masked by the backend (no unmask/reshape)', () => {
    data.value = ready
    const u = useUserDetail('usr_sample_7').user.value
    // This boundary is display-only: it must surface the backend's masked values
    // verbatim and never derive a raw 16/18/10-digit identifier of its own.
    expect(u?.nik).toBe('32********7654')
    expect(u?.nip).toBe('1990********003')
    expect(u?.nisn).toBe('00****8421')
    expect(/^\d{16}$/.test(u?.nik ?? '')).toBe(false)
    expect(/^\d{18}$/.test(u?.nip ?? '')).toBe(false)
    expect(/^\d{10}$/.test(u?.nisn ?? '')).toBe(false)
  })

  it('refresh() delegates to the underlying asyncData refresh', async () => {
    await useUserDetail('usr_sample_7').refresh()
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })
})
