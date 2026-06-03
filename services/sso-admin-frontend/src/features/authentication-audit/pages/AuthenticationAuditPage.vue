<script setup lang="ts">
/**
 * AuthenticationAuditPage — FR-044 / UC-41–UC-42.
 * Dedicated page for authentication events audit.
 * Distinct from Audit Trail (admin.audit.read).
 * Permission: admin.authentication-audit.read
 */

import { computed, onMounted, ref } from 'vue'
import UiDataList, { type UiDataListRow } from '@/components/ui/UiDataList.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import { useAuthAuditStore } from '../stores/auth-audit.store'
import type { AuthAuditFilters } from '../types'

const store = useAuthAuditStore()

const searchSubjectId = ref('')
const searchClientId = ref('')
const searchSessionId = ref('')
const searchRequestId = ref('')
const searchEventType = ref('')
const searchOutcome = ref('')
const searchFrom = ref('')
const searchTo = ref('')

function filled(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

const hasEvents = computed<boolean>(() => store.events.length > 0)

const eventColumns = [
  { key: 'event_id', label: 'Event ID' },
  { key: 'event_type', label: 'Tipe' },
  { key: 'outcome', label: 'Outcome' },
  { key: 'request_id', label: 'Request ID' },
] as const

const eventRows = computed<readonly UiDataListRow[]>(() =>
  store.events.map((event) => ({
    id: event.event_id,
    event_id: event.event_id,
    event_type: event.event_type,
    outcome: event.outcome,
    request_id: event.request?.request_id ?? '—',
  })),
)

async function submitSearch(): Promise<void> {
  const newFilters: AuthAuditFilters = {
    ...(filled(searchSubjectId.value) && { subject_id: filled(searchSubjectId.value) }),
    ...(filled(searchClientId.value) && { client_id: filled(searchClientId.value) }),
    ...(filled(searchSessionId.value) && { session_id: filled(searchSessionId.value) }),
    ...(filled(searchRequestId.value) && { request_id: filled(searchRequestId.value) }),
    ...(filled(searchEventType.value) && { event_type: filled(searchEventType.value) }),
    ...(filled(searchOutcome.value) && { outcome: filled(searchOutcome.value) }),
    ...(searchFrom.value && { from: searchFrom.value }),
    ...(searchTo.value && { to: searchTo.value }),
  }
  await store.search(newFilters)
}

async function resetSearch(): Promise<void> {
  searchSubjectId.value = ''
  searchClientId.value = ''
  searchSessionId.value = ''
  searchRequestId.value = ''
  searchEventType.value = ''
  searchOutcome.value = ''
  searchFrom.value = ''
  searchTo.value = ''
  await store.search({})
}

onMounted(() => {
  if (store.status === 'idle') void store.load()
})
</script>

<template>
  <section class="authentication-audit-page" aria-labelledby="auth-audit-title">
    <div class="page-heading">
      <p class="eyebrow">Keamanan</p>
      <h1 id="auth-audit-title">Authentication Audit</h1>
      <p class="page-summary">
        Riwayat event autentikasi: login, logout, consent, MFA challenge, dan error autentikasi.
        Berbeda dari Audit Trail (yang mencatat aksi admin); halaman ini mencatat aktivitas
        autentikasi user. Permission: <code>admin.authentication-audit.read</code>.
      </p>
    </div>

    <UiSkeleton v-if="store.status === 'loading'" label="Memuat authentication audit" />

    <UiStatusView
      v-else-if="store.status === 'forbidden'"
      tone="forbidden"
      eyebrow="Authentication Audit"
      title="Akses ditolak"
      :description="
        store.errorMessage ?? 'Kamu tidak memiliki izin untuk melihat authentication audit.'
      "
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="store.status === 'unauthenticated'"
      tone="error"
      eyebrow="Session"
      title="Sesi admin berakhir"
      :description="store.errorMessage ?? 'Login ulang dari portal untuk melanjutkan.'"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="store.status === 'error'"
      tone="api"
      eyebrow="Admin API"
      title="Authentication audit belum bisa dimuat"
      :description="
        store.errorMessage ?? 'Coba muat ulang atau gunakan request ID untuk investigasi.'
      "
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <div v-else class="audit-layout">
      <section class="detail-section" aria-labelledby="auth-audit-search-title">
        <h2 id="auth-audit-search-title">Filter Event</h2>
        <div class="export-filters">
          <UiFormField id="auth-audit-subject-id" label="Subject ID">
            <UiInput
              id="auth-audit-subject-id"
              v-model="searchSubjectId"
              name="auth-audit-subject-id"
              autocomplete="off"
            />
          </UiFormField>
          <UiFormField id="auth-audit-client-id" label="Client ID">
            <UiInput
              id="auth-audit-client-id"
              v-model="searchClientId"
              name="auth-audit-client-id"
              autocomplete="off"
            />
          </UiFormField>
          <UiFormField id="auth-audit-session-id" label="Session ID">
            <UiInput
              id="auth-audit-session-id"
              v-model="searchSessionId"
              name="auth-audit-session-id"
              autocomplete="off"
            />
          </UiFormField>
          <UiFormField id="auth-audit-request-id" label="Request ID">
            <UiInput
              id="auth-audit-request-id"
              v-model="searchRequestId"
              name="auth-audit-request-id"
              autocomplete="off"
            />
          </UiFormField>
          <UiFormField id="auth-audit-event-type" label="Event Type">
            <UiInput
              id="auth-audit-event-type"
              v-model="searchEventType"
              name="auth-audit-event-type"
              autocomplete="off"
            />
          </UiFormField>
          <UiFormField id="auth-audit-outcome" label="Outcome">
            <UiInput
              id="auth-audit-outcome"
              v-model="searchOutcome"
              name="auth-audit-outcome"
              autocomplete="off"
            />
          </UiFormField>
          <UiFormField id="auth-audit-from" label="From">
            <UiInput
              id="auth-audit-from"
              v-model="searchFrom"
              name="auth-audit-from"
              type="date"
            />
          </UiFormField>
          <UiFormField id="auth-audit-to" label="To">
            <UiInput id="auth-audit-to" v-model="searchTo" name="auth-audit-to" type="date" />
          </UiFormField>
        </div>
        <div class="action-row compact-actions">
          <button
            class="ui-action ui-action--primary auth-audit-search-button"
            type="button"
            @click="submitSearch"
          >
            Filter
          </button>
          <button
            class="ui-action ui-action--danger auth-audit-reset-button"
            type="button"
            @click="resetSearch"
          >
            Reset
          </button>
        </div>
      </section>

      <UiEmptyState
        v-if="!hasEvents"
        title="Belum ada authentication event"
        description="Gunakan filter di atas atau tunggu event autentikasi tercatat di backend."
      />

      <section v-else class="detail-section" aria-labelledby="auth-audit-events-title">
        <h2 id="auth-audit-events-title">Authentication Events</h2>
        <UiDataList
          caption="Authentication event table"
          :columns="eventColumns"
          :rows="eventRows"
        >
          <template #actions="{ row }">
            <button
              class="ui-action ui-action--secondary"
              :aria-current="row.id === store.selectedEventId ? 'true' : undefined"
              :aria-label="`View ${row.event_id} ${row.event_type}`"
              type="button"
              @click="store.selectEvent(row.id)"
            >
              View
            </button>
          </template>
        </UiDataList>

        <button
          v-if="store.pagination?.has_more && store.pagination?.next_cursor"
          class="ui-action ui-action--primary auth-audit-load-more-button"
          type="button"
          @click="store.loadMore"
        >
          Muat lebih banyak
        </button>
      </section>

      <article
        v-if="store.selectedEvent"
        class="detail-section"
        aria-labelledby="auth-audit-detail-title"
      >
        <h2 id="auth-audit-detail-title">Detail Event</h2>
        <dl class="detail-grid">
          <div>
            <dt>Event ID</dt>
            <dd>{{ store.selectedEvent.event_id }}</dd>
          </div>
          <div>
            <dt>Tipe</dt>
            <dd>{{ store.selectedEvent.event_type }}</dd>
          </div>
          <div>
            <dt>Outcome</dt>
            <dd>{{ store.selectedEvent.outcome }}</dd>
          </div>
          <div>
            <dt>Subject</dt>
            <dd>
              {{
                store.selectedEvent.subject?.email ??
                store.selectedEvent.subject?.subject_id ??
                '—'
              }}
            </dd>
          </div>
          <div>
            <dt>Client ID</dt>
            <dd>{{ store.selectedEvent.client_id ?? '—' }}</dd>
          </div>
          <div>
            <dt>Session ID</dt>
            <dd>{{ store.selectedEvent.session_id ?? '—' }}</dd>
          </div>
          <div>
            <dt>Request ID</dt>
            <dd>{{ store.selectedEvent.request?.request_id ?? '—' }}</dd>
          </div>
          <div>
            <dt>IP Address</dt>
            <dd>{{ store.selectedEvent.request?.ip_address ?? '—' }}</dd>
          </div>
          <div>
            <dt>Error Code</dt>
            <dd>{{ store.selectedEvent.error_code ?? '—' }}</dd>
          </div>
          <div>
            <dt>Occurred At</dt>
            <dd>{{ store.selectedEvent.occurred_at ?? '—' }}</dd>
          </div>
        </dl>
      </article>
    </div>
  </section>
</template>
