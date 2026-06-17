import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import {
  isAdminProxyTransportFailure,
  formatTransportErrorMessage,
} from '@/lib/display-identifiers'
import { authAuditApi } from '../services/auth-audit.api'
import type { AuthAuditEvent, AuthAuditFilters, AuthAuditPagination } from '../types'

export type AuthAuditStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'unauthenticated'
  | 'forbidden'
  | 'error'

export const useAuthAuditStore = defineStore('admin-authentication-audit', () => {
  const status = ref<AuthAuditStatus>('idle')
  const events = ref<readonly AuthAuditEvent[]>([])
  const filters = ref<AuthAuditFilters>({ limit: 50 })
  const pagination = ref<AuthAuditPagination | null>(null)
  const selectedEventId = ref<string | null>(null)
  const selectedEventDetail = ref<AuthAuditEvent | null>(null)
  const errorMessage = ref<string | null>(null)
  const requestId = ref<string | null>(null)

  const selectedEvent = computed<AuthAuditEvent | null>(
    () =>
      selectedEventDetail.value ??
      events.value.find((e) => e.event_id === selectedEventId.value) ??
      null,
  )

  async function load(): Promise<void> {
    status.value = 'loading'
    errorMessage.value = null

    try {
      const response = await authAuditApi.listEvents(filters.value)
      events.value = response.events
      pagination.value = response.pagination ?? null
      selectedEventId.value = response.events[0]?.event_id ?? null
      requestId.value = getLastRequestId()
      status.value = 'success'
    } catch (error) {
      events.value = []
      pagination.value = null
      selectedEventId.value = null
      selectedEventDetail.value = null
      handleLoadError(error)
    }
  }

  async function search(newFilters: AuthAuditFilters): Promise<void> {
    filters.value = { ...newFilters, limit: 50 }
    status.value = 'loading'
    errorMessage.value = null

    try {
      const response = await authAuditApi.listEvents(filters.value)
      events.value = response.events
      pagination.value = response.pagination ?? null
      selectedEventId.value = response.events[0]?.event_id ?? null
      selectedEventDetail.value = null
      requestId.value = getLastRequestId()
      status.value = 'success'
    } catch (error) {
      events.value = []
      pagination.value = null
      selectedEventId.value = null
      selectedEventDetail.value = null
      handleLoadError(error)
    }
  }

  async function loadMore(): Promise<void> {
    const cursor = pagination.value?.next_cursor
    if (!cursor) return

    errorMessage.value = null

    try {
      const response = await authAuditApi.listEvents({ ...filters.value, cursor })
      events.value = [...events.value, ...response.events]
      pagination.value = response.pagination ?? null
      requestId.value = getLastRequestId()
    } catch (error) {
      requestId.value =
        error instanceof ApiError ? (error.requestId ?? getLastRequestId()) : getLastRequestId()
    }
  }

  async function selectEvent(eventId: string): Promise<void> {
    selectedEventId.value = eventId
    errorMessage.value = null

    try {
      const response = await authAuditApi.showEvent(eventId)
      selectedEventDetail.value = response.event
      upsertEvent(response.event)
      requestId.value = getLastRequestId()
    } catch (error) {
      requestId.value =
        error instanceof ApiError ? (error.requestId ?? getLastRequestId()) : getLastRequestId()
    }
  }

  function upsertEvent(next: AuthAuditEvent): void {
    events.value = events.value.some((e) => e.event_id === next.event_id)
      ? events.value.map((e) => (e.event_id === next.event_id ? next : e))
      : [next, ...events.value]
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
        errorMessage.value = 'Kamu tidak memiliki izin untuk melihat authentication audit.'
        return
      }
    } else {
      requestId.value = getLastRequestId()
    }

    status.value = 'error'
    if (isAdminProxyTransportFailure(error)) {
      errorMessage.value =
        formatTransportErrorMessage(requestId.value) ?? 'Authentication audit belum bisa dimuat.'
    } else {
      errorMessage.value = requestId.value
        ? `Authentication audit belum bisa dimuat. Gunakan request ID ${requestId.value} untuk investigasi.`
        : 'Authentication audit belum bisa dimuat. Coba lagi beberapa saat lagi.'
    }
  }

  return {
    status,
    events,
    filters,
    pagination,
    selectedEventId,
    selectedEvent,
    selectedEventDetail,
    errorMessage,
    requestId,
    load,
    search,
    loadMore,
    selectEvent,
  }
})
