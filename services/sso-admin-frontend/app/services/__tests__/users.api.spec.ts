import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AssignRolesPayload,
  CreateUserPayload,
  LockPayload,
  ReasonPayload,
  SyncProfilePayload,
} from '@/types/users.types'

const get = vi.fn<(path: string) => Promise<unknown>>()
const post = vi.fn<(path: string, body?: unknown) => Promise<unknown>>()
const put = vi.fn<(path: string, body?: unknown) => Promise<unknown>>()
vi.mock('@/lib/api/api-client', () => ({ apiClient: { get, post, put } }))

const { usersApi } = await import('../users.api')

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  put.mockReset()
})

describe('usersApi — read seam', () => {
  it('list() GETs the same-origin user list path and passes the DTO through', async () => {
    const payload = { users: [] }
    get.mockResolvedValue(payload)
    await expect(usersApi.list()).resolves.toBe(payload)
    expect(get).toHaveBeenCalledWith('/api/admin/users')
  })

  it('show() GETs the detail path for the subject id', async () => {
    const payload = { user: {}, login_context: null, sessions: [] }
    get.mockResolvedValue(payload)
    await expect(usersApi.show('sub-123')).resolves.toBe(payload)
    expect(get).toHaveBeenCalledWith('/api/admin/users/sub-123')
  })
})

describe('usersApi — create', () => {
  it('POSTs only the required fields when all optionals are empty', async () => {
    const payload: CreateUserPayload = {
      email: 'sample.staff@example.com',
      display_name: 'Sample Staff',
      role: 'pegawai',
      given_name: '',
      family_name: '',
      password: '',
      nik: '',
      nip: '',
      nisn: '',
      birth_date: '',
    }
    post.mockResolvedValue({ user: {}, delivery_status: 'queued' })
    await usersApi.create(payload)
    expect(post).toHaveBeenCalledWith('/api/admin/users', {
      email: 'sample.staff@example.com',
      display_name: 'Sample Staff',
      role: 'pegawai',
    })
  })

  it('forwards filled optionals incl. local_account_enabled=false (false is meaningful, not empty)', async () => {
    // Sample (clearly fake) raw identifiers — create is the one path the backend accepts raw.
    const payload: CreateUserPayload = {
      email: 'sample.staff@example.com',
      display_name: 'Sample Staff',
      role: 'pegawai',
      given_name: 'Sample',
      family_name: 'Staff',
      password: 'Sample-Passw0rd!',
      local_account_enabled: false,
      nik: '3200000000000001',
      nip: '190000000000000001',
      nisn: '0000000001',
      birth_date: '1990-01-01',
    }
    post.mockResolvedValue({ user: {}, delivery_status: 'queued' })
    await usersApi.create(payload)
    expect(post).toHaveBeenCalledWith('/api/admin/users', {
      email: 'sample.staff@example.com',
      display_name: 'Sample Staff',
      role: 'pegawai',
      given_name: 'Sample',
      family_name: 'Staff',
      password: 'Sample-Passw0rd!',
      local_account_enabled: false,
      nik: '3200000000000001',
      nip: '190000000000000001',
      nisn: '0000000001',
      birth_date: '1990-01-01',
    })
  })
})

