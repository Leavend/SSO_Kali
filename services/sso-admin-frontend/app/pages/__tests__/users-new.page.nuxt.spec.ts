// *.nuxt.spec.ts → 'nuxt' env: mountSuspended runs the page's async setup
// (useAsyncData via useUsersList, useI18n). The data/duplicate boundary, the
// shared privileged-action runner, the service, the session store and
// navigateTo are mocked so each branch is deterministic.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import type { AdminUserListItem, CreateUserPayload, CreateUserResponse } from '@/types/users.types'
import type { PrivilegedActionFailure, PrivilegedActionStatus } from '@/lib/users/privileged-action'

// --- service seam -----------------------------------------------------------
const createMock = vi.fn<(p: CreateUserPayload) => Promise<CreateUserResponse>>()
vi.mock('@/services/users.api', () => ({ usersApi: { create: createMock } }))

// --- duplicate-guard list ---------------------------------------------------
const listUsers = ref<readonly AdminUserListItem[]>([])
vi.mock('@/composables/useUsersList', () => ({
  useUsersList: () => ({ users: computed(() => listUsers.value) }),
}))

// --- session store ----------------------------------------------------------
const hasPermissionMock = vi.fn<(p: string) => boolean>(() => true)
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({ hasPermission: hasPermissionMock }),
}))

// --- shared privileged-action runner (the matrix lives in 4.9; here we drive
//     its observable outputs) -------------------------------------------------
const status = ref<PrivilegedActionStatus>('idle')
const isSubmitting = ref(false)
const failure = ref<PrivilegedActionFailure | null>(null)
const stepUpUrl = ref<string | null>(null)
const runMock = vi.fn<(runner: () => Promise<unknown>) => Promise<unknown>>(async (runner) => {
  status.value = 'submitting'
  isSubmitting.value = true
  try {
    const data = await runner()
    status.value = 'success'
    return data
  } finally {
    isSubmitting.value = false
  }
})
const resetMock = vi.fn(() => {
  status.value = 'idle'
  failure.value = null
})
vi.mock('@/composables/usePrivilegedAction', () => ({
  usePrivilegedAction: () => ({
    status,
    isSubmitting: computed(() => isSubmitting.value),
    failure,
    requestId: computed(() => failure.value?.requestId ?? null),
    auditEventId: computed(() => failure.value?.auditEventId ?? null),
    fieldErrors: computed(() => failure.value?.fieldErrors ?? {}),
    stepUpUrl,
    run: runMock,
    reset: resetMock,
  }),
}))

// --- navigateTo -------------------------------------------------------------
// vi.hoisted ensures navigateMock is created before mockNuxtImport's hoisted factory runs
const navigateMock = vi.hoisted(() => vi.fn(async () => {}))
mockNuxtImport('navigateTo', () => navigateMock)

function makeCreated(subjectId: string): CreateUserResponse {
  return {
    user: {
      id: 42,
      subject_id: subjectId,
      email: 'new.operator@example.test',
      given_name: 'New',
      family_name: 'Operator',
      display_name: 'New Operator',
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
      created_at: '2026-06-28T00:00:00Z',
      nik: null,
      nip: null,
      nisn: null,
      birth_date: null,
      mfa_enrolled: false,
      mfa_methods: [],
      mfa_mandatory: false,
      roles: [{ slug: 'user', name: 'User', is_system: true }],
    },
    delivery_status: 'queued',
  }
}

const UsersNew = (await import('../users/new.vue')).default

async function fillValid(wrapper: Awaited<ReturnType<typeof mountSuspended>>) {
  await wrapper.find('#create_email').setValue('New.Operator@Example.Test')
  await wrapper.find('#create_display_name').setValue('New Operator')
  await wrapper.vm.$nextTick()
}

beforeEach(() => {
  listUsers.value = []
  status.value = 'idle'
  isSubmitting.value = false
  failure.value = null
  stepUpUrl.value = null
  hasPermissionMock.mockReturnValue(true)
  createMock.mockResolvedValue(makeCreated('usr_new_42'))
  vi.clearAllMocks()
  createMock.mockResolvedValue(makeCreated('usr_new_42'))
})
afterEach(() => vi.clearAllMocks())

