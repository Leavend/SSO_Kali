import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, ref } from 'vue'
import type { PrivilegedActionFailure } from '@/lib/users/privileged-action'
import type { BlobResponse } from '@/lib/api/api-client'
import type { AuditExportFilters, ComplianceEvidencePackFilters } from '@/types/compliance.types'

// --- network seam (Task 6.4) ---
const observabilityApi = {
  exportAuditTrail: vi.fn<(filters: AuditExportFilters) => Promise<BlobResponse>>(),
  generateEvidencePack: vi.fn<(filters: ComplianceEvidencePackFilters) => Promise<BlobResponse>>(),
}
vi.mock('@/services/observability.api', () => ({ observabilityApi }))

// --- client-only download trigger (Task 6.3) ---
const triggerBlobDownload = vi.fn<(response: BlobResponse, fallback: string) => void>()
vi.mock('@/lib/api/download-blob', () => ({ triggerBlobDownload }))

vi.mock('@/composables/useI18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

// --- controllable privileged-action runner double (shared module refs) ---
const isSubmitting = ref(false)
const failure = ref<PrivilegedActionFailure | null>(null)
const runImpl = vi.fn<(fn: () => Promise<unknown>) => Promise<unknown>>(async (fn) => fn())
vi.mock('@/composables/usePrivilegedAction', () => ({
  usePrivilegedAction: () => ({
    status: ref('idle'),
    isSubmitting,
    failure,
    // Reactive computeds: a static ref read at setup (failure null) would never
    // update after runImpl sets failure.value mid-flight.
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

// Dynamic import AFTER the vi.mock registrations + top-level doubles (TDZ-safe).
const ComplianceExportPanel = (await import('../ComplianceExportPanel.vue')).default

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
    'stepUpLabel',
    'errorMessage',
    'requestId',
  ],
  emits: ['confirm', 'cancel', 'update:reason'],
  template: `<div v-if="open" data-testid="dialog" :data-danger="danger">
    <p data-testid="dialog-title">{{ title }}</p>
    <p data-testid="dialog-desc">{{ description }}</p>
    <p data-testid="dialog-error">{{ errorMessage }}</p>
    <p data-testid="dialog-ref">{{ requestId }}</p>
    <p data-testid="dialog-stepup">{{ stepUpUrl }}</p>
    <button data-testid="dialog-confirm" @click="$emit('confirm')">confirm</button>
    <button data-testid="dialog-cancel" @click="$emit('cancel')">cancel</button>
  </div>`,
}

function mountPanel(canExport = true) {
  return mount(ComplianceExportPanel, {
    props: { canExport },
    global: { stubs: { PrivilegedActionDialog: DialogStub }, renderStubDefaultSlot: true },
  })
}

const csvBlob: BlobResponse = {
  blob: new Blob(['event_id,action'], { type: 'text/csv' }),
  filename: 'admin-audit-events-2026-06-28.csv',
}
const zipBlob: BlobResponse = {
  blob: new Blob(['PK'], { type: 'application/zip' }),
  filename: null, // forces the fallback name at the component boundary
}

beforeEach(() => {
  vi.clearAllMocks()
  isSubmitting.value = false
  failure.value = null
  runImpl.mockImplementation(async (fn: () => Promise<unknown>) => fn())
  observabilityApi.exportAuditTrail.mockResolvedValue(csvBlob)
  observabilityApi.generateEvidencePack.mockResolvedValue(zipBlob)
})

describe('ComplianceExportPanel — permission gating', () => {
  it('hides both export triggers when canExport is false', () => {
    const w = mountPanel(false)
    expect(w.find('[data-testid="export-submit"]').exists()).toBe(false)
    expect(w.find('[data-testid="evidence-submit"]').exists()).toBe(false)
  })
  it('shows both export triggers when canExport is true', () => {
    const w = mountPanel(true)
    expect(w.find('[data-testid="export-submit"]').exists()).toBe(true)
    expect(w.find('[data-testid="evidence-submit"]').exists()).toBe(true)
  })
})

describe('ComplianceExportPanel — evidence-pack submit gating (canSubmitEvidencePack)', () => {
  it('disables the evidence trigger until a date range OR correlation id is set', async () => {
    const w = mountPanel()
    expect(w.find('[data-testid="evidence-submit"]').attributes('disabled')).toBeDefined()
    await w.find('[data-testid="evidence-correlation"]').setValue('INC-42')
    expect(w.find('[data-testid="evidence-submit"]').attributes('disabled')).toBeUndefined()
  })
  it('keeps the audit export trigger enabled with no filters (bare-format export allowed)', () => {
    const w = mountPanel()
    expect(w.find('[data-testid="export-submit"]').attributes('disabled')).toBeUndefined()
  })
})

describe('ComplianceExportPanel — confirm vs cancel', () => {
  it('opens the impact dialog without calling the API', async () => {
    const w = mountPanel()
    await w.find('[data-testid="export-submit"]').trigger('click')
    expect(w.find('[data-testid="dialog"]').exists()).toBe(true)
    expect(w.find('[data-testid="dialog-title"]').text()).toBe('observability.export_title')
    expect(w.find('[data-testid="dialog-desc"]').text()).toBe('observability.export_desc')
    // Export is operational, NOT destructive — the confirm dialog must not use the
    // danger (#E4002B) styling reserved for genuinely destructive actions.
    expect(w.find('[data-testid="dialog"]').attributes('data-danger')).not.toBe('true')
    expect(observabilityApi.exportAuditTrail).not.toHaveBeenCalled()
  })
  it('cancel closes the dialog, calls NO api, and triggers NO download', async () => {
    const w = mountPanel()
    await w.find('[data-testid="export-submit"]').trigger('click')
    await w.find('[data-testid="dialog-cancel"]').trigger('click')
    expect(w.find('[data-testid="dialog"]').exists()).toBe(false)
    expect(observabilityApi.exportAuditTrail).not.toHaveBeenCalled()
    expect(triggerBlobDownload).not.toHaveBeenCalled()
  })
})

describe('ComplianceExportPanel — audit export success (4.1)', () => {
  it('exports with the chosen format and triggers a client-only download with the header filename', async () => {
    const w = mountPanel()
    await w.find('[data-testid="export-submit"]').trigger('click')
    await w.find('[data-testid="dialog-confirm"]').trigger('click')
    await w.vm.$nextTick()
    expect(observabilityApi.exportAuditTrail).toHaveBeenCalledWith({ format: 'csv' })
    expect(triggerBlobDownload).toHaveBeenCalledTimes(1)
    expect(triggerBlobDownload).toHaveBeenCalledWith(csvBlob, 'admin-audit-events.csv')
    expect(w.emitted('done')).toHaveLength(1)
    expect(w.find('[data-testid="dialog"]').exists()).toBe(false) // closes on success
    // No blob/secret/PII text leaks into the rendered surface on success.
    expect(w.text()).not.toMatch(/blob:|data:|eyJ|PK|\d{16}/u)
  })
})

describe('ComplianceExportPanel — evidence pack success (4.1)', () => {
  it('generates with the filters and falls back to the format-derived filename when the header is absent', async () => {
    const w = mountPanel()
    await w.find('[data-testid="evidence-correlation"]').setValue('INC-42')
    await w.find('[data-testid="evidence-submit"]').trigger('click')
    await w.find('[data-testid="dialog-confirm"]').trigger('click')
    await w.vm.$nextTick()
    expect(observabilityApi.generateEvidencePack).toHaveBeenCalledWith({
      format: 'zip',
      correlation_id: 'INC-42',
    })
    // filename === null on the response → component supplies the fallback name.
    expect(triggerBlobDownload).toHaveBeenCalledWith(zipBlob, 'compliance-evidence-pack.zip')
    expect(w.emitted('done')).toHaveLength(1)
  })
})

describe('ComplianceExportPanel — export failure matrix (401/403/419/422/428/429/5xx)', () => {
  const cases: { status: PrivilegedActionFailure['status']; stepUpUrl: string | null }[] = [
    { status: 'forbidden', stepUpUrl: null }, // 403
    { status: 'unauthenticated', stepUpUrl: null }, // 401 + 419
    { status: 'rate_limited', stepUpUrl: null }, // 429
    { status: 'invalid', stepUpUrl: null }, // 422
    { status: 'step_up_required', stepUpUrl: '/auth/login?prompt=login&max_age=0' }, // 428
    { status: 'error', stepUpUrl: null }, // 5xx
  ]
  for (const c of cases) {
    it(`surfaces ${c.status} safely with a redacted REF, no download, and no stale loading`, async () => {
      runImpl.mockImplementation(async () => {
        failure.value = {
          status: c.status,
          requestId: 'req-export-9911',
          auditEventId: 'aud-1',
          fieldErrors: {},
          stepUpUrl: c.stepUpUrl,
        }
        isSubmitting.value = false // never left submitting after error
        return null
      })
      const w = mountPanel()
      await w.find('[data-testid="export-submit"]').trigger('click')
      await w.find('[data-testid="dialog-confirm"]').trigger('click')
      await w.vm.$nextTick()
      expect(w.find('[data-testid="dialog"]').exists()).toBe(true) // stays open to show the failure
      expect(w.find('[data-testid="dialog-ref"]').text()).toBe('req-export-9911')
      expect(w.find('[data-testid="dialog-error"]').text()).toBe('common.error_generic')
      expect(triggerBlobDownload).not.toHaveBeenCalled() // no download on failure
      expect(w.emitted('done')).toBeUndefined()
      expect(isSubmitting.value).toBe(false)
      expect(w.text()).not.toMatch(/stack|trace|eyJ/iu) // no raw exception leak
    })
  }

  it('passes the re-auth URL to the dialog step-up affordance on 428', async () => {
    runImpl.mockImplementation(async () => {
      failure.value = {
        status: 'step_up_required',
        requestId: 'req-export-stepup',
        auditEventId: null,
        fieldErrors: {},
        stepUpUrl: '/auth/login?prompt=login&max_age=0',
      }
      isSubmitting.value = false
      return null
    })
    const w = mountPanel()
    await w.find('[data-testid="export-submit"]').trigger('click')
    await w.find('[data-testid="dialog-confirm"]').trigger('click')
    await w.vm.$nextTick()
    const dialog = w.findComponent({ name: 'PrivilegedActionDialog' })
    expect(dialog.props('stepUpUrl')).toBe('/auth/login?prompt=login&max_age=0')
  })
})

describe('ComplianceExportPanel — evidence-pack failure matrix (the separate evidenceAction runner)', () => {
  // The evidence-pack uses its OWN usePrivilegedAction instance (evidenceAction),
  // so its failure path is exercised independently from the audit export above:
  // 428 step-up surfaced, 422 validation, 5xx — never a download, never stale.
  const cases: { status: PrivilegedActionFailure['status']; stepUpUrl: string | null }[] = [
    { status: 'invalid', stepUpUrl: null }, // 422
    { status: 'step_up_required', stepUpUrl: '/auth/login?prompt=login&max_age=0' }, // 428
    { status: 'error', stepUpUrl: null }, // 5xx
  ]
  for (const c of cases) {
    it(`surfaces ${c.status} on the evidence pack safely (step-up on 428, no download, no stale loading)`, async () => {
      runImpl.mockImplementation(async () => {
        failure.value = {
          status: c.status,
          requestId: 'req-evidence-7722',
          auditEventId: 'aud-2',
          fieldErrors: {},
          stepUpUrl: c.stepUpUrl,
        }
        isSubmitting.value = false
        return null
      })
      const w = mountPanel()
      await w.find('[data-testid="evidence-correlation"]').setValue('INC-99') // enable the trigger
      await w.find('[data-testid="evidence-submit"]').trigger('click')
      await w.find('[data-testid="dialog-confirm"]').trigger('click')
      await w.vm.$nextTick()
      const dialog = w.find('[data-testid="dialog"]')
      expect(dialog.exists()).toBe(true) // stays open to show the failure
      // 428 surfaces step_up_url (props(), not a null-droppable attribute).
      expect(w.findComponent({ name: 'PrivilegedActionDialog' }).props('stepUpUrl')).toBe(
        c.stepUpUrl,
      )
      expect(w.find('[data-testid="dialog-ref"]').text()).toBe('req-evidence-7722')
      expect(w.find('[data-testid="dialog-error"]').text()).toBe('common.error_generic')
      expect(triggerBlobDownload).not.toHaveBeenCalled() // no download on failure
      expect(w.emitted('done')).toBeUndefined()
      expect(isSubmitting.value).toBe(false) // no stale loading
      expect(w.text()).not.toMatch(/stack|trace|eyJ/iu) // no raw token/trace leak
    })
  }
})