describe('usersApi — lifecycle mutations', () => {
  it('deactivate() POSTs the reason to the deactivate path', async () => {
    post.mockResolvedValue({ user: {} })
    const payload: ReasonPayload = { reason: 'Offboarded (sample).' }
    await usersApi.deactivate('sub-1', payload)
    expect(post).toHaveBeenCalledWith('/api/admin/users/sub-1/deactivate', {
      reason: 'Offboarded (sample).',
    })
  })

  it('reactivate() POSTs the reactivate path with no body', async () => {
    post.mockResolvedValue({ user: {} })
    await usersApi.reactivate('sub-1')
    expect(post).toHaveBeenCalledWith('/api/admin/users/sub-1/reactivate')
  })

  it('issuePasswordReset() POSTs the password-reset path with no body', async () => {
    const payload = {
      user: {},
      password_reset: { expires_at: '2026-07-01T00:00:00Z' },
      delivery_status: 'queued',
    }
    post.mockResolvedValue(payload)
    await expect(usersApi.issuePasswordReset('sub-1')).resolves.toBe(payload)
    expect(post).toHaveBeenCalledWith('/api/admin/users/sub-1/password-reset')
  })

  it('syncProfile() POSTs only the changed fields (empty omitted)', async () => {
    post.mockResolvedValue({ user: {} })
    const payload: SyncProfilePayload = { display_name: 'Renamed Sample', email: '', nik: '' }
    await usersApi.syncProfile('sub-1', payload)
    expect(post).toHaveBeenCalledWith('/api/admin/users/sub-1/sync-profile', {
      display_name: 'Renamed Sample',
    })
  })

  it('resetMfa() POSTs the reason to the reset-mfa path', async () => {
    post.mockResolvedValue({ reset: true, message: 'ok', reenrollment_required: true })
    const payload: ReasonPayload = { reason: 'Lost authenticator (sample).' }
    await usersApi.resetMfa('sub-1', payload)
    expect(post).toHaveBeenCalledWith('/api/admin/users/sub-1/reset-mfa', {
      reason: 'Lost authenticator (sample).',
    })
  })

  it('lock() POSTs reason + locked_until when provided', async () => {
    post.mockResolvedValue({ user: {} })
    const payload: LockPayload = {
      reason: 'Suspicious activity (sample).',
      locked_until: '2026-07-01T00:00:00Z',
    }
    await usersApi.lock('sub-1', payload)
    expect(post).toHaveBeenCalledWith('/api/admin/users/sub-1/lock', {
      reason: 'Suspicious activity (sample).',
      locked_until: '2026-07-01T00:00:00Z',
    })
  })

  it('lock() omits locked_until when absent', async () => {
    post.mockResolvedValue({ user: {} })
    const payload: LockPayload = { reason: 'Suspicious activity (sample).' }
    await usersApi.lock('sub-1', payload)
    expect(post).toHaveBeenCalledWith('/api/admin/users/sub-1/lock', {
      reason: 'Suspicious activity (sample).',
    })
  })

  it('unlock() POSTs the reason to the unlock path', async () => {
    post.mockResolvedValue({ user: {} })
    const payload: ReasonPayload = { reason: 'Verified owner (sample).' }
    await usersApi.unlock('sub-1', payload)
    expect(post).toHaveBeenCalledWith('/api/admin/users/sub-1/unlock', {
      reason: 'Verified owner (sample).',
    })
  })

  it('requireMfa() POSTs the reason to the require-mfa path', async () => {
    post.mockResolvedValue({ user: {} })
    const payload: ReasonPayload = { reason: 'Elevated risk (sample).' }
    await usersApi.requireMfa('sub-1', payload)
    expect(post).toHaveBeenCalledWith('/api/admin/users/sub-1/require-mfa', {
      reason: 'Elevated risk (sample).',
    })
  })

  it('unrequireMfa() POSTs the reason to the unrequire-mfa path', async () => {
    post.mockResolvedValue({ user: {} })
    const payload: ReasonPayload = { reason: 'Risk cleared (sample).' }
    await usersApi.unrequireMfa('sub-1', payload)
    expect(post).toHaveBeenCalledWith('/api/admin/users/sub-1/unrequire-mfa', {
      reason: 'Risk cleared (sample).',
    })
  })
})

describe('usersApi — role assignment', () => {
  it('assignRoles() PUTs the single-element role_slugs to the roles path', async () => {
    put.mockResolvedValue({ user: {} })
    const payload: AssignRolesPayload = { role_slugs: ['administrator'] }
    await usersApi.assignRoles('sub-1', payload)
    expect(put).toHaveBeenCalledWith('/api/admin/users/sub-1/roles', {
      role_slugs: ['administrator'],
    })
  })
})