describe('users/new page — validation gating', () => {
  it('disables submit on an empty form', async () => {
    const wrapper = await mountSuspended(UsersNew)
    expect(wrapper.find('[data-testid="form-submit"]').attributes('disabled')).toBeDefined()
  })

  it('flags an invalid email and keeps submit disabled', async () => {
    const wrapper = await mountSuspended(UsersNew)
    await wrapper.find('#create_email').setValue('not-an-email')
    await wrapper.find('#create_display_name').setValue('Someone')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Email tidak valid'.slice(0, 5)) // localized validation_email
    expect(wrapper.find('[data-testid="form-submit"]').attributes('disabled')).toBeDefined()
  })

  it('flags a duplicate email against the loaded list', async () => {
    listUsers.value = [{ email: 'taken@example.test' } as AdminUserListItem]
    const wrapper = await mountSuspended(UsersNew)
    await wrapper.find('#create_email').setValue('TAKEN@example.test')
    await wrapper.find('#create_display_name').setValue('Someone')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="form-submit"]').attributes('disabled')).toBeDefined()
    // duplicate copy differs from the format-invalid copy
    expect(wrapper.find('#create_email-error').exists()).toBe(true)
  })

  it('flags a malformed NIK (not 16 digits) and keeps submit disabled', async () => {
    const wrapper = await mountSuspended(UsersNew)
    await fillValid(wrapper)
    await wrapper.find('#create_nik').setValue('12345') // too short
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#create_nik-error').exists()).toBe(true)
    expect(wrapper.find('[data-testid="form-submit"]').attributes('disabled')).toBeDefined()
  })

  it('clears the password + checklist when the local-account toggle goes off', async () => {
    const wrapper = await mountSuspended(UsersNew)
    await fillValid(wrapper)
    await wrapper.find('#create_password').setValue('short') // invalid → checklist + error
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-password-checklist]').exists()).toBe(true)
    await wrapper.find('[role="switch"]').trigger('click') // toggle local account OFF
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-password-checklist]').exists()).toBe(false)
    expect(wrapper.find('#create_password').exists()).toBe(false)
    // password no longer blocks submit once the local account is disabled
    expect(wrapper.find('[data-testid="form-submit"]').attributes('disabled')).toBeUndefined()
  })

  it('enables submit on a valid identity-only form (local account, no password)', async () => {
    const wrapper = await mountSuspended(UsersNew)
    await fillValid(wrapper)
    expect(wrapper.find('[data-testid="form-submit"]').attributes('disabled')).toBeUndefined()
  })
})

