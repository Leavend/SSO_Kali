import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, ref } from 'vue'
import type { PrivilegedActionFailure } from '@/lib/users/privileged-action'
import type { UserActionId } from '@/lib/users/user-actions'

const usersApi = {
  lock: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  unlock: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  deactivate: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  reactivate: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  resetMfa: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  issuePasswordReset: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  requireMfa: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  unrequireMfa: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  syncProfile: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}
vi.mock('@/services/users.api', () => ({ usersApi }))

let permitted: string[] = []
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({ hasPermission: (p: string) => permitted.includes(p) }),
}))
vi.mock('@/composables/useI18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

// Controllable privileged-action runner double.
const isSubmitting = ref(false)
const failure = ref<PrivilegedActionFailure | null>(null)
const runImpl = vi.fn<(fn: () => Promise<unknown>) => Promise<unknown>>(async (fn) => fn())
vi.mock('@/composables/usePrivilegedAction', () => ({
  usePrivilegedAction: () => ({
    status: ref('idle'),
    isSubmitting,
    failure,
    // Reactive computeds (mirror Task 4.10's mock): static `ref(failure.value?…)`
    // would be evaluated once at setup (failure null) and never update after
    // runImpl sets failure.value, so the REF/step-up bindings would stay empty.
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

// Dynamic import (after the vi.mock registrations + the top-level doubles above):
// a static `import … from` is hoisted ABOVE these consts, so the mock factories
// would dereference them before initialization (TDZ). Mirrors the 4.10 spec.
const UserLifecycleActions = (await import('../UserLifecycleActions.vue')).default

const user = {
  id: 1,
  subject_id: 'sub_target',
  email: 'target@example.test',
  display_name: 'Target',
  effective_status: 'active',
  local_account_enabled: true,
  mfa_enrolled: true,
  mfa_mandatory: false,
  nik: '1234********3456',
  nip: null,
  nisn: null,
  birth_date: '****-**-15',
  roles: [],
} as unknown as import('@/types/users.types').AdminUserDetail

const DialogStub = {
  name: 'PrivilegedActionDialog',
  props: [
    'open',
    'title',
    'description',
    'danger',
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
    <p data-testid="dialog-error">{{ errorMessage }}</p>
    <p data-testid="dialog-ref">{{ requestId }}</p>
    <button data-testid="dialog-confirm" @click="$emit('confirm')">confirm</button>
    <button data-testid="dialog-cancel" @click="$emit('cancel')">cancel</button>
  </div>`,
}

function mountActions() {
  return mount(UserLifecycleActions, {
    props: { user },
    global: { stubs: { PrivilegedActionDialog: DialogStub }, renderStubDefaultSlot: true },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  permitted = ['admin.users.write', 'admin.users.lock']
  isSubmitting.value = false
  failure.value = null
  runImpl.mockImplementation(async (fn: () => Promise<unknown>) => fn())
})

describe('UserLifecycleActions — permission gating', () => {
  it('renders only buttons the operator is permitted to use', () => {
    permitted = ['admin.users.write']
    const w = mountActions()
    expect(w.find('[data-action="deactivate"]').exists()).toBe(true)
    expect(w.find('[data-action="lock"]').exists()).toBe(false) // needs admin.users.lock
  })
  it('shows the no-permission hint when nothing is permitted', () => {
    permitted = []
    expect(mountActions().text()).toContain('users.actions_none')
  })
})

describe('UserLifecycleActions — applicability', () => {
  it('disables unlock on an unlocked account and lock is enabled', () => {
    const w = mountActions()
    expect(w.find('[data-action="unlock"]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-action="lock"]').attributes('disabled')).toBeUndefined()
  })
})

describe('UserLifecycleActions — confirm vs direct', () => {
  it('opens the confirm dialog for a confirmRequired action and does NOT call the API yet', async () => {
    const w = mountActions()
    await w.find('[data-action="deactivate"]').trigger('click')
    expect(w.find('[data-testid="dialog"]').exists()).toBe(true)
    expect(usersApi.deactivate).not.toHaveBeenCalled()
  })
  it('runs a no-confirm action directly with no dialog', async () => {
    permitted = ['admin.users.lock']
    const locked = { ...user, effective_status: 'locked' } as typeof user
    const w = mount(UserLifecycleActions, {
      props: { user: locked },
      global: { stubs: { PrivilegedActionDialog: DialogStub } },
    })
    await w.find('[data-action="unlock"]').trigger('click')
    expect(w.find('[data-testid="dialog"]').exists()).toBe(false)
    expect(usersApi.unlock).toHaveBeenCalledWith('sub_target', { reason: '' })
  })
})

describe('UserLifecycleActions — destructive confirm', () => {
  it('marks the danger dialog and calls the API only on confirm', async () => {
    const w = mountActions()
    await w.find('[data-action="lock"]').trigger('click')
    expect(w.find('[data-testid="dialog"]').attributes('data-danger')).toBe('true')
    await w.find('[data-testid="dialog-confirm"]').trigger('click')
    expect(usersApi.lock).toHaveBeenCalledTimes(1)
  })
  it('cancel closes the dialog and calls NO api (4.matrix: cancel calls no API)', async () => {
    const w = mountActions()
    await w.find('[data-action="deactivate"]').trigger('click')
    await w.find('[data-testid="dialog-cancel"]').trigger('click')
    expect(w.find('[data-testid="dialog"]').exists()).toBe(false)
    expect(usersApi.deactivate).not.toHaveBeenCalled()
  })
})

describe('UserLifecycleActions — success (4.1)', () => {
  it('emits done after a successful action so the page refreshes', async () => {
    const w = mountActions()
    await w.find('[data-action="deactivate"]').trigger('click')
    await w.find('[data-testid="dialog-confirm"]').trigger('click')
    await w.vm.$nextTick()
    expect(w.emitted('done')).toHaveLength(1)
  })
  it('shows password-reset safe evidence only — never a token (PII discipline)', async () => {
    usersApi.issuePasswordReset.mockResolvedValue({
      user,
      password_reset: { expires_at: '2026-06-29T00:00:00Z' },
      delivery_status: 'queued',
    })
    const w = mountActions()
    await w.find('[data-action="password_reset"]').trigger('click')
    await w.find('[data-testid="dialog-confirm"]').trigger('click')
    await w.vm.$nextTick()
    expect(w.text()).toContain('users.password_reset_evidence')
    expect(w.text()).not.toMatch(/eyJ|Bearer|reset[_-]?token/i)
  })
})

describe('UserLifecycleActions — failure matrix (4.2–4.8, 4.9, 4.10)', () => {
  const cases: { status: PrivilegedActionFailure['status']; stepUpUrl: string | null }[] = [
    { status: 'forbidden', stepUpUrl: null }, // 4.2 / 403
    { status: 'unauthenticated', stepUpUrl: null }, // 4.3 / 401 + 4.4 / 419
    { status: 'rate_limited', stepUpUrl: null }, // 4.5 / 429
    { status: 'invalid', stepUpUrl: null }, // 4.6 / 422
    { status: 'step_up_required', stepUpUrl: '/auth/login?prompt=login' }, // 4.7 / 428
    { status: 'error', stepUpUrl: null }, // 4.8 / 5xx
  ]
  for (const c of cases) {
    it(`surfaces ${c.status} safely with a redacted reference and no stale loading`, async () => {
      runImpl.mockImplementation(async () => {
        failure.value = {
          status: c.status,
          requestId: 'req-abc12345',
          auditEventId: 'aud-1',
          fieldErrors: {},
          stepUpUrl: c.stepUpUrl,
        }
        isSubmitting.value = false // 4.10: never left submitting after error
        return null
      })
      const w = mountActions()
      await w.find('[data-action="deactivate"]').trigger('click')
      await w.find('[data-testid="dialog-confirm"]').trigger('click')
      await w.vm.$nextTick()
      expect(w.find('[data-testid="dialog"]').exists()).toBe(true) // dialog stays open to show the failure
      expect(w.find('[data-testid="dialog-ref"]').text()).toBe('req-abc12345')
      expect(w.emitted('done')).toBeUndefined() // no refresh on failure
      expect(isSubmitting.value).toBe(false)
    })
  }
})

describe('UserLifecycleActions — direct-action failure surface (B6: 428 step-up + 5xx never swallowed)', () => {
  // `unlock` (admin.users.lock + step_up) and `reactivate` (admin.users.write) run
  // via `void execute(id)` with NO dialog. Before the fix their failures surfaced
  // ONLY through PrivilegedActionDialog (which renders only when activeAction!==null),
  // so a 428 step-up / 5xx was silently swallowed. They must reach an inline banner.
  const directCases: { id: UserActionId; effective: string }[] = [
    { id: 'unlock', effective: 'locked' },
    { id: 'reactivate', effective: 'deactivated' },
  ]
  const failures: { status: PrivilegedActionFailure['status']; stepUpUrl: string | null }[] = [
    { status: 'step_up_required', stepUpUrl: '/auth/login?prompt=login&max_age=0' }, // 428
    { status: 'error', stepUpUrl: null }, // 5xx
  ]
  for (const dc of directCases) {
    for (const f of failures) {
      it(`surfaces ${f.status} from the direct ${dc.id} action via an inline banner`, async () => {
        permitted = ['admin.users.write', 'admin.users.lock']
        runImpl.mockImplementation(async () => {
          failure.value = {
            status: f.status,
            requestId: 'req-direct-77881122',
            auditEventId: 'aud-9',
            fieldErrors: {},
            stepUpUrl: f.stepUpUrl,
          }
          isSubmitting.value = false // 4.10: never left submitting after error
          return null
        })
        const target = { ...user, effective_status: dc.effective } as typeof user
        const w = mount(UserLifecycleActions, {
          props: { user: target },
          global: { stubs: { PrivilegedActionDialog: DialogStub } },
        })
        await w.find(`[data-action="${dc.id}"]`).trigger('click')
        await w.vm.$nextTick()
        expect(runImpl).toHaveBeenCalledTimes(1)
        expect(w.find('[data-testid="dialog"]').exists()).toBe(false) // direct action: never a dialog
        const banner = w.find('[data-testid="lifecycle-direct-failure"]')
        expect(banner.exists()).toBe(true)
        expect(banner.text()).toContain('REF-') // redacted reference only
        expect(w.text()).not.toContain('req-direct-77881122') // raw correlation id never rendered
        expect(w.text()).not.toMatch(/acr|urn:|stack|trace|eyJ/i) // no raw ACR/trace leak
        // The step-up link appears only for 428 (unconditional assert: no conditional expect).
        expect(w.find('[data-testid="lifecycle-direct-stepup-link"]').exists()).toBe(
          f.status === 'step_up_required',
        )
        expect(w.emitted('done')).toBeUndefined()
        expect(isSubmitting.value).toBe(false)
      })
    }
  }

  // The 428 step-up link must point at the re-auth URL — verified through BOTH
  // direct actions (unlock = admin.users.lock + step-up; reactivate = write).
  for (const dc of directCases) {
    it(`points the direct ${dc.id} step-up link at the re-auth URL`, async () => {
      permitted = ['admin.users.write', 'admin.users.lock']
      runImpl.mockImplementation(async () => {
        failure.value = {
          status: 'step_up_required',
          requestId: 'req-direct-77881122',
          auditEventId: 'aud-9',
          fieldErrors: {},
          stepUpUrl: '/auth/login?prompt=login&max_age=0',
        }
        isSubmitting.value = false
        return null
      })
      const target = { ...user, effective_status: dc.effective } as typeof user
      const w = mount(UserLifecycleActions, {
        props: { user: target },
        global: { stubs: { PrivilegedActionDialog: DialogStub } },
      })
      await w.find(`[data-action="${dc.id}"]`).trigger('click')
      await w.vm.$nextTick()
      const link = w.find('[data-testid="lifecycle-direct-stepup-link"]')
      expect(link.exists()).toBe(true)
      expect(link.attributes('href')).toBe('/auth/login?prompt=login&max_age=0')
    })
  }
})

describe('UserLifecycleActions — sync-profile failure (one representative case)', () => {
  // The lifecycle loop already drives every status through the shared 4.9
  // runner + surfaces; the sync-profile form runs through its own instance of the
  // SAME runner, so a single representative failure proves it is wired safely.
  it('surfaces a sync-profile failure with safe copy + REF and no stale loading', async () => {
    runImpl.mockImplementation(async () => {
      failure.value = {
        status: 'error',
        requestId: 'req-profile-55667788',
        auditEventId: null,
        fieldErrors: {},
        stepUpUrl: null,
      }
      isSubmitting.value = false
      return null
    })
    const w = mountActions()
    await w.find('#profile-display-name').setValue('Renamed Operator')
    await w.find('[data-testid="sync-profile-form"]').trigger('submit')
    await w.vm.$nextTick()
    expect(runImpl).toHaveBeenCalledTimes(1)
    const error = w.find('[data-testid="profile-error"]')
    expect(error.exists()).toBe(true)
    expect(error.text()).toContain('common.error_generic')
    expect(w.text()).toContain('REF-')
    expect(w.text()).not.toContain('req-profile-55667788')
    expect(w.emitted('done')).toBeUndefined()
    expect(isSubmitting.value).toBe(false)
  })

  it('surfaces a sync-profile 428 step_up_required with re-auth link, safe copy, REF — no raw id leaks', async () => {
    runImpl.mockImplementation(async () => {
      failure.value = {
        status: 'step_up_required',
        requestId: 'req-profile-stepup-99',
        auditEventId: null,
        fieldErrors: {},
        stepUpUrl: '/auth/login?prompt=login&max_age=0',
      }
      isSubmitting.value = false
      return null
    })
    const w = mountActions()
    await w.find('#profile-display-name').setValue('Renamed Operator')
    await w.find('[data-testid="sync-profile-form"]').trigger('submit')
    await w.vm.$nextTick()
    expect(runImpl).toHaveBeenCalledTimes(1)
    const error = w.find('[data-testid="profile-error"]')
    expect(error.exists()).toBe(true)
    expect(error.text()).toContain('common.error_generic')
    expect(w.text()).toContain('REF-')
    const link = w.find('[data-testid="profile-stepup-link"]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/auth/login?prompt=login&max_age=0')
    expect(link.text()).toContain('users.btn_step_up')
    // PII/security discipline: no raw ids or ACR/trace leak
    expect(w.text()).not.toContain('req-profile-stepup-99')
    expect(w.text()).not.toMatch(/acr|urn:|stack|trace|eyJ/i)
    expect(w.emitted('done')).toBeUndefined()
    expect(isSubmitting.value).toBe(false)
  })
})
