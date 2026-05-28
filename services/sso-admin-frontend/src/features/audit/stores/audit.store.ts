import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { auditApi } from '../services/audit.api'
import type {
  AdminAuditEvent,
  AuthenticationAuditEvent,
  AuditIntegrity,
  DataSubjectRequest,
} from '../types'

export type AuditStatus = 'idle' | 'loading' | 'success' | 'unauthenticated' | 'forbidden' | 'error'
export type AuditActionStatus = 'idle' | 'loading' | 'success' | 'error'

export const useAuditStore = defineStore('admin-audit', () => {
  const status = ref<AuditStatus>('idle')
  const actionStatus = ref<AuditActionStatus>('idle')
  const events = ref<readonly AdminAuditEvent[]>([])
  const selectedEventId = ref<string | null>(null)
  const selectedEventDetail = ref<AdminAuditEvent | null>(null)
  const integrity = ref<AuditIntegrity | null>(null)
  const dataSubjectRequests = ref<readonly DataSubjectRequest[]>([])
  const authenticationEvents = ref<readonly AuthenticationAuditEvent[]>([])
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
          auditApi.listEvents({ limit: 50 }),
          auditApi.getIntegrity(),
          auditApi.listDataSubjectRequests({ status: 'submitted' }),
          auditApi.listAuthenticationEvents({ limit: 25 }),
        ])
      events.value = eventResponse.events
      selectedEventId.value = eventResponse.events[0]?.event_id ?? null
      integrity.value = integrityResponse.integrity
      dataSubjectRequests.value = dsrResponse.requests
      authenticationEvents.value = authenticationEventResponse.events
      selectedAuthenticationEventId.value = authenticationEventResponse.events[0]?.event_id ?? null
      requestId.value = getLastRequestId()
      status.value = 'success'
    } catch (error) {
      events.value = []
      selectedEventId.value = null
      selectedEventDetail.value = null
      integrity.value = null
      dataSubjectRequests.value = []
      authenticationEvents.value = []
      selectedAuthenticationEventId.value = null
      selectedAuthenticationEventDetail.value = null
      handleLoadError(error)
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
    actionStatus.value = 'error'
    errorMessage.value = requestId.value
      ? `Operasi audit compliance gagal. Gunakan request ID ${requestId.value} untuk investigasi.`
      : 'Operasi audit compliance gagal. Coba lagi beberapa saat lagi.'
  }

  return {
    status,
    actionStatus,
    events,
    selectedEventId,
    selectedEvent,
    selectedEventDetail,
    integrity,
    dataSubjectRequests,
    authenticationEvents,
    selectedAuthenticationEventId,
    selectedAuthenticationEvent,
    selectedAuthenticationEventDetail,
    errorMessage,
    requestId,
    load,
    selectEvent,
    selectAuthenticationEvent,
    reviewRequest,
    fulfillRequest,
  }
})
