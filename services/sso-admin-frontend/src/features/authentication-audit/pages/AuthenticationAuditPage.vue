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
import { useI18n } from '@/composables/useI18n'

const store = useAuthAuditStore()
const { t } = useI18n()

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

const eventColumns = computed(() => [
  { key: 'event_id', label: t('auth_audit.col_event_id') },
  { key: 'event_type', label: t('auth_audit.col_type') },
  { key: 'outcome', label: t('auth_audit.col_outcome') },
  { key: 'request_id', label: t('auth_audit.col_request_id') },
])

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
      <p class="eyebrow">{{ t('auth_audit.eyebrow') }}</p>
      <h1 id="auth-audit-title">{{ t('auth_audit.title') }}</h1>
      <p class="page-summary">
        {{ t('auth_audit.summary') }}
      </p>
    </div>

    <UiSkeleton v-if="store.status === 'loading'" :label="t('auth_audit.loading')" />

    <UiStatusView
      v-else-if="store.status === 'forbidden'"
      tone="forbidden"
      :eyebrow="t('auth_audit.title')"
      :title="t('auth_audit.forbidden_title')"
      :description="store.errorMessage ?? t('admin.forbidden.description')"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="store.status === 'unauthenticated'"
      tone="error"
      eyebrow="Session"
      :title="t('auth_audit.session_expired_title')"
      :description="store.errorMessage ?? t('auth_audit.session_expired_desc')"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="store.status === 'error'"
      tone="api"
      eyebrow="Admin API"
      :title="t('auth_audit.error_loading_title')"
      :description="store.errorMessage ?? t('auth_audit.error_loading_desc')"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <div v-else class="audit-layout">
      <section class="detail-section" aria-labelledby="auth-audit-search-title">
        <h2 id="auth-audit-search-title">{{ t('auth_audit.filter_title') }}</h2>
        <div class="export-filters">
          <UiFormField id="auth-audit-subject-id" :label="t('auth_audit.subject_id')">
            <UiInput
              id="auth-audit-subject-id"
              v-model="searchSubjectId"
              name="auth-audit-subject-id"
              autocomplete="off"
            />
          </UiFormField>
          <UiFormField id="auth-audit-client-id" :label="t('auth_audit.client_id')">
            <UiInput
              id="auth-audit-client-id"
              v-model="searchClientId"
              name="auth-audit-client-id"
              autocomplete="off"
            />
          </UiFormField>
          <UiFormField id="auth-audit-session-id" :label="t('auth_audit.session_id')">
            <UiInput
              id="auth-audit-session-id"
              v-model="searchSessionId"
              name="auth-audit-session-id"
              autocomplete="off"
            />
          </UiFormField>
          <UiFormField id="auth-audit-request-id" :label="t('auth_audit.request_id')">
            <UiInput
              id="auth-audit-request-id"
              v-model="searchRequestId"
              name="auth-audit-request-id"
              autocomplete="off"
            />
          </UiFormField>
          <UiFormField id="auth-audit-event-type" :label="t('auth_audit.event_type')">
            <UiInput
              id="auth-audit-event-type"
              v-model="searchEventType"
              name="auth-audit-event-type"
              autocomplete="off"
            />
          </UiFormField>
          <UiFormField id="auth-audit-outcome" :label="t('auth_audit.outcome')">
            <UiInput
              id="auth-audit-outcome"
              v-model="searchOutcome"
              name="auth-audit-outcome"
              autocomplete="off"
            />
          </UiFormField>
          <UiFormField id="auth-audit-from" :label="t('auth_audit.from')">
            <UiInput id="auth-audit-from" v-model="searchFrom" name="auth-audit-from" type="date" />
          </UiFormField>
          <UiFormField id="auth-audit-to" :label="t('auth_audit.to')">
            <UiInput id="auth-audit-to" v-model="searchTo" name="auth-audit-to" type="date" />
          </UiFormField>
        </div>
        <div class="action-row compact-actions">
          <button
            class="ui-action ui-action--primary auth-audit-search-button"
            type="button"
            @click="submitSearch"
          >
            {{ t('auth_audit.btn_filter') }}
          </button>
          <button
            class="ui-action ui-action--danger auth-audit-reset-button"
            type="button"
            @click="resetSearch"
          >
            {{ t('auth_audit.btn_reset') }}
          </button>
        </div>
      </section>

      <UiEmptyState
        v-if="!hasEvents"
        :title="t('auth_audit.empty_title')"
        :description="t('auth_audit.empty_description')"
      />

      <section v-else class="detail-section" aria-labelledby="auth-audit-events-title">
        <h2 id="auth-audit-events-title">{{ t('auth_audit.events_title') }}</h2>
        <UiDataList
          :caption="t('auth_audit.table_caption')"
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
              {{ t('auth_audit.btn_view') }}
            </button>
          </template>
        </UiDataList>

        <button
          v-if="store.pagination?.has_more && store.pagination?.next_cursor"
          class="ui-action ui-action--primary auth-audit-load-more-button"
          type="button"
          @click="store.loadMore"
        >
          {{ t('auth_audit.btn_load_more') }}
        </button>
      </section>

      <article
        v-if="store.selectedEvent"
        class="detail-section"
        aria-labelledby="auth-audit-detail-title"
      >
        <h2 id="auth-audit-detail-title">{{ t('auth_audit.detail_title') }}</h2>
        <dl class="detail-grid">
          <div>
            <dt>{{ t('auth_audit.col_event_id') }}</dt>
            <dd>{{ store.selectedEvent.event_id }}</dd>
          </div>
          <div>
            <dt>{{ t('auth_audit.col_type') }}</dt>
            <dd>{{ store.selectedEvent.event_type }}</dd>
          </div>
          <div>
            <dt>{{ t('auth_audit.col_outcome') }}</dt>
            <dd>{{ store.selectedEvent.outcome }}</dd>
          </div>
          <div>
            <dt>{{ t('auth_audit.col_subject') }}</dt>
            <dd>
              {{
                store.selectedEvent.subject?.email ?? store.selectedEvent.subject?.subject_id ?? '—'
              }}
            </dd>
          </div>
          <div>
            <dt>{{ t('auth_audit.col_client_id') }}</dt>
            <dd>{{ store.selectedEvent.client_id ?? '—' }}</dd>
          </div>
          <div>
            <dt>{{ t('auth_audit.col_session_id') }}</dt>
            <dd>{{ store.selectedEvent.session_id ?? '—' }}</dd>
          </div>
          <div>
            <dt>{{ t('auth_audit.col_request_id') }}</dt>
            <dd>{{ store.selectedEvent.request?.request_id ?? '—' }}</dd>
          </div>
          <div>
            <dt>{{ t('auth_audit.col_ip_address') }}</dt>
            <dd>{{ store.selectedEvent.request?.ip_address ?? '—' }}</dd>
          </div>
          <div>
            <dt>{{ t('auth_audit.col_error_code') }}</dt>
            <dd>{{ store.selectedEvent.error_code ?? '—' }}</dd>
          </div>
          <div>
            <dt>{{ t('auth_audit.col_occurred_at') }}</dt>
            <dd>{{ store.selectedEvent.occurred_at ?? '—' }}</dd>
          </div>
        </dl>
      </article>
    </div>
  </section>
</template>
