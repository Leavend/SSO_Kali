import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { formatSupportReference } from '@/lib/display-identifiers'
import { triggerBlobDownload } from '@/lib/download/trigger-download'
import { triggerStepUpReauth } from '@/lib/stepup/stepup'
import { auditApi } from '../services/audit.api'
import type {
  AdminAuditEvent,
  AuthenticationAuditEvent,
  AuditEventFilters,
  AuditExportFilters,
  AuditIntegrity,
  AuditPagination,
  AuthenticationAuditEventFilters,
  ComplianceEvidencePackFilters,
  DataSubjectRequest,
  RetentionStatus,
} from '../types'

export type AuditStatus = 'idle' | 'loading' | 'success' | 'unauthenticated' | 'forbidden' | 'error' | 'partial'
export type AuditActionStatus = 'idle' | 'loading' | 'success' | 'step_up_required' | 'error'

export type SectionKey = 'events' | 'integrity' | 'retention' | 'dsr' | 'authEvents'
export type SectionStatus = 'idle' | 'loading' | 'success' | 'error' | 'forbidden' | 'unauthenticated'

type SectionState = {
  status: SectionStatus
  error: string | null
  requestId: string | null
}

const DEFAULT_SECTION_STATE = (): SectionState => ({
  status: 'idle',
  error: null,
  requestId: null,
})

