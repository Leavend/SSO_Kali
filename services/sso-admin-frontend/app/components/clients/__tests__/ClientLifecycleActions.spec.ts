import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, ref } from 'vue'
import type { PrivilegedActionFailure } from '@/lib/users/privileged-action'
import type { ClientActionId } from '@/lib/clients/client-actions'

const clientsApi = {
  activate: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  disable: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  decommission: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  delete: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}
vi.mock('@/services/clients.api', () => ({ clientsApi }))

let permitted: string[] = []
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({ hasPermission: (p: string) => permitted.includes(p) }),
}))
vi.mock('@/composables/useI18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

// Controllable privileged-action runner double (mirrors the Task 4.11 mock).
const isSubmitting = ref(false)
const failure = ref<PrivilegedActionFailure | null>(null)
const runImpl = vi.fn<(fn: () => Promise<unknown>) => Promise<unknown>>(async (fn) => fn())
vi.mock('@/composables/usePrivilegedAction', () => ({
  usePrivilegedAction: () => ({
    status: ref('idle'),
    isSubmitting,
    failure,
    // Reactive computeds: a static ref(failure.value?…) would be read once at setup
    // (failure null) and never update after runImpl sets failure.value.
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

// Dynamic import after the vi.mock registrations + top-level doubles (TDZ-safe).
const ClientLifecycleActions = (await import('../ClientLifecycleActions.vue')).default

// The failure matrix is exercised through one representative destructive action;
// typing it against ClientActionId pins the test to the real descriptor union
// (asserts the surface, not the matrix internals — that is Task 4.9's spec).
const MATRIX_ACTION = 'decommission' satisfies ClientActionId

const client = {
  client_id: 'selamat-kerja',
  display_name: 'Selamat Kerja',
  type: 'confidential',
  category: 'kepegawaian',
  status: 'active',
  has_secret_hash: true,
  redirect_uris: ['https://selamat-kerja.example.test/auth/callback'],
} as unknown as import('@/types/clients.types').AdminClientDetail

const DialogStub = {
  name: 'PrivilegedActionDialog',
  props: [
    'open',
    'title',
    'description',
    'danger',
    'reasonLabel',
    'reasonRequired',
    'reasonMin',
    'reasonMax',
    'reason',
    'submitting',
    'stepUpUrl',
    'errorMessage',
    'requestId',
  ],
  emits: ['confirm', 'cancel', 'update:reason'],
  template: `<div v-if="open" data-testid="dialog" :data-danger="danger">
    <p data-testid="dialog-desc">{{ description }}</p>
    <p data-testid="dialog-reason-label">{{ reasonLabel }}</p>
    <p data-testid="dialog-error">{{ errorMessage }}</p>
    <p data-testid="dialog-ref">{{ requestId }}</p>
    <input data-testid="dialog-reason" :value="reason" @input="$emit('update:reason', $event.target.value)" />
    <button data-testid="dialog-confirm" @click="$emit('confirm')">confirm</button>
    <button data-testid="dialog-cancel" @click="$emit('cancel')">cancel</button>
  </div>`,
}

function mountActions(over: Partial<typeof client> = {}) {
  return mount(ClientLifecycleActions, {
    props: { client: { ...client, ...over } as typeof client },
    global: { stubs: { PrivilegedActionDialog: DialogStub }, renderStubDefaultSlot: true },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  permitted = ['admin.clients.write', 'admin.sessions.terminate']
  isSubmitting.value = false
  failure.value = null
  runImpl.mockImplementation(async (fn: () => Promise<unknown>) => fn())
})

describe('ClientLifecycleActions — dual-permission gating', () => {
  it('renders lifecycle buttons only when BOTH permissions are held', () => {
    const w = mountActions()
    expect(w.find('[data-action="disable"]').exists()).toBe(true)
    expect(w.find('[data-action="delete"]').exists()).toBe(true)
  })
  it('hides every action when sessions-terminate is missing', () => {
    permitted = ['admin.clients.write']
    const w = mountActions()
    expect(w.find('[data-action="disable"]').exists()).toBe(false)
    expect(w.text()).toContain('clients.actions_none')
  })
})

describe('ClientLifecycleActions — applicability by status', () => {
  it('disables activate on an active client and enables disable/decommission/delete', () => {
    const w = mountActions({ status: 'active' })
    expect(w.find('[data-action="activate"]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-action="disable"]').attributes('disabled')).toBeUndefined()
    expect(w.find('[data-action="decommission"]').attributes('disabled')).toBeUndefined()
    expect(w.find('[data-action="delete"]').attributes('disabled')).toBeUndefined()
  })
  it('enables activate and disables disable on a staged client', () => {
    const w = mountActions({ status: 'staged' })
    expect(w.find('[data-action="activate"]').attributes('disabled')).toBeUndefined()
    expect(w.find('[data-action="disable"]').attributes('disabled')).toBeDefined()
  })
})

describe('ClientLifecycleActions — confirm vs cancel', () => {
  it('opens the confirm dialog and does NOT call the API yet', async () => {
    const w = mountActions()
    await w.find('[data-action="disable"]').trigger('click')
    expect(w.find('[data-testid="dialog"]').exists()).toBe(true)
    expect(clientsApi.disable).not.toHaveBeenCalled()
  })
  it('marks the destructive dialog danger and cancel calls NO api', async () => {
    const w = mountActions()
    await w.find('[data-action="disable"]').trigger('click')
    expect(w.find('[data-testid="dialog"]').attributes('data-danger')).toBe('true')
    await w.find('[data-testid="dialog-cancel"]').trigger('click')
    expect(w.find('[data-testid="dialog"]').exists()).toBe(false)
    expect(clientsApi.disable).not.toHaveBeenCalled()
  })
})

describe('ClientLifecycleActions — success paths (4.1)', () => {
  it('activate posts an empty payload and emits done', async () => {
    const w = mountActions({ status: 'staged' })
    await w.find('[data-action="activate"]').trigger('click')
    await w.find('[data-testid="dialog-confirm"]').trigger('click')
    await w.vm.$nextTick()
    expect(clientsApi.activate).toHaveBeenCalledWith('selamat-kerja', {})
    expect(w.emitted('done')).toHaveLength(1)
    expect(w.emitted('deleted')).toBeUndefined()
  })
  it('disable forwards the trimmed reason and emits done', async () => {
    const w = mountActions()
    await w.find('[data-action="disable"]').trigger('click')
    await w.find('[data-testid="dialog-reason"]').setValue('Vendor offboarded')
    await w.find('[data-testid="dialog-confirm"]').trigger('click')
    await w.vm.$nextTick()
    expect(clientsApi.disable).toHaveBeenCalledWith('selamat-kerja', {
      reason: 'Vendor offboarded',
    })
    expect(w.emitted('done')).toHaveLength(1)
  })
})

describe('ClientLifecycleActions — delete type-to-confirm', () => {
  it('blocks delete and shows an inline error until the typed client_id matches', async () => {
    const w = mountActions()
    await w.find('[data-action="delete"]').trigger('click')
    expect(w.find('[data-testid="dialog-reason-label"]').text()).toBe(
      'clients.label_delete_confirmation',
    )
    await w.find('[data-testid="dialog-reason"]').setValue('wrong-id')
    await w.find('[data-testid="dialog-confirm"]').trigger('click')
    await w.vm.$nextTick()
    expect(clientsApi.delete).not.toHaveBeenCalled()
    expect(w.find('[data-testid="dialog-error"]').text()).toBe('clients.delete_confirmation_error')
    expect(w.find('[data-testid="dialog"]').exists()).toBe(true) // stays open
  })
  it('deletes and emits deleted (not done) once the exact client_id is typed', async () => {
    const w = mountActions()
    await w.find('[data-action="delete"]').trigger('click')
    await w.find('[data-testid="dialog-reason"]').setValue('selamat-kerja')
    await w.find('[data-testid="dialog-confirm"]').trigger('click')
    await w.vm.$nextTick()
    expect(clientsApi.delete).toHaveBeenCalledWith('selamat-kerja')
    expect(w.emitted('deleted')).toHaveLength(1)
    expect(w.emitted('done')).toBeUndefined()
  })
})

describe('ClientLifecycleActions — failure matrix (401/403/419/422/428/429/5xx)', () => {
  const cases: { status: PrivilegedActionFailure['status']; stepUpUrl: string | null }[] = [
    { status: 'forbidden', stepUpUrl: null }, // 403 incl. seeded-403 decommission
    { status: 'unauthenticated', stepUpUrl: null }, // 401 + 419
    { status: 'rate_limited', stepUpUrl: null }, // 429
    { status: 'invalid', stepUpUrl: null }, // 422 client_integration_invalid
    { status: 'step_up_required', stepUpUrl: '/auth/login?prompt=login&max_age=0' }, // 428
    { status: 'error', stepUpUrl: null }, // 5xx
  ]
  for (const c of cases) {
    it(`surfaces ${c.status} safely with a redacted REF and no stale loading`, async () => {
      runImpl.mockImplementation(async () => {
        failure.value = {
          status: c.status,
          requestId: 'req-clients-9911',
          auditEventId: 'aud-1',
          fieldErrors: {},
          stepUpUrl: c.stepUpUrl,
        }
        isSubmitting.value = false // never left submitting after error
        return null
      })
      const w = mountActions()
      await w.find(`[data-action="${MATRIX_ACTION}"]`).trigger('click')
      await w.find('[data-testid="dialog-confirm"]').trigger('click')
      await w.vm.$nextTick()
      expect(w.find('[data-testid="dialog"]').exists()).toBe(true) // stays open to show the failure
      expect(w.find('[data-testid="dialog-ref"]').text()).toBe('req-clients-9911')
      expect(w.find('[data-testid="dialog-error"]').text()).toBe('common.error_generic')
      expect(w.text()).not.toMatch(/acr|urn:|stack|trace|eyJ/i) // no raw ACR/trace leak
      expect(w.emitted('done')).toBeUndefined()
      expect(w.emitted('deleted')).toBeUndefined()
      expect(isSubmitting.value).toBe(false)
    })
  }

  it('passes the re-auth URL to the dialog step-up affordance on 428', async () => {
    runImpl.mockImplementation(async () => {
      failure.value = {
        status: 'step_up_required',
        requestId: 'req-clients-stepup',
        auditEventId: null,
        fieldErrors: {},
        stepUpUrl: '/auth/login?prompt=login&max_age=0',
      }
      isSubmitting.value = false
      return null
    })
    const w = mountActions()
    await w.find('[data-action="disable"]').trigger('click')
    await w.find('[data-testid="dialog-confirm"]').trigger('click')
    await w.vm.$nextTick()
    const dialog = w.findComponent({ name: 'PrivilegedActionDialog' })
    expect(dialog.props('stepUpUrl')).toBe('/auth/login?prompt=login&max_age=0')
  })
})