describe('users/new page — create privileged-action matrix', () => {
  it('4.1 success → create called with a normalized payload, then navigates to detail', async () => {
    const wrapper = await mountSuspended(UsersNew)
    await fillValid(wrapper)
    await wrapper.find('#create_password').setValue('Sup3rSecret!Pass')
    await wrapper.find('#create_nik').setValue('3201234567890001')
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="form-submit"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(createMock).toHaveBeenCalledTimes(1)
    const payload = createMock.mock.calls[0]![0]
    expect(payload.email).toBe('new.operator@example.test') // lowercased
    expect(payload.display_name).toBe('New Operator')
    expect(payload.role).toBe('user')
    expect(payload.local_account_enabled).toBe(true)
    expect(payload.password).toBe('Sup3rSecret!Pass')
    expect(payload.nik).toBe('3201234567890001')
    expect(navigateMock).toHaveBeenCalledWith({
      name: 'admin.users.detail',
      params: { subjectId: 'usr_new_42' },
    })
  })

  it('omits password from the payload when the local account is disabled', async () => {
    const wrapper = await mountSuspended(UsersNew)
    await fillValid(wrapper)
    await wrapper.find('#create_password').setValue('Sup3rSecret!Pass')
    await wrapper.find('[role="switch"]').trigger('click') // disable local account
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="form-submit"]').trigger('click')
    await wrapper.vm.$nextTick()
    const payload = createMock.mock.calls[0]![0]
    expect('password' in payload).toBe(false)
    expect(payload.local_account_enabled).toBe(false)
  })

  it('4.2 forbidden / 403 → forbidden surface, no navigation', async () => {
    runMock.mockImplementationOnce(async () => {
      status.value = 'forbidden'
      failure.value = {
        status: 'forbidden',
        requestId: 'admin-req-DENIED42',
        auditEventId: null,
        fieldErrors: {},
        stepUpUrl: null,
      }
      isSubmitting.value = false
      return null
    })
    const wrapper = await mountSuspended(UsersNew)
    await fillValid(wrapper)
    await wrapper.find('[data-testid="form-submit"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('forbidden')
    expect(navigateMock).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('admin-req-DENIED42') // redacted to REF-
    expect(wrapper.text()).toContain('REF-')
  })

  it('4.3 unauthenticated / 401 (and 419) → step-up tone surface', async () => {
    runMock.mockImplementationOnce(async () => {
      status.value = 'unauthenticated'
      failure.value = {
        status: 'unauthenticated',
        requestId: null,
        auditEventId: null,
        fieldErrors: {},
        stepUpUrl: null,
      }
      isSubmitting.value = false
      return null
    })
    const wrapper = await mountSuspended(UsersNew)
    await fillValid(wrapper)
    await wrapper.find('[data-testid="form-submit"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('step_up')
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('4.5 rate limit / 429 → safe rate-limited copy, no raw exception', async () => {
    runMock.mockImplementationOnce(async () => {
      status.value = 'rate_limited'
      failure.value = {
        status: 'rate_limited',
        requestId: 'admin-req-RL',
        auditEventId: null,
        fieldErrors: {},
        stepUpUrl: null,
      }
      isSubmitting.value = false
      return null
    })
    const wrapper = await mountSuspended(UsersNew)
    await fillValid(wrapper)
    await wrapper.find('[data-testid="form-submit"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('error')
    expect(wrapper.text()).not.toMatch(/SQLSTATE|stack trace|Bearer/i)
  })

  it('4.6 validation / 422 → server field errors bind to fields, no navigation', async () => {
    runMock.mockImplementationOnce(async () => {
      status.value = 'invalid'
      failure.value = {
        status: 'invalid',
        requestId: null,
        auditEventId: null,
        fieldErrors: { email: ['Email already registered.'], nip: ['NIP already registered.'] },
        stepUpUrl: null,
      }
      isSubmitting.value = false
      return null
    })
    const wrapper = await mountSuspended(UsersNew)
    await fillValid(wrapper)
    await wrapper.find('[data-testid="form-submit"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#create_email-error').text()).toContain('Email already registered.')
    expect(wrapper.find('#create_nip-error').text()).toContain('NIP already registered.')
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('4.7 step-up / 428 → step-up notice + re-auth link to step_up_url, no navigation', async () => {
    runMock.mockImplementationOnce(async () => {
      status.value = 'step_up_required'
      stepUpUrl.value = '/auth/login?prompt=login&max_age=0'
      failure.value = {
        status: 'step_up_required',
        requestId: null,
        auditEventId: null,
        fieldErrors: {},
        stepUpUrl: '/auth/login?prompt=login&max_age=0',
      }
      isSubmitting.value = false
      return null
    })
    const wrapper = await mountSuspended(UsersNew)
    await fillValid(wrapper)
    await wrapper.find('[data-testid="form-submit"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('step_up')
    const link = wrapper.find('[data-testid="step-up-link"]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/auth/login?prompt=login&max_age=0')
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('4.8 backend 5xx → error tone surface with safe copy + redacted reference', async () => {
    runMock.mockImplementationOnce(async () => {
      status.value = 'error'
      failure.value = {
        status: 'error',
        requestId: 'admin-req-FAILED99',
        auditEventId: null,
        fieldErrors: {},
        stepUpUrl: null,
      }
      isSubmitting.value = false
      return null
    })
    const wrapper = await mountSuspended(UsersNew)
    await fillValid(wrapper)
    await wrapper.find('[data-testid="form-submit"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('error')
    expect(wrapper.text()).toContain('REF-')
    expect(wrapper.text()).not.toContain('admin-req-FAILED99')
  })

  it('4.10 leaves no stale loading/disabled state after an error (valid form stays submittable)', async () => {
    runMock.mockImplementationOnce(async () => {
      status.value = 'error'
      failure.value = {
        status: 'error',
        requestId: null,
        auditEventId: null,
        fieldErrors: {},
        stepUpUrl: null,
      }
      isSubmitting.value = false
      return null
    })
    const wrapper = await mountSuspended(UsersNew)
    await fillValid(wrapper)
    await wrapper.find('[data-testid="form-submit"]').trigger('click')
    await wrapper.vm.$nextTick()
    const submit = wrapper.find('[data-testid="form-submit"]')
    expect(submit.attributes('disabled')).toBeUndefined()
    expect(submit.attributes('aria-busy')).toBeUndefined()
  })

  it('does nothing (no run, no create) when submit is invoked on an invalid form', async () => {
    const wrapper = await mountSuspended(UsersNew)
    // form is empty → invalid
    await wrapper.find('[data-testid="form-submit"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(runMock).not.toHaveBeenCalled()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('never leaks a token or raw PII shape into the rendered output', async () => {
    const wrapper = await mountSuspended(UsersNew)
    await fillValid(wrapper)
    await wrapper.vm.$nextTick()
    const html = wrapper.html()
    expect(html).not.toMatch(/access_token|refresh_token|id_token|Bearer/)
    expect(html).not.toMatch(/\b\d{16}\b|\b\d{18}\b|\b\d{10}\b/) // raw NIK/NIP/NISN shapes
  })
})
