import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, ref } from 'vue'
import type { PrivilegedActionFailure } from '@/lib/users/privileged-action'
import type { AdminClientDetail, RotateSecretResponse } from '@/types/clients.types'

const SECRET = 'sek-PLAINTEXT-DO-NOT-LEAK-9f8e7d6c5b4a'

const clientsApi = {
  rotateSecret: vi.fn<(clientId: string) => Promise<RotateSecretResponse>>(),
}
vi.mock('@/services/clients.api', () => ({ clientsApi }))

let permitted: string[] = []
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({ hasPermission: (p: string) => permitted.includes(p) }),
}))
vi.mock('@/composables/useI18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

// Controllable privileged-action runner double (same shape as the 4.x specs).
const isSubmitting = ref(false)
const failure = ref<PrivilegedActionFailure | null>(null)
const runImpl = vi.fn<(fn: () => Promise<unknown>) => Promise<unknown>>(async (fn) => fn())
const resetImpl = vi.fn<() => void>(() => {
  failure.value = null
  isSubmitting.value = false
})
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
    reset: resetImpl,
  }),
}))

// Dynamic import AFTER the vi.mock registrations + top-level doubles (TDZ — a static
// import is hoisted above these consts, so the factories would deref them too early).
const ClientSecretRotation = (await import('../ClientSecretRotation.vue')).default

const client = {
  client_id: 'portal',
  display_name: 'SSO Portal',
  type: 'confidential',
  redirect_uris: ['https://app.example/callback'],
  post_logout_redirect_uris: ['https://app.example'],
  allowed_scopes: ['openid', 'profile'],
  status: 'active',
  category: 'publik',
  has_secret_hash: true,
} as unknown as AdminClientDetail

const DialogStub = {
  name: 'PrivilegedActionDialog',
  props: [
    'open',
    'title',
    'description',
    'danger',
    'submitting',
    'stepUpUrl',
    'errorMessage',
    'requestId',
  ],
  emits: ['confirm', 'cancel'],
  template: `<div v-if="open" data-testid="dialog" :data-danger="danger">
    <p data-testid="dialog-desc">{{ description }}</p>
    <p data-testid="dialog-error">{{ errorMessage }}</p>
    <p data-testid="dialog-ref">{{ requestId }}</p>
    <a v-if="stepUpUrl" data-testid="dialog-stepup" :href="stepUpUrl">step-up</a>
    <button data-testid="dialog-confirm" @click="$emit('confirm')">confirm</button>
    <button data-testid="dialog-cancel" @click="$emit('cancel')">cancel</button>
  </div>`,
}
const RevealStub = {
  name: 'ClientSecretReveal',
  props: [
    'open',
    'clientId',
    'secret',
    'envSnippet',
    'isPublic',
    'title',
    'description',
    'warning',
    'copyLabel',
    'clearLabel',
    'closeLabel',
  ],
  emits: ['close', 'copy'],
  template: `<div v-if="open" data-testid="reveal">
    <code data-testid="reveal-secret">{{ secret }}</code>
    <button data-testid="reveal-close" @click="$emit('close')">close</button>
  </div>`,
}

function mountRotation() {
  return mount(ClientSecretRotation, {
    props: { client },
    global: {
      // ClientSecretReveal is wrapped in <ClientOnly> (never-SSR compliance); in
      // plain VTU (no Nuxt runtime) ClientOnly must be stubbed to render its slot,
      // matching the house pattern in admin-layout.spec.ts.
      stubs: {
        PrivilegedActionDialog: DialogStub,
        ClientSecretReveal: RevealStub,
        ClientOnly: { template: '<div><slot /></div>' },
      },
    },
  })
}

