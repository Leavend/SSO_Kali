import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, ref } from 'vue'
import type { AdminClientDetail } from '@/types/clients.types'
import type { PrivilegedActionFailure } from '@/lib/users/privileged-action'

const clientsApi = {
  update: vi.fn<(id: string, payload: unknown) => Promise<unknown>>(),
  syncScopes: vi.fn<(id: string, payload: unknown) => Promise<unknown>>(),
}
vi.mock('@/services/clients.api', () => ({ clientsApi }))

const validateUriPolicy = vi.fn<(input: unknown) => string | null>(() => null)
vi.mock('@/lib/clients/client-create-form', () => ({ validateUriPolicy }))

let permitted: string[] = []
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({ hasPermission: (p: string) => permitted.includes(p) }),
}))
vi.mock('@/composables/useI18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

const isSubmitting = ref(false)
const failure = ref<PrivilegedActionFailure | null>(null)
const runImpl = vi.fn<(fn: () => Promise<unknown>) => Promise<unknown>>(async (fn) => fn())
vi.mock('@/composables/usePrivilegedAction', () => ({
  usePrivilegedAction: () => ({
    status: ref('idle'),
    isSubmitting,
    failure,
    requestId: computed(() => failure.value?.requestId ?? null),
    auditEventId: computed(() => failure.value?.auditEventId ?? null),
    fieldErrors: computed(() => failure.value?.fieldErrors ?? {}),
    stepUpUrl: computed(() => failure.value?.stepUpUrl ?? null),
    run: runImpl,
    reset: () => {
      failure.value = null
      isSubmitting.value = false
    },
  }),
}))

// Dynamic import after the vi.mock registrations + top-level doubles: a static
// `import … from` is hoisted ABOVE these consts, so the mock factories would
// dereference them before initialization (TDZ). Mirrors UserLifecycleActions.spec.
const ClientUriPolicyForm = (await import('../ClientUriPolicyForm.vue')).default

const client = {
  client_id: 'portal',
  redirect_uris: ['https://app.example/callback'],
  post_logout_redirect_uris: ['https://app.example'],
  backchannel_logout_uri: 'https://app.example/bclogout',
} as unknown as AdminClientDetail

function mountForm() {
  return mount(ClientUriPolicyForm, { props: { client } })
}

beforeEach(() => {
  vi.clearAllMocks()
  permitted = ['admin.clients.write']
  isSubmitting.value = false
  failure.value = null
  validateUriPolicy.mockReturnValue(null)
  runImpl.mockImplementation(async (fn: () => Promise<unknown>) => fn())
  clientsApi.update.mockResolvedValue({ client })
})

describe('ClientUriPolicyForm — permission gating', () => {
  it('renders nothing when the operator may not write', () => {
    permitted = []
    expect(mountForm().find('[data-testid="client-uri-policy-form"]').exists()).toBe(false)
  })
})

describe('ClientUriPolicyForm — validation + submit', () => {
  it('pre-fills redirect/logout URIs one-per-line from the client prop', () => {
    const w = mountForm()
    expect((w.find('#client-redirect-uris').element as HTMLTextAreaElement).value).toBe(
      'https://app.example/callback',
    )
  })
  it('blocks submit and shows the validator error when validateUriPolicy returns a key', async () => {
    validateUriPolicy.mockReturnValue('clients.validation_redirect_uri')
    const w = mountForm()
    await w.find('[data-testid="client-uri-policy-form"]').trigger('submit')
    expect(clientsApi.update).not.toHaveBeenCalled()
    expect(w.find('[data-testid="uri-policy-validation"]').text()).toContain(
      'clients.validation_redirect_uri',
    )
  })
  it('parses lines, nulls an empty backchannel, submits the URI policy and emits done', async () => {
    const w = mountForm()
    await w.find('#client-redirect-uris').setValue('https://a.example/cb\n  https://b.example/cb ')
    await w.find('#client-post-logout-uris').setValue('https://a.example')
    await w.find('#client-backchannel-uri').setValue('   ')
    await w.find('[data-testid="client-uri-policy-form"]').trigger('submit')
    await w.vm.$nextTick()
    expect(clientsApi.update).toHaveBeenCalledWith('portal', {
      redirect_uris: ['https://a.example/cb', 'https://b.example/cb'],
      post_logout_redirect_uris: ['https://a.example'],
      backchannel_logout_uri: null,
    })
    expect(w.emitted('done')).toHaveLength(1)
  })
})

describe('ClientUriPolicyForm — failure surface (:write step-up representative)', () => {
  it('surfaces a step-up failure with link + REF and no stale loading', async () => {
    runImpl.mockImplementation(async () => {
      failure.value = {
        status: 'step_up_required',
        requestId: 'req-uri-44556677',
        auditEventId: null,
        fieldErrors: {},
        stepUpUrl: '/auth/login?prompt=login',
      }
      isSubmitting.value = false
      return null
    })
    const w = mountForm()
    await w.find('[data-testid="client-uri-policy-form"]').trigger('submit')
    await w.vm.$nextTick()
    const banner = w.find('[data-testid="uri-policy-error"]')
    expect(banner.exists()).toBe(true)
    expect(w.find('[data-testid="uri-policy-stepup-link"]').attributes('href')).toBe(
      '/auth/login?prompt=login',
    )
    expect(w.text()).toContain('REF-')
    expect(w.text()).not.toContain('req-uri-44556677')
    expect(w.emitted('done')).toBeUndefined()
    expect(isSubmitting.value).toBe(false)
  })
})
