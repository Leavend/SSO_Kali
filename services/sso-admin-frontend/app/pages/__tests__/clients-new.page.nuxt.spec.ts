// *.nuxt.spec.ts → 'nuxt' env: mountSuspended runs the page's async setup
// (useScopeCatalog, useI18n). The service seam, the scope catalog, the shared
// privileged-action runner, the session store and navigateTo are mocked so each
// branch is deterministic.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import ClientSecretReveal from '@/components/clients/ClientSecretReveal.vue'
import type {
  ClientCreatePayload,
  CreateClientResponse,
  ClientIntegrationResponse,
  ScopeCatalogEntry,
} from '@/types/clients.types'
import type { PrivilegedActionFailure, PrivilegedActionStatus } from '@/lib/users/privileged-action'

// --- service seam -----------------------------------------------------------
const createMock = vi.fn<(p: ClientCreatePayload) => Promise<CreateClientResponse>>()
const stageMock = vi.fn<(p: ClientCreatePayload) => Promise<ClientIntegrationResponse>>()
vi.mock('@/services/clients.api', () => ({
  clientsApi: { create: createMock, stage: stageMock },
}))

// --- scope catalog (fail-closed hint list) ----------------------------------
const catalog = ref<readonly ScopeCatalogEntry[]>([])
vi.mock('@/composables/useScopeCatalog', () => ({
  useScopeCatalog: () => ({
    scopes: computed(() => catalog.value),
    pending: computed(() => false),
    error: computed(() => null),
  }),
}))

// --- session store ----------------------------------------------------------
const hasPermissionMock = vi.fn<(p: string) => boolean>(() => true)
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({ hasPermission: hasPermissionMock }),
}))

