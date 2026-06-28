import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, ref } from 'vue'
import type { DataSubjectRequest } from '@/types/compliance.types'
import type { PrivilegedActionFailure } from '@/lib/users/privileged-action'

const observabilityApi = {
  reviewDsr: vi.fn<(id: string, payload: unknown) => Promise<unknown>>(),
  fulfillDsr: vi.fn<(id: string, payload: unknown) => Promise<unknown>>(),
}
vi.mock('@/services/observability.api', () => ({ observabilityApi }))

let permitted: string[] = []
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({ hasPermission: (p: string) => permitted.includes(p) }),
}))
vi.mock('@/composables/useI18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

// Controllable privileged-action runner double (reactive computeds, mirror Task 4.11).
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

// Dynamic import AFTER the vi.mock registrations + top-level doubles: vitest hoists
// a static `import … from '../DsrReviewActions.vue'` above these consts, so loading
// the component (which imports the mocked observability.api/usePrivilegedAction)
// would run the factories before the consts initialize (TDZ). Mirrors the Task 6.9
// ComplianceExportPanel + Task 4.x UserLifecycleActions specs.
const DsrReviewActions = (await import('../DsrReviewActions.vue')).default

const submitted: DataSubjectRequest = {
  request_id: '01J9XQ7K8M4N2P3Q5R6S7T8U9V',
  subject_id: 'sub_0a1b2c3d4e5f6a7b8c9d',
  type: 'export',
  status: 'submitted',
  submitted_at: '2026-06-20T09:00:00Z',
  reviewed_at: null,
  fulfilled_at: null,
  sla_due_at: '2026-06-27T09:00:00Z',
}
const approved: DataSubjectRequest = { ...submitted, status: 'approved' }

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
  template: `<div v-if="open" data-testid="dialog" :data-danger="danger" :data-reason-required="reasonRequired" :data-step-up="stepUpUrl">
    <p data-testid="dialog-error">{{ errorMessage }}</p>
    <p data-testid="dialog-ref">{{ requestId }}</p>
    <button data-testid="dialog-confirm" @click="$emit('confirm')">confirm</button>
    <button data-testid="dialog-cancel" @click="$emit('cancel')">cancel</button>
    <button data-testid="dialog-set-reason" @click="$emit('update:reason', 'Verified subject identity per policy')">reason</button>
  </div>`,
}

