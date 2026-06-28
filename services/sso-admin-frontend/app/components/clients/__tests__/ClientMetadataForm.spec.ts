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
const ClientMetadataForm = (await import('../ClientMetadataForm.vue')).default

const client = {
  client_id: 'portal',
  display_name: 'SSO Portal',
  owner_email: 'owner@example.com',
  redirect_uris: ['https://app.example/callback'],
  has_secret_hash: true,
} as unknown as AdminClientDetail

function mountForm() {
  return mount(ClientMetadataForm, { props: { client } })
}

beforeEach(() => {
  vi.clearAllMocks()
  permitted = ['admin.clients.write']
  isSubmitting.value = false
  failure.value = null
  runImpl.mockImplementation(async (fn: () => Promise<unknown>) => fn())
  clientsApi.update.mockResolvedValue({ client })
})

describe('ClientMetadataForm — permission gating', () => {
  it('renders the form when the operator may write', () => {
    expect(mountForm().find('[data-testid="client-metadata-form"]').exists()).toBe(true)
  })
  it('renders nothing when the operator may not write', () => {
    permitted = []
    expect(mountForm().find('[data-testid="client-metadata-form"]').exists()).toBe(false)
  })
})

describe('ClientMetadataForm — validation + submit', () => {
  it('pre-fills the current metadata from the client prop', () => {
    const w = mountForm()
    expect((w.find('#client-display-name').element as HTMLInputElement).value).toBe('SSO Portal')
    expect((w.find('#client-owner-email').element as HTMLInputElement).value).toBe(
      'owner@example.com',
    )
  })
  it('disables submit + calls no API when the owner email is malformed', async () => {
    const w = mountForm()
    await w.find('#client-owner-email').setValue('not-an-email')
    await w.find('[data-testid="client-metadata-form"]').trigger('submit')
    expect(clientsApi.update).not.toHaveBeenCalled()
  })
  it('submits only the metadata fields and emits done on success', async () => {
    const w = mountForm()
    await w.find('#client-display-name').setValue('SSO Portal v2')
    await w.find('[data-testid="client-metadata-form"]').trigger('submit')
    await w.vm.$nextTick()
    expect(clientsApi.update).toHaveBeenCalledWith('portal', {
      display_name: 'SSO Portal v2',
      owner_email: 'owner@example.com',
    })
    expect(w.emitted('done')).toHaveLength(1)
  })
})

describe('ClientMetadataForm — failure matrix (401/403/419/422/428:write/429/5xx)', () => {
  const cases: { status: PrivilegedActionFailure['status']; stepUpUrl: string | null }[] = [
    { status: 'forbidden', stepUpUrl: null }, // 403
    { status: 'unauthenticated', stepUpUrl: null }, // 401 / 419
    { status: 'rate_limited', stepUpUrl: null }, // 429
    { status: 'invalid', stepUpUrl: null }, // 422
    { status: 'step_up_required', stepUpUrl: '/auth/login?prompt=login' }, // 428 (:write stale)
    { status: 'error', stepUpUrl: null }, // 5xx
  ]
  for (const c of cases) {
    it(`surfaces ${c.status} safely with a redacted REF and no stale loading`, async () => {
      runImpl.mockImplementation(async () => {
        failure.value = {
          status: c.status,
          requestId: 'req-meta-99887766',
          auditEventId: 'aud-1',
          fieldErrors: c.status === 'invalid' ? { display_name: ['too long'] } : {},
          stepUpUrl: c.stepUpUrl,
        }
        isSubmitting.value = false
        return null
      })
      const w = mountForm()
      await w.find('#client-display-name').setValue('New name')
      await w.find('[data-testid="client-metadata-form"]').trigger('submit')
      await w.vm.$nextTick()
      const banner = w.find('[data-testid="metadata-error"]')
      expect(banner.exists()).toBe(true)
      expect(banner.text()).toContain('common.error_generic')
      expect(w.text()).toContain('REF-')
      expect(w.text()).not.toContain('req-meta-99887766')
      expect(w.emitted('done')).toBeUndefined()
      expect(isSubmitting.value).toBe(false)
      // Step-up link is present only for the :write-stale 428 case. Assertions are
      // unconditional (no-conditional-expect): the href is read via a ternary value
      // expression, then a single expect drives both arms off the case fixture.
      const link = w.find('[data-testid="metadata-stepup-link"]')
      expect(link.exists()).toBe(c.stepUpUrl !== null)
      expect((link.exists() ? link.attributes('href') : null) ?? null).toBe(c.stepUpUrl)
    })
  }
})