// --- shared privileged-action runner (the matrix lives in Phase 4; here we
//     drive its observable outputs) ------------------------------------------
const status = ref<PrivilegedActionStatus>('idle')
const isSubmitting = ref(false)
const failure = ref<PrivilegedActionFailure | null>(null)
const stepUpUrl = ref<string | null>(null)
const runMock = vi.fn<(runner: () => Promise<unknown>) => Promise<unknown>>(async (runner) => {
  status.value = 'submitting'
  isSubmitting.value = true
  failure.value = null
  try {
    const data = await runner()
    status.value = 'success'
    return data
  } catch {
    return null
  } finally {
    isSubmitting.value = false
  }
})
const resetMock = vi.fn<() => void>(() => {
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
// vi.hoisted ensures navigateMock exists before mockNuxtImport's hoisted factory runs
const navigateMock = vi.hoisted(() => vi.fn<() => Promise<void>>(async () => {}))
mockNuxtImport('navigateTo', () => navigateMock)

function makeCreated(secret: string | undefined): CreateClientResponse {
  return {
    registration: {
      client_id: 'selamat-kerja',
      display_name: 'Selamat Kerja',
      type: secret ? 'confidential' : 'public',
      environment: 'development',
      app_base_url: 'https://selamat-kerja.example.test',
      redirect_uris: ['https://selamat-kerja.example.test/auth/callback'],
      allowed_scopes: ['openid', 'profile'],
      status: 'staged',
      has_secret_hash: Boolean(secret),
    },
    ...(secret ? { plaintext_secret: secret } : {}),
  }
}

const ClientsNew = (await import('../clients/new.vue')).default

// fill a confidential, valid form (scopes input always yields openid + the typed set)
async function fillValid(
  wrapper: Awaited<ReturnType<typeof mountSuspended>>,
  type: 'confidential' | 'public' = 'confidential',
) {
  await wrapper.find('#create_display_name').setValue('Selamat Kerja')
  await wrapper.find('#create_owner_email').setValue('ops@example.test')
  await wrapper.find('#create_client_type').setValue(type)
  await wrapper.find('#create_category').setValue('kepegawaian')
  await wrapper
    .find('#create_redirect_uri')
    .setValue('https://selamat-kerja.example.test/auth/callback')
  await wrapper.find('#create_scopes').setValue('profile email')
  await wrapper.vm.$nextTick()
}

beforeEach(() => {
  catalog.value = [
    { name: 'openid', description: 'OpenID', claims: ['sub'], default_allowed: true },
    { name: 'profile', description: 'Profile', claims: ['name'], default_allowed: true },
  ]
  status.value = 'idle'
  isSubmitting.value = false
  failure.value = null
  stepUpUrl.value = null
  hasPermissionMock.mockReturnValue(true)
  vi.clearAllMocks()
  createMock.mockResolvedValue(makeCreated('topsecret-plaintext-XYZ'))
  stageMock.mockResolvedValue({ registration: makeCreated(undefined).registration })
})
afterEach(() => vi.clearAllMocks())

describe('clients/new page — validation gating', () => {
  it('disables submit on an empty form', async () => {
    const wrapper = await mountSuspended(ClientsNew)
    expect(wrapper.find('[data-testid="form-submit"]').attributes('disabled')).toBeDefined()
  })

  it('auto-slugs the client_id from the display name and flags it valid', async () => {
    const wrapper = await mountSuspended(ClientsNew)
    await wrapper.find('#create_display_name').setValue('Selamat Kerja')
    await wrapper.vm.$nextTick()
    expect((wrapper.find('#create_client_id').element as HTMLInputElement).value).toBe(
      'selamat-kerja',
    )
    expect(wrapper.find('[data-testid="client-id-valid"]').exists()).toBe(true)
  })

  it('flags an invalid (too-short) client_id and keeps submit disabled', async () => {
    const wrapper = await mountSuspended(ClientsNew)
    await fillValid(wrapper)
    await wrapper.find('#create_client_id').setValue('ab') // < 3 chars
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="client-id-invalid"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="form-submit"]').attributes('disabled')).toBeDefined()
  })

  it('keeps submit disabled until a category is chosen (category is required)', async () => {
    const wrapper = await mountSuspended(ClientsNew)
    await wrapper.find('#create_display_name').setValue('Selamat Kerja')
    await wrapper.find('#create_owner_email').setValue('ops@example.test')
    await wrapper.find('#create_client_type').setValue('confidential')
    await wrapper
      .find('#create_redirect_uri')
      .setValue('https://selamat-kerja.example.test/auth/callback')
    await wrapper.find('#create_scopes').setValue('profile')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="form-submit"]').attributes('disabled')).toBeDefined()
    await wrapper.find('#create_category').setValue('kepegawaian')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="form-submit"]').attributes('disabled')).toBeUndefined()
  })

  it('flags an invalid redirect URI (wildcard) and keeps submit disabled', async () => {
    const wrapper = await mountSuspended(ClientsNew)
    await fillValid(wrapper)
    await wrapper.find('#create_redirect_uri').setValue('https://*.example.test/cb')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#create_redirect_uri-error').exists()).toBe(true)
    expect(wrapper.find('[data-testid="form-submit"]').attributes('disabled')).toBeDefined()
  })

  it('enables submit on a valid form', async () => {
    const wrapper = await mountSuspended(ClientsNew)
    await fillValid(wrapper)
    expect(wrapper.find('[data-testid="form-submit"]').attributes('disabled')).toBeUndefined()
  })
})