function mountActions(request: DataSubjectRequest = submitted) {
  return mount(DsrReviewActions, {
    props: { request },
    global: { stubs: { PrivilegedActionDialog: DialogStub } },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  permitted = ['admin.dsr.review']
  isSubmitting.value = false
  failure.value = null
  runImpl.mockImplementation(async (fn) => fn())
  observabilityApi.reviewDsr.mockResolvedValue({ request: approved })
  observabilityApi.fulfillDsr.mockResolvedValue({
    request: approved,
    dry_run: true,
    legal_hold_status: 'none',
  })
})

describe('DsrReviewActions — permission gating', () => {
  it('renders nothing without admin.dsr.review', () => {
    permitted = []
    expect(mountActions().find('[data-testid="dsr-review-actions"]').exists()).toBe(false)
  })
  it('renders the action group when permitted', () => {
    expect(mountActions().find('[data-testid="dsr-review-actions"]').exists()).toBe(true)
  })
})

describe('DsrReviewActions — lifecycle applicability', () => {
  it('enables approve/reject only on a submitted request and disables fulfill', () => {
    const w = mountActions(submitted)
    expect(w.find('[data-action="approve"]').attributes('disabled')).toBeUndefined()
    expect(w.find('[data-action="reject"]').attributes('disabled')).toBeUndefined()
    expect(w.find('[data-action="fulfill_dry"]').attributes('disabled')).toBeDefined()
  })
  it('enables fulfill only on an approved request and disables approve/reject', () => {
    const w = mountActions(approved)
    expect(w.find('[data-action="fulfill_dry"]').attributes('disabled')).toBeUndefined()
    expect(w.find('[data-action="fulfill_commit"]').attributes('disabled')).toBeUndefined()
    expect(w.find('[data-action="approve"]').attributes('disabled')).toBeDefined()
  })
})

describe('DsrReviewActions — confirm before API', () => {
  it('opens a reason-required dialog for approve and does NOT call the API yet', async () => {
    const w = mountActions(submitted)
    await w.find('[data-action="approve"]').trigger('click')
    expect(w.find('[data-testid="dialog"]').attributes('data-reason-required')).toBe('true')
    expect(observabilityApi.reviewDsr).not.toHaveBeenCalled()
  })
  it('marks the commit-fulfill dialog as danger', async () => {
    const w = mountActions(approved)
    await w.find('[data-action="fulfill_commit"]').trigger('click')
    expect(w.find('[data-testid="dialog"]').attributes('data-danger')).toBe('true')
  })
  it('cancel closes the dialog and calls NO api', async () => {
    const w = mountActions(submitted)
    await w.find('[data-action="reject"]').trigger('click')
    await w.find('[data-testid="dialog-cancel"]').trigger('click')
    expect(w.find('[data-testid="dialog"]').exists()).toBe(false)
    expect(observabilityApi.reviewDsr).not.toHaveBeenCalled()
  })
})

describe('DsrReviewActions — success', () => {
  it('reviews with decision + notes and emits done on success', async () => {
    const w = mountActions(submitted)
    await w.find('[data-action="approve"]').trigger('click')
    await w.find('[data-testid="dialog-set-reason"]').trigger('click')
    await w.find('[data-testid="dialog-confirm"]').trigger('click')
    await w.vm.$nextTick()
    expect(observabilityApi.reviewDsr).toHaveBeenCalledWith('01J9XQ7K8M4N2P3Q5R6S7T8U9V', {
      decision: 'approved',
      notes: 'Verified subject identity per policy',
    })
    expect(w.emitted('done')).toHaveLength(1)
  })
  it('fulfills dry-run with dry_run:true, commit with dry_run:false', async () => {
    const w = mountActions(approved)
    await w.find('[data-action="fulfill_dry"]').trigger('click')
    await w.find('[data-testid="dialog-confirm"]').trigger('click')
    await w.vm.$nextTick()
    expect(observabilityApi.fulfillDsr).toHaveBeenLastCalledWith('01J9XQ7K8M4N2P3Q5R6S7T8U9V', {
      dry_run: true,
    })

    await w.find('[data-action="fulfill_commit"]').trigger('click')
    await w.find('[data-testid="dialog-confirm"]').trigger('click')
    await w.vm.$nextTick()
    expect(observabilityApi.fulfillDsr).toHaveBeenLastCalledWith('01J9XQ7K8M4N2P3Q5R6S7T8U9V', {
      dry_run: false,
    })
    expect(w.emitted('done')).toHaveLength(2)
  })
  it('surfaces the legal-hold notice when the response is blocked by an active hold', async () => {
    observabilityApi.fulfillDsr.mockResolvedValue({
      request: approved,
      dry_run: true,
      legal_hold_status: 'active',
    })
    const w = mountActions(approved)
    await w.find('[data-action="fulfill_dry"]').trigger('click')
    await w.find('[data-testid="dialog-confirm"]').trigger('click')
    await w.vm.$nextTick()
    expect(w.find('[data-testid="dsr-legal-hold"]').text()).toContain(
      'observability.dsr_legal_hold_notice',
    )
  })
})

describe('DsrReviewActions — failure matrix (401/403/419/422/428/429/5xx)', () => {
  const cases: { status: PrivilegedActionFailure['status']; stepUpUrl: string | null }[] = [
    { status: 'forbidden', stepUpUrl: null }, // 403
    { status: 'unauthenticated', stepUpUrl: null }, // 401 + 419
    { status: 'rate_limited', stepUpUrl: null }, // 429
    { status: 'invalid', stepUpUrl: null }, // 422 (e.g. notes too long)
    { status: 'step_up_required', stepUpUrl: '/auth/login?prompt=login&max_age=0' }, // 428
    { status: 'error', stepUpUrl: null }, // 5xx: not-reviewable / legal-hold conflict
  ]
  for (const c of cases) {
    it(`surfaces ${c.status} safely with a redacted reference and no stale loading`, async () => {
      runImpl.mockImplementation(async () => {
        failure.value = {
          status: c.status,
          requestId: 'req-dsr-77881122',
          auditEventId: 'aud-7',
          fieldErrors: {},
          stepUpUrl: c.stepUpUrl,
        }
        isSubmitting.value = false
        return null
      })
      const w = mountActions(submitted)
      await w.find('[data-action="approve"]').trigger('click')
      await w.find('[data-testid="dialog-set-reason"]').trigger('click')
      await w.find('[data-testid="dialog-confirm"]').trigger('click')
      await w.vm.$nextTick()
      const dialog = w.find('[data-testid="dialog"]')
      expect(dialog.exists()).toBe(true) // stays open to show the failure
      // props(), not attributes(): Vue drops a null-bound attr (so an attribute
      // read is `undefined`, not `''`); assert the prop directly, mirroring the
      // Task 6.9 panel spec so the two failure matrices stay consistent.
      expect(w.findComponent({ name: 'PrivilegedActionDialog' }).props('stepUpUrl')).toBe(
        c.stepUpUrl,
      )
      expect(dialog.find('[data-testid="dialog-ref"]').text()).toBe('req-dsr-77881122') // dialog redacts to REF- itself
      expect(w.text()).not.toMatch(/stack|trace|eyJ|RuntimeException/i) // no raw exception leak
      expect(w.emitted('done')).toBeUndefined() // no refresh on failure
      expect(isSubmitting.value).toBe(false) // no stale loading
    })
  }

  // The destructive fulfill_commit flow must fail just as safely as review —
  // 428 step-up surfaced, 5xx "not in approved state" shown as safe copy, never a
  // `done` emit, dialog stays open with a redacted REF, no stale loading.
  const commitFailureCases: {
    status: PrivilegedActionFailure['status']
    stepUpUrl: string | null
  }[] = [
    { status: 'step_up_required', stepUpUrl: '/auth/login?prompt=login&max_age=0' }, // 428
    { status: 'error', stepUpUrl: null }, // 5xx: request not in approved state
  ]
  for (const c of commitFailureCases) {
    it(`fulfill_commit surfaces ${c.status} safely (no done, dialog open, redacted REF, no stale loading)`, async () => {
      runImpl.mockImplementation(async () => {
        failure.value = {
          status: c.status,
          requestId: 'req-dsr-commit-55',
          auditEventId: 'aud-9',
          fieldErrors: {},
          stepUpUrl: c.stepUpUrl,
        }
        isSubmitting.value = false
        return null
      })
      const w = mountActions(approved)
      await w.find('[data-action="fulfill_commit"]').trigger('click')
      await w.find('[data-testid="dialog-confirm"]').trigger('click')
      await w.vm.$nextTick()
      const dialog = w.find('[data-testid="dialog"]')
      expect(dialog.exists()).toBe(true)
      expect(w.findComponent({ name: 'PrivilegedActionDialog' }).props('stepUpUrl')).toBe(
        c.stepUpUrl,
      )
      expect(dialog.find('[data-testid="dialog-ref"]').text()).toBe('req-dsr-commit-55')
      expect(w.text()).not.toMatch(/stack|trace|eyJ|RuntimeException/i)
      expect(w.emitted('done')).toBeUndefined() // never refresh on a failed commit
      expect(isSubmitting.value).toBe(false)
    })
  }
})