export const useAuditStore = defineStore('admin-audit', () => {
  const status = ref<AuditStatus>('idle')
  const actionStatus = ref<AuditActionStatus>('idle')
  const events = ref<readonly AdminAuditEvent[]>([])
  const eventFilters = ref<AuditEventFilters>({ limit: 50 })
  const eventPagination = ref<AuditPagination | null>(null)
  const selectedEventId = ref<string | null>(null)
  const selectedEventDetail = ref<AdminAuditEvent | null>(null)
  const integrity = ref<AuditIntegrity | null>(null)
  const retentionStatus = ref<RetentionStatus | null>(null)
  const dataSubjectRequests = ref<readonly DataSubjectRequest[]>([])
  const authenticationEvents = ref<readonly AuthenticationAuditEvent[]>([])
  const authenticationEventFilters = ref<AuthenticationAuditEventFilters>({ limit: 25 })
  const authenticationEventPagination = ref<AuditPagination | null>(null)
  const selectedAuthenticationEventId = ref<string | null>(null)
  const selectedAuthenticationEventDetail = ref<AuthenticationAuditEvent | null>(null)
  const errorMessage = ref<string | null>(null)
  const requestId = ref<string | null>(null)

  // ISS-C3: per-section status for granular error resilience
  const sections = ref<Record<SectionKey, SectionState>>({
    events: DEFAULT_SECTION_STATE(),
    integrity: DEFAULT_SECTION_STATE(),
    retention: DEFAULT_SECTION_STATE(),
    dsr: DEFAULT_SECTION_STATE(),
    authEvents: DEFAULT_SECTION_STATE(),
  })

  const hasAnySectionSuccess = computed(() =>
    Object.values(sections.value).some((s) => s.status === 'success'),
  )

  const selectedEvent = computed<AdminAuditEvent | null>(
    () =>
      selectedEventDetail.value ??
      events.value.find((event) => event.event_id === selectedEventId.value) ??
      null,
  )
  const selectedAuthenticationEvent = computed<AuthenticationAuditEvent | null>(
    () =>
      selectedAuthenticationEventDetail.value ??
      authenticationEvents.value.find(
        (event) => event.event_id === selectedAuthenticationEventId.value,
      ) ??
      null,
  )

  function formatRef(id: string | null | undefined): string {
    const ref = formatSupportReference(id)
    return ref ?? 'N/A'
  }

  // ── ISS-C3: load with allSettled ──────────────────────────────

  async function load(): Promise<void> {
    status.value = 'loading'
    errorMessage.value = null
    resetSections('loading')

    // Stagger: events + authEvents first (primary data)
    const [eventsResult, authResult] = await Promise.allSettled([
      auditApi.listEvents(eventFilters.value),
      auditApi.listAuthenticationEvents(authenticationEventFilters.value),
    ])

    applySectionResult('events', eventsResult, (resp) => {
      events.value = resp.events
      eventPagination.value = resp.pagination ?? null
      selectedEventId.value = resp.events[0]?.event_id ?? null
    })
    applySectionResult('authEvents', authResult, (resp) => {
      authenticationEvents.value = resp.events
      authenticationEventPagination.value = resp.pagination ?? null
      selectedAuthenticationEventId.value = resp.events[0]?.event_id ?? null
    })

    // Secondary: integrity, retention, DSR
    const [integrityResult, retentionResult, dsrResult] = await Promise.allSettled([
      auditApi.getIntegrity(),
      auditApi.getRetentionStatus(),
      auditApi.listDataSubjectRequests({ status: 'submitted' }),
    ])

    applySectionResult('integrity', integrityResult, (resp) => {
      integrity.value = resp.integrity
    })
    applySectionResult('retention', retentionResult, (resp) => {
      retentionStatus.value = resp.retention
    })
    applySectionResult('dsr', dsrResult, (resp) => {
      dataSubjectRequests.value = resp.requests
    })

    status.value = hasAnySectionSuccess.value ? 'success' : 'error'
    requestId.value = resolveOverallRequestId()

    if (!hasAnySectionSuccess.value) {
      errorMessage.value = 'Semua bagian audit compliance gagal dimuat. Silakan coba lagi.'
    }
  }

  async function retrySection(section: SectionKey): Promise<void> {
    sections.value[section] = { status: 'loading', error: null, requestId: null }

    switch (section) {
      case 'events': {
        const result = await promiseSettled(auditApi.listEvents(eventFilters.value))
        applySectionResult('events', result, (resp) => {
          events.value = resp.events
          eventPagination.value = resp.pagination ?? null
          selectedEventId.value = resp.events[0]?.event_id ?? null
        })
        break
      }
      case 'authEvents': {
        const result = await promiseSettled(
          auditApi.listAuthenticationEvents(authenticationEventFilters.value),
        )
        applySectionResult('authEvents', result, (resp) => {
          authenticationEvents.value = resp.events
          authenticationEventPagination.value = resp.pagination ?? null
          selectedAuthenticationEventId.value = resp.events[0]?.event_id ?? null
        })
        break
      }
      case 'integrity': {
        const result = await promiseSettled(auditApi.getIntegrity())
        applySectionResult('integrity', result, (resp) => {
          integrity.value = resp.integrity
        })
        break
      }
      case 'retention': {
        const result = await promiseSettled(auditApi.getRetentionStatus())
        applySectionResult('retention', result, (resp) => {
          retentionStatus.value = resp.retention
        })
        break
      }
      case 'dsr': {
        const result = await promiseSettled(
          auditApi.listDataSubjectRequests({ status: 'submitted' }),
        )
        applySectionResult('dsr', result, (resp) => {
          dataSubjectRequests.value = resp.requests
        })
        break
      }
    }

    requestId.value = getLastRequestId()
    if (hasAnySectionSuccess.value) status.value = 'success'
  }

  // ── search / pagination (unchanged logic, per-section errors) ──

  async function searchEvents(filters: AuditEventFilters): Promise<void> {
    sectionLoading('events')
    eventFilters.value = { ...filters, limit: 50 }

    try {
      const response = await auditApi.listEvents(eventFilters.value)
      events.value = response.events
      eventPagination.value = response.pagination ?? null
      selectedEventId.value = response.events[0]?.event_id ?? null
      selectedEventDetail.value = null
      requestId.value = getLastRequestId()
      sectionSuccess('events')
      status.value = 'success'
    } catch (error) {
      events.value = []
      eventPagination.value = null
      selectedEventId.value = null
      selectedEventDetail.value = null
      sectionFailed('events', error)
      status.value = hasAnySectionSuccess.value ? 'partial' : 'error'
    }
  }

  async function loadMoreEvents(): Promise<void> {
    const cursor = eventPagination.value?.next_cursor
    if (!cursor) return

    try {
      const response = await auditApi.listEvents({ ...eventFilters.value, cursor })
      events.value = [...events.value, ...response.events]
      eventPagination.value = response.pagination ?? null
      requestId.value = getLastRequestId()
    } catch (error) {
      handleActionError(error)
    }
  }

  async function searchAuthenticationEvents(
    filters: AuthenticationAuditEventFilters,
  ): Promise<void> {
    sectionLoading('authEvents')
    authenticationEventFilters.value = { ...filters, limit: 25 }

    try {
      const response = await auditApi.listAuthenticationEvents(authenticationEventFilters.value)
      authenticationEvents.value = response.events
      authenticationEventPagination.value = response.pagination ?? null
      selectedAuthenticationEventId.value = response.events[0]?.event_id ?? null
      selectedAuthenticationEventDetail.value = null
      requestId.value = getLastRequestId()
      sectionSuccess('authEvents')
      status.value = 'success'
    } catch (error) {
      authenticationEvents.value = []
      authenticationEventPagination.value = null
      selectedAuthenticationEventId.value = null
      selectedAuthenticationEventDetail.value = null
      sectionFailed('authEvents', error)
      status.value = hasAnySectionSuccess.value ? 'partial' : 'error'
    }
  }

  async function loadMoreAuthenticationEvents(): Promise<void> {
    const cursor = authenticationEventPagination.value?.next_cursor
    if (!cursor) return

    try {
      const response = await auditApi.listAuthenticationEvents({
        ...authenticationEventFilters.value,
        cursor,
      })
      authenticationEvents.value = [...authenticationEvents.value, ...response.events]
      authenticationEventPagination.value = response.pagination ?? null
      requestId.value = getLastRequestId()
    } catch (error) {
      handleActionError(error)
    }
  }

  // ── detail loading ───────────────────────────────────────────

  async function selectEvent(eventId: string): Promise<void> {
    selectedEventId.value = eventId
    errorMessage.value = null

    try {
      const response = await auditApi.showEvent(eventId)
      selectedEventDetail.value = response.event
      upsertEvent(response.event)
      requestId.value = getLastRequestId()
    } catch (error) {
      handleActionError(error)
    }
  }

  async function selectAuthenticationEvent(eventId: string): Promise<void> {
    selectedAuthenticationEventId.value = eventId
    errorMessage.value = null

    try {
      const response = await auditApi.showAuthenticationEvent(eventId)
      selectedAuthenticationEventDetail.value = response.event
      upsertAuthenticationEvent(response.event)
      requestId.value = getLastRequestId()
    } catch (error) {
      handleActionError(error)
    }
  }

  // ── DSR actions ──────────────────────────────────────────────

  async function reviewRequest(
    requestIdValue: string,
    decision: 'approved' | 'rejected',
    notes?: string,
  ): Promise<void> {
    actionStatus.value = 'loading'
    errorMessage.value = null

    try {
      const response = await auditApi.reviewDataSubjectRequest(requestIdValue, { decision, notes })
      upsertDataSubjectRequest(response.request)
      requestId.value = getLastRequestId()
      actionStatus.value = 'success'
    } catch (error) {
      handleActionError(error)
    }
  }

  async function fulfillRequest(requestIdValue: string, dryRun = true): Promise<void> {
    actionStatus.value = 'loading'
    errorMessage.value = null

    try {
      await auditApi.fulfillDataSubjectRequest(requestIdValue, { dry_run: dryRun })
      requestId.value = getLastRequestId()
      actionStatus.value = 'success'
    } catch (error) {
      handleActionError(error)
    }
  }

  // ── exports ──────────────────────────────────────────────────

  async function exportEvents(filters: AuditExportFilters): Promise<void> {
    actionStatus.value = 'loading'
    errorMessage.value = null

    try {
      const { blob, filename } = await auditApi.exportEvents(filters)
      triggerBlobDownload(blob, filename ?? `audit-export.${filters.format}`)
      requestId.value = getLastRequestId()
      actionStatus.value = 'success'
    } catch (error) {
      handleActionError(error)
    }
  }

  async function generateEvidencePack(filters: ComplianceEvidencePackFilters): Promise<void> {
    actionStatus.value = 'loading'
    errorMessage.value = null

    try {
      const { blob, filename } = await auditApi.generateEvidencePack(filters)
      triggerBlobDownload(blob, filename ?? `compliance-evidence-pack.${filters.format ?? 'zip'}`)
      requestId.value = getLastRequestId()
      actionStatus.value = 'success'
    } catch (error) {
      handleActionError(error)
    }
  }

  // ── helpers ──────────────────────────────────────────────────

  function upsertEvent(nextEvent: AdminAuditEvent): void {
    events.value = events.value.some((event) => event.event_id === nextEvent.event_id)
      ? events.value.map((event) => (event.event_id === nextEvent.event_id ? nextEvent : event))
      : [nextEvent, ...events.value]
  }

  function upsertAuthenticationEvent(nextEvent: AuthenticationAuditEvent): void {
    authenticationEvents.value = authenticationEvents.value.some(
      (event) => event.event_id === nextEvent.event_id,
    )
      ? authenticationEvents.value.map((event) =>
          event.event_id === nextEvent.event_id ? nextEvent : event,
        )
      : [nextEvent, ...authenticationEvents.value]
  }

  function upsertDataSubjectRequest(nextRequest: DataSubjectRequest): void {
    dataSubjectRequests.value = dataSubjectRequests.value.some(
      (request) => request.request_id === nextRequest.request_id,
    )
      ? dataSubjectRequests.value.map((request) =>
          request.request_id === nextRequest.request_id ? nextRequest : request,
        )
      : [nextRequest, ...dataSubjectRequests.value]
  }

  // ── section state helpers ────────────────────────────────────

  function resetSections(initial: SectionStatus): void {
    for (const key of Object.keys(sections.value) as SectionKey[]) {
      sections.value[key] = { status: initial, error: null, requestId: null }
    }
  }

  function sectionLoading(key: SectionKey): void {
    sections.value[key] = { status: 'loading', error: null, requestId: null }
  }

  function sectionSuccess(key: SectionKey): void {
    sections.value[key] = { status: 'success', error: null, requestId: getLastRequestId() }
  }

  function sectionFailed(key: SectionKey, error: unknown, reqId?: string | null): void {
    const resolvedRequestId = error instanceof ApiError
      ? (error.requestId ?? getLastRequestId())
      : (reqId ?? getLastRequestId())

    const ref = formatRef(resolvedRequestId)
    const label = sectionLabel(key)
    const message = error instanceof ApiError
      ? safeSectionErrorMessage(key, error, ref)
      : `${label} gagal dimuat. Gunakan kode referensi ${ref} untuk investigasi.`

    sections.value[key] = {
      status: sectionErrorStatus(error),
      error: message,
      requestId: resolvedRequestId,
    }

    errorMessage.value = message
    requestId.value = resolvedRequestId
  }

  function applySectionResult<T>(
    key: SectionKey,
    result: PromiseSettledResult<T>,
    onSuccess: (data: T) => void,
  ): void {
    if (result.status === 'fulfilled') {
      onSuccess(result.value)
      sectionSuccess(key)
    } else {
      sectionFailed(key, result.reason)
    }
  }

  // ── error handling ───────────────────────────────────────────

  function resolveOverallRequestId(): string | null {
    const errorSection = Object.values(sections.value).find((s) => s.status === 'error' || s.status === 'forbidden')
    return errorSection?.requestId ?? getLastRequestId()
  }

  function handleLoadError(error: unknown): void {
    if (error instanceof ApiError) {
      requestId.value = error.requestId ?? getLastRequestId()

      if (error.status === 401) {
        status.value = 'unauthenticated'
        errorMessage.value = 'Sesi admin berakhir. Login ulang untuk melanjutkan.'
        return
      }

      if (error.status === 403) {
        status.value = 'forbidden'
        errorMessage.value = 'Kamu tidak memiliki izin untuk melihat audit compliance.'
        return
      }
    } else {
      requestId.value = getLastRequestId()
    }

    status.value = 'error'
    const ref = formatRef(requestId.value)
    errorMessage.value = ref !== 'N/A'
      ? `Audit compliance belum bisa dimuat. Coba lagi atau gunakan kode referensi ${ref} untuk investigasi.`
      : 'Audit compliance belum bisa dimuat. Coba lagi beberapa saat lagi.'
  }

  function handleActionError(error: unknown): void {
    requestId.value =
      error instanceof ApiError ? (error.requestId ?? getLastRequestId()) : getLastRequestId()

    if (
      error instanceof ApiError &&
      (error.code === 'reauth_required' ||
        error.code === 'step_up_required' ||
        error.status === 428 ||
        error.status === 412)
    ) {
      actionStatus.value = 'step_up_required'
      errorMessage.value =
        'Aksi audit membutuhkan re-autentikasi (fresh-auth atau MFA assurance). Ulangi login admin lalu coba lagi.'
      triggerStepUpReauth()
      return
    }

    actionStatus.value = 'error'
    const ref = formatRef(requestId.value)
    errorMessage.value = ref !== 'N/A'
      ? `Operasi audit compliance gagal. Gunakan kode referensi ${ref} untuk investigasi.`
      : 'Operasi audit compliance gagal. Coba lagi beberapa saat lagi.'
  }

  function sectionLabel(key: SectionKey): string {
    return (
      {
        events: 'Audit log events',
        integrity: 'Integritas hash chain',
        retention: 'Status retensi',
        dsr: 'Data subject requests',
        authEvents: 'Authentication events',
      } as const
    )[key]
  }

  function sectionErrorStatus(error: unknown): SectionStatus {
    if (error instanceof ApiError) {
      if (error.status === 401) return 'unauthenticated'
      if (error.status === 403) return 'forbidden'
    }
    return 'error'
  }

  function safeSectionErrorMessage(key: SectionKey, error: ApiError, ref: string): string {
    const label = sectionLabel(key)
    if (error.status === 401) return `Sesi admin berakhir. Login ulang untuk melanjutkan.`
    if (error.status === 403) return `Kamu tidak memiliki izin untuk melihat ${label.toLowerCase()}.`
    return `${label} gagal dimuat. Gunakan kode referensi ${ref} untuk investigasi.`
  }

  return {
    status,
    actionStatus,
    events,
    eventFilters,
    eventPagination,
    selectedEventId,
    selectedEvent,
    selectedEventDetail,
    integrity,
    retentionStatus,
    dataSubjectRequests,
    authenticationEvents,
    authenticationEventFilters,
    authenticationEventPagination,
    selectedAuthenticationEventId,
    selectedAuthenticationEvent,
    selectedAuthenticationEventDetail,
    errorMessage,
    requestId,
    sections,
    load,
    retrySection,
    searchEvents,
    loadMoreEvents,
    searchAuthenticationEvents,
    loadMoreAuthenticationEvents,
    selectEvent,
    selectAuthenticationEvent,
    reviewRequest,
    fulfillRequest,
    exportEvents,
    generateEvidencePack,
  }
})

// ── utility ────────────────────────────────────────────────────

async function promiseSettled<T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> {
  try {
    const value = await promise
    return { status: 'fulfilled', value }
  } catch (reason) {
    return { status: 'rejected', reason }
  }
}