describe('clients/new page — create privileged-action matrix', () => {
  it('4.1 confidential success → create called with openid-forced scopes, reveals the secret once, no navigation yet', async () => {
    const wrapper = await mountSuspended(ClientsNew)
    await fillValid(wrapper)
    await wrapper.find('[data-testid="form-submit"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(createMock).toHaveBeenCalledTimes(1)
    const payload = createMock.mock.calls[0]![0]
    expect(payload.client_id).toBe('selamat-kerja')
    expect(payload.category).toBe('kepegawaian')
    expect(payload.client_type).toBe('confidential')
    expect(payload.allowed_scopes).toContain('openid') // openid forced even though not typed
    expect(payload.allowed_scopes).toContain('profile')

    const reveal = wrapper.findComponent(ClientSecretReveal)
    expect(reveal.props('open')).toBe(true)
    expect(reveal.props('secret')).toBe('topsecret-plaintext-XYZ')
    expect(navigateMock).not.toHaveBeenCalled() // navigation deferred to reveal close
  })

  it('public success → no secret reveal, navigates straight to the detail route', async () => {
    createMock.mockResolvedValueOnce(makeCreated(undefined))
    const wrapper = await mountSuspended(ClientsNew)
    await fillValid(wrapper, 'public')
    await wrapper.find('[data-testid="form-submit"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(ClientSecretReveal).props('open')).toBe(false)
    expect(navigateMock).toHaveBeenCalledWith({
      name: 'admin.clients.detail',
      params: { clientId: 'selamat-kerja' },
    })
  })

  it('stage path posts clientsApi.stage (no create, no secret) and navigates to detail', async () => {
    const wrapper = await mountSuspended(ClientsNew)
    await fillValid(wrapper)
    await wrapper.find('[data-testid="form-stage"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(stageMock).toHaveBeenCalledTimes(1)
    expect(createMock).not.toHaveBeenCalled()
    expect(wrapper.findComponent(ClientSecretReveal).props('open')).toBe(false)
    expect(navigateMock).toHaveBeenCalledWith({
      name: 'admin.clients.detail',
      params: { clientId: 'selamat-kerja' },
    })
  })

  it('4.2 forbidden / 403 → forbidden surface, no navigation, redacted reference', async () => {
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
    const wrapper = await mountSuspended(ClientsNew)
    await fillValid(wrapper)
    await wrapper.find('[data-testid="form-submit"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('forbidden')
    expect(navigateMock).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('admin-req-DENIED42')
    expect(wrapper.text()).toContain('REF-')
  })

  it('4.3 unauthenticated / 401 (and 419) → step-up tone surface, no navigation', async () => {
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
    const wrapper = await mountSuspended(ClientsNew)
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
    const wrapper = await mountSuspended(ClientsNew)
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
        fieldErrors: { client_id: ['client_id already registered.'] },
        stepUpUrl: null,
      }
      isSubmitting.value = false
      return null
    })
    const wrapper = await mountSuspended(ClientsNew)
    await fillValid(wrapper)
    await wrapper.find('[data-testid="form-submit"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#create_client_id-error').text()).toContain('already registered.')
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
    const wrapper = await mountSuspended(ClientsNew)
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
    const wrapper = await mountSuspended(ClientsNew)
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
    const wrapper = await mountSuspended(ClientsNew)
    await fillValid(wrapper)
    await wrapper.find('[data-testid="form-submit"]').trigger('click')
    await wrapper.vm.$nextTick()
    const submit = wrapper.find('[data-testid="form-submit"]')
    expect(submit.attributes('disabled')).toBeUndefined()
    expect(submit.attributes('aria-busy')).toBeUndefined()
  })

  it('does nothing (no run, no create) when submit is invoked on an invalid form', async () => {
    const wrapper = await mountSuspended(ClientsNew)
    await wrapper.find('[data-testid="form-submit"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(runMock).not.toHaveBeenCalled()
    expect(createMock).not.toHaveBeenCalled()
  })
})

describe('clients/new page — one-time secret discipline', () => {
  it('reveals the secret once, then on close nulls the ref (secret absent from DOM) and navigates to detail', async () => {
    const wrapper = await mountSuspended(ClientsNew)
    await fillValid(wrapper)
    await wrapper.find('[data-testid="form-submit"]').trigger('click')
    await wrapper.vm.$nextTick()

    const reveal = wrapper.findComponent(ClientSecretReveal)
    expect(reveal.props('secret')).toBe('topsecret-plaintext-XYZ')

    // closing the modal nulls the client-only ref and navigates
    reveal.vm.$emit('close')
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(ClientSecretReveal).props('open')).toBe(false)
    expect(wrapper.findComponent(ClientSecretReveal).props('secret')).toBeNull()
    expect(wrapper.html()).not.toContain('topsecret-plaintext-XYZ')
    expect(navigateMock).toHaveBeenCalledWith({
      name: 'admin.clients.detail',
      params: { clientId: 'selamat-kerja' },
    })
  })

  it('never persists the plaintext secret to localStorage / sessionStorage', async () => {
    const wrapper = await mountSuspended(ClientsNew)
    await fillValid(wrapper)
    await wrapper.find('[data-testid="form-submit"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(JSON.stringify(window.localStorage)).not.toContain('topsecret-plaintext-XYZ')
    expect(JSON.stringify(window.sessionStorage)).not.toContain('topsecret-plaintext-XYZ')
  })

  it('SSR-renders the empty form with no client_secret field name or token shape in the markup', async () => {
    const wrapper = await mountSuspended(ClientsNew)
    const html = wrapper.html()
    expect(html).not.toMatch(/client_secret|clientSecret/)
    expect(html).not.toMatch(/access_token|refresh_token|id_token|Bearer/)
  })
})
