import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { triggerBlobDownload } from '@/lib/download/trigger-download'
import { auditApi } from '../services/audit.api'
import type {
  AdminAuditEvent,
  AuthenticationAuditEvent,
  AuditEventFilters,
  AuditExportFilters,
  AuditIntegrity,
  AuditPagination,
  AuthenticationAuditEventFilters,
  DataSubjectRequest,
} from '../types'

export type AuditStatus = 'idle' | 'loading' | 'success' | 'unauthenticated' | 'forbidden' | 'error'
export type AuditActionStatus = 'idle' | 'loading' | 'success' | 'step_up_required' | 'error'

export const useAuditStore = defineStore('admin-audit', () => {
  const status = ref<AuditStatus>('idle')
  const actionStatus = ref<AuditActionStatus>('idle')
  const events = ref<readonly AdminAuditEvent[]>([])
  const eventFilters = ref<AuditEventFilters>({ limit: 50 })
  const eventPagination = ref<AuditPagination | null>(null)
  const selectedEventId = ref<string | null>(null)
  const selectedEventDetail = ref<AdminAuditEvent | null>(null)
  const integrity = ref<AuditIntegrity | null>(null)
  const dataSubjectRequests = ref<readonly DataSubjectRequest[]>([])
  const authenticationEvents = ref<readonly AuthenticationAuditEvent[]>([])
  const authenticationEventFilters = ref<AuthenticationAuditEventFilters>({ limit: 25 })
  const authenticationEventPagination = ref<AuditPagination | null>(null)
  const selectedAuthenticationEventId = ref<string | null>(null)
  const selectedAuthenticationEventDetail = ref<AuthenticationAuditEvent | null>(null)
  const errorMessage = ref<string | null>(null)
  const requestId = ref<string | null>(null)

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

  async function load(): Promise<void> {
    status.value = 'loading'
    errorMessage.value = null

    try {
      const [eventResponse, integrityResponse, dsrResponse, authenticationEventResponse] =
        await Promise.all([
          auditApi.listEvents(eventFilters.value),
          auditApi.getIntegrity(),
          auditApi.listDataSubjectRequests({ status: 'submitted' }),
          auditApi.listAuthenticationEvents(authenticationEventFilters.value),
        ])
      events.value = eventResponse.events
      eventPagination.value = eventResponse.pagination ?? null
      selectedEventId.value = eventResponse.events[0]?.event_id ?? null
      integrity.value = integrityResponse.integrity
      dataSubjectRequests.value = dsrResponse.requests
      authenticationEvents.value = authenticationEventResponse.events
      authenticationEventPagination.value = authenticationEventResponse.pagination ?? null
      selectedAuthenticationEventId.value = authenticationEventResponse.events[0]?.event_id ?? null
      requestId.value = getLastRequestId()
      status.value = 'success'
    } catch (error) {
      events.value = []
      eventPagination.value = null
      selectedEventId.value = null
      selectedEventDetail.value = null
      integrity.value = null
      dataSubjectRequests.value = []
      authenticationEvents.value = []
      authenticationEventPagination.value = null
      selectedAuthenticationEventId.value = null
      selectedAuthenticationEventDetail.value = null
      handleLoadError(error)
    }
  }

  async function searchEvents(filters: AuditEventFilters): Promise<void> {
    status.value = 'loading'
    errorMessage.value = null
    eventFilters.value = { ...filters, limit: 50 }

    try {
      const response = await auditApi.listEvents(eventFilters.value)
      events.value = response.events
      eventPagination.value = response.pagination ?? null
      selectedEventId.value = response.events[0]?.event_id ?? null
      selectedEventDetail.value = null
      requestId.value = getLastRequestId()
      status.value = 'success'
    } catch (error) {
      events.value = []
      eventPagination.value = null
      selectedEventId.value = null
      selectedEventDetail.value = null
      handleLoadError(error)
    }
  }

  async function loadMoreEvents(): Promise<void> {
    const cursor = eventPagination.value?.next_cursor
    if (!cursor) return

    errorMessage.value = null

    try {
      const response = await auditApi.listEvents({ ...eventFilters.value, cursor })
      events.value = [...events.value, ...response.events]
      eventPagination.value = response.pagination ?? null
      requestId.value = getLastRequestId()
    } catch (error) {
      handleActionError(error)
    }
  }

  async function searchAuthenticationEvents(filters: AuthenticationAuditEventFilters): Promise<void> {
    status.value = 'loading'
    errorMessage.value = null
    authenticationEventFilters.value = { ...filters, limit: 25 }

    try {
      const response = await auditApi.listAuthenticationEvents(authenticationEventFilters.value)
      authenticationEvents.value = response.events
      authenticationEventPagination.value = response.pagination ?? null
      selectedAuthenticationEventId.value = response.events[0]?.event_id ?? null
      selectedAuthenticationEventDetail.value = null
      requestId.value = getLastRequestId()
      status.value = 'success'
    } catch (error) {
      authenticationEvents.value = []
      authenticationEventPagination.value = null
      selectedAuthenticationEventId.value = null
      selectedAuthenticationEventDetail.value = null
      handleLoadError(error)
    }
  }

  async function loadMoreAuthenticationEvents(): Promise<void> {
    const cursor = authenticationEventPagination.value?.next_cursor
    if (!cursor) return

    errorMessage.value = null

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
    errorMessage.value = requestId.value
      ? `Audit compliance belum bisa dimuat. Coba lagi atau gunakan request ID ${requestId.value} untuk investigasi.`
      : 'Audit compliance belum bisa dimuat. Coba lagi beberapa saat lagi.'
  }

  function handleActionError(error: unknown): void {
    requestId.value =
      error instanceof ApiError ? (error.requestId ?? getLastRequestId()) : getLastRequestId()

    if (error instanceof ApiError && (error.status === 428 || error.status === 412)) {
      actionStatus.value = 'step_up_required'
      errorMessage.value =
        'Aksi audit membutuhkan re-autentikasi (fresh-auth atau MFA assurance). Ulangi login admin lalu coba lagi.'
      return
    }

    actionStatus.value = 'error'
    errorMessage.value = requestId.value
      ? `Operasi audit compliance gagal. Gunakan request ID ${requestId.value} untuk investigasi.`
      : 'Operasi audit compliance gagal. Coba lagi beberapa saat lagi.'
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
    dataSubjectRequests,
    authenticationEvents,
    authenticationEventFilters,
    authenticationEventPagination,
    selectedAuthenticationEventId,
    selectedAuthenticationEvent,
    selectedAuthenticationEventDetail,
    errorMessage,
    requestId,
    load,
    searchEvents,
    loadMoreEvents,
    searchAuthenticationEvents,
    loadMoreAuthenticationEvents,
    selectEvent,
    selectAuthenticationEvent,
    reviewRequest,
    fulfillRequest,
    exportEvents,
  }
})