function rotationResponse(): RotateSecretResponse {
  return {
    rotation: {
      client_id: 'portal',
      plaintext_once: SECRET,
      plaintext_secret: SECRET,
      rotated_at: '2026-06-28T12:00:00+00:00',
      expires_at: '2026-12-28T12:00:00+00:00',
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  permitted = ['admin.clients.write']
  isSubmitting.value = false
  failure.value = null
  runImpl.mockImplementation(async (fn: () => Promise<unknown>) => fn())
  resetImpl.mockImplementation(() => {
    failure.value = null
    isSubmitting.value = false
  })
  clientsApi.rotateSecret.mockResolvedValue(rotationResponse())
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ClientSecretRotation — permission gating', () => {
  it('hides the rotate button and shows the unavailable hint without admin.clients.write', () => {
    permitted = []
    const w = mountRotation()
    expect(w.find('[data-action="rotate-secret"]').exists()).toBe(false)
    expect(w.text()).toContain('clients.rotate_secret_unavailable')
  })
  it('renders the rotate button when permitted', () => {
    expect(mountRotation().find('[data-action="rotate-secret"]').exists()).toBe(true)
  })
})

describe('ClientSecretRotation — confirm gate', () => {
  it('opens the danger confirm dialog and does NOT call the API yet', async () => {
    const w = mountRotation()
    await w.find('[data-action="rotate-secret"]').trigger('click')
    expect(w.find('[data-testid="dialog"]').attributes('data-danger')).toBe('true')
    expect(w.find('[data-testid="dialog-desc"]').text()).toBe('clients.confirm_rotate_secret_desc')
    expect(clientsApi.rotateSecret).not.toHaveBeenCalled()
  })
  it('cancel closes the dialog and calls NO api', async () => {
    const w = mountRotation()
    await w.find('[data-action="rotate-secret"]').trigger('click')
    await w.find('[data-testid="dialog-cancel"]').trigger('click')
    expect(w.find('[data-testid="dialog"]').exists()).toBe(false)
    expect(clientsApi.rotateSecret).not.toHaveBeenCalled()
  })
})

describe('ClientSecretRotation — success (4.1) + one-time secret', () => {
  it('calls rotateSecret(client_id) once on confirm and reveals the plaintext once', async () => {
    const w = mountRotation()
    await w.find('[data-action="rotate-secret"]').trigger('click')
    await w.find('[data-testid="dialog-confirm"]').trigger('click')
    await w.vm.$nextTick()
    expect(clientsApi.rotateSecret).toHaveBeenCalledExactlyOnceWith('portal')
    expect(w.find('[data-testid="dialog"]').exists()).toBe(false) // confirm dialog closed
    expect(w.find('[data-testid="reveal-secret"]').text()).toBe(SECRET)
  })

  it('clears the secret from the DOM on reveal close and emits done (refresh)', async () => {
    const w = mountRotation()
    await w.find('[data-action="rotate-secret"]').trigger('click')
    await w.find('[data-testid="dialog-confirm"]').trigger('click')
    await w.vm.$nextTick()
    expect(w.html()).toContain(SECRET)

    await w.find('[data-testid="reveal-close"]').trigger('click')
    await w.vm.$nextTick()
    expect(w.find('[data-testid="reveal"]').exists()).toBe(false)
    expect(w.html()).not.toContain(SECRET) // gone from the DOM after close
    expect(w.emitted('done')).toHaveLength(1)
  })

  it('never persists the plaintext to storage and never logs it', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const w = mountRotation()
    await w.find('[data-action="rotate-secret"]').trigger('click')
    await w.find('[data-testid="dialog-confirm"]').trigger('click')
    await w.vm.$nextTick()
    await w.find('[data-testid="reveal-close"]').trigger('click')
    await w.vm.$nextTick()

    const storageCarriedSecret = setItem.mock.calls.some((args) =>
      args.some((a) => typeof a === 'string' && a.includes(SECRET)),
    )
    const loggedSecret = [...logSpy.mock.calls, ...errSpy.mock.calls, ...warnSpy.mock.calls]
      .flat()
      .some((a) => typeof a === 'string' && a.includes(SECRET))
    expect(storageCarriedSecret).toBe(false)
    expect(loggedSecret).toBe(false)
  })
})

describe('ClientSecretRotation — privileged-action matrix (4.2–4.8, step-up, public-client 422)', () => {
  const cases: { status: PrivilegedActionFailure['status']; stepUpUrl: string | null }[] = [
    { status: 'forbidden', stepUpUrl: null }, // 4.2 / 403
    { status: 'unauthenticated', stepUpUrl: null }, // 4.3 / 401 + 4.4 / 419
    { status: 'rate_limited', stepUpUrl: null }, // 4.5 / 429
    { status: 'invalid', stepUpUrl: null }, // 4.6 / 422 client_secret_rotation_invalid (public client)
    { status: 'step_up_required', stepUpUrl: '/auth/login?prompt=login&max_age=0' }, // 4.7 / 428 (:step_up window)
    { status: 'error', stepUpUrl: null }, // 4.8 / 5xx
  ]
  for (const c of cases) {
    it(`surfaces ${c.status} in the dialog with a redacted REF, no reveal, no stale loading`, async () => {
      runImpl.mockImplementation(async () => {
        failure.value = {
          status: c.status,
          requestId: 'req-rotate-44556677',
          auditEventId: 'aud-3',
          fieldErrors: {},
          stepUpUrl: c.stepUpUrl,
        }
        isSubmitting.value = false // 4.10: never left submitting after error
        return null
      })
      const w = mountRotation()
      await w.find('[data-action="rotate-secret"]').trigger('click')
      await w.find('[data-testid="dialog-confirm"]').trigger('click')
      await w.vm.$nextTick()
      expect(w.find('[data-testid="dialog"]').exists()).toBe(true) // stays open to show the failure
      expect(w.find('[data-testid="dialog-error"]').text()).toBe('common.error_generic')
      expect(w.find('[data-testid="dialog-ref"]').text()).toBe('req-rotate-44556677')
      expect(w.find('[data-testid="reveal"]').exists()).toBe(false) // never a reveal on failure
      expect(w.html()).not.toContain(SECRET)
      expect(w.emitted('done')).toBeUndefined()
      expect(isSubmitting.value).toBe(false)
      expect(w.find('[data-testid="dialog-stepup"]').exists()).toBe(c.status === 'step_up_required')
    })
  }
})
