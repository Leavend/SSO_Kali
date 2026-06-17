<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from '@/composables/useI18n'
import { useRoute } from 'vue-router'
import { FileSearch, CheckCircle, ChevronDown, ChevronRight } from 'lucide-vue-next'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiDataList, { type UiDataListRow } from '@/components/ui/UiDataList.vue'
import { useAuditStore } from '@/features/audit/stores/audit.store'
import { formatTechnicalPreview } from '@/lib/display-identifiers'
import type { AuthenticationAuditEventFilters } from '../types'

const store = useAuditStore()
const route = useRoute()
const { t } = useI18n()

const emit = defineEmits<{
  (e: 'open-audit-detail', id: string): void
  (e: 'open-auth-detail', id: string): void
}>()

const searchRequestId = ref('')
const searchAction = ref('')
const searchOutcome = ref('')
const searchSupportReference = ref('')
const searchSessionId = ref('')
const searchTaxonomy = ref('')
const searchAdminSubjectId = ref('')
const searchSubjectId = ref('')
const searchClientId = ref('')
const searchFrom = ref('')
const searchTo = ref('')
const selectedConsentAction = ref<'all' | 'allow' | 'deny' | 'revoke'>('all')
const hasRequestedConsentEvents = ref(false)
const isConsentSearchPending = ref(false)
const showAdvancedFilters = ref(false)
const loadingTableRows = Array.from({ length: 4 }, (_, index) => index)

const isAuditEventsLoading = computed(
  () =>
    (store.status === 'idle' ||
      store.status === 'loading' ||
      store.sections.events.status === 'loading') &&
    store.events.length === 0,
)
const isConsentEventsLoading = computed(
  () =>
    hasRequestedConsentEvents.value &&
    isConsentSearchPending.value &&
    store.consentEvents.length === 0,
)
const showConsentEventsPrompt = computed(
  () => !hasRequestedConsentEvents.value && store.consentEvents.length === 0,
)
const showAuditEventsEmpty = computed(
  () => !isAuditEventsLoading.value && store.events.length === 0,
)
const showConsentEventsEmpty = computed(
  () =>
    hasRequestedConsentEvents.value &&
    !isConsentEventsLoading.value &&
    store.consentEvents.length === 0,
)

const auditEventColumns = [
  { key: 'event_id', label: 'Kode event' },
  { key: 'action', label: 'Action' },
  { key: 'outcome', label: 'Outcome' },
  { key: 'taxonomy', label: 'Taxonomy' },
] as const
const authenticationEventColumns = [
  { key: 'event_id', label: 'Kode event' },
  { key: 'event_type', label: 'Event type' },
  { key: 'outcome', label: 'Outcome' },
  { key: 'request_id', label: 'Kode request' },
] as const
const auditEventRows = computed<readonly UiDataListRow[]>(() =>
  store.events.map((event) => ({
    id: event.event_id,
    event_id: formatTechnicalPreview(event.event_id),
    action: event.action,
    outcome: event.outcome,
    taxonomy: event.taxonomy ?? 'taxonomy unknown',
  })),
)
const consentEventRows = computed<readonly UiDataListRow[]>(() =>
  store.consentEvents.map((event) => ({
    id: event.event_id,
    event_id: formatTechnicalPreview(event.event_id),
    event_type: event.event_type,
    outcome: event.outcome,
    request_id: formatTechnicalPreview(event.request?.request_id),
  })),
)

function openAuditEventDetail(eventId: string): void {
  emit('open-audit-detail', eventId)
}

function openAuthenticationEventDetail(eventId: string): void {
  emit('open-auth-detail', eventId)
}

function filled(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

async function submitSearch(): Promise<void> {
  hasRequestedConsentEvents.value = true
  isConsentSearchPending.value = true
  try {
    await Promise.all([
      store.searchEvents({
        ...(filled(searchAction.value) && { action: filled(searchAction.value) }),
        ...(filled(searchOutcome.value) && { outcome: filled(searchOutcome.value) }),
        ...(filled(searchTaxonomy.value) && { taxonomy: filled(searchTaxonomy.value) }),
        ...(filled(searchAdminSubjectId.value) && {
          admin_subject_id: filled(searchAdminSubjectId.value),
        }),
        ...(filled(searchRequestId.value) && { request_id: filled(searchRequestId.value) }),
        ...(filled(searchSupportReference.value) && {
          support_reference: filled(searchSupportReference.value),
        }),
        ...(searchFrom.value && { from: searchFrom.value }),
        ...(searchTo.value && { to: searchTo.value }),
      }),
      store.searchAuthenticationEvents({
        ...(filled(searchRequestId.value) && { request_id: filled(searchRequestId.value) }),
        ...(filled(searchSupportReference.value) && {
          support_reference: filled(searchSupportReference.value),
        }),
        ...(filled(searchSessionId.value) && { session_id: filled(searchSessionId.value) }),
        ...(filled(searchSubjectId.value) && { subject_id: filled(searchSubjectId.value) }),
        ...(filled(searchClientId.value) && { client_id: filled(searchClientId.value) }),
        ...(filled(searchOutcome.value) && { outcome: filled(searchOutcome.value) }),
        ...(searchFrom.value && { from: searchFrom.value }),
        ...(searchTo.value && { to: searchTo.value }),
      }),
      store.searchConsentEvents(consentEventFilters(selectedConsentAction.value)),
    ])
  } finally {
    isConsentSearchPending.value = false
  }
}

async function resetSearch(): Promise<void> {
  searchRequestId.value = ''
  searchSupportReference.value = ''
  searchSessionId.value = ''
  searchAction.value = ''
  searchOutcome.value = ''
  searchTaxonomy.value = ''
  searchAdminSubjectId.value = ''
  searchSubjectId.value = ''
  searchClientId.value = ''
  selectedConsentAction.value = 'all'
  hasRequestedConsentEvents.value = true
  isConsentSearchPending.value = true
  searchFrom.value = ''
  searchTo.value = ''
  try {
    await Promise.all([
      store.searchEvents({}),
      store.searchAuthenticationEvents({}),
      store.searchConsentEvents(consentEventFilters('all')),
    ])
  } finally {
    isConsentSearchPending.value = false
  }
}

function consentEventFilters(
  action: 'all' | 'allow' | 'deny' | 'revoke',
): AuthenticationAuditEventFilters {
  return {
    event_type: 'consent_decision',
    ...(action !== 'all' && { consent_action: action }),
    ...(action === 'allow' || action === 'revoke' ? { outcome: 'succeeded' } : {}),
    ...(action === 'deny' ? { outcome: 'failed' } : {}),
    ...(filled(searchRequestId.value) && { request_id: filled(searchRequestId.value) }),
    ...(filled(searchSupportReference.value) && {
      support_reference: filled(searchSupportReference.value),
    }),
    ...(filled(searchSessionId.value) && { session_id: filled(searchSessionId.value) }),
    ...(filled(searchSubjectId.value) && { subject_id: filled(searchSubjectId.value) }),
    ...(filled(searchClientId.value) && { client_id: filled(searchClientId.value) }),
    ...(searchFrom.value && { from: searchFrom.value }),
    ...(searchTo.value && { to: searchTo.value }),
  }
}

async function applyConsentFilter(
  action: 'all' | 'allow' | 'deny' | 'revoke' = 'all',
): Promise<void> {
  selectedConsentAction.value = action
  hasRequestedConsentEvents.value = true
  isConsentSearchPending.value = true
  try {
    await store.searchConsentEvents(consentEventFilters(action))
  } finally {
    isConsentSearchPending.value = false
  }
}

function queryValue(value: unknown): string {
  return Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '')
}

async function applyQueryConsentFilter(): Promise<boolean> {
  if (route.query.consent !== '1') return false
  searchSubjectId.value = queryValue(route.query.subject_id)
  searchAdminSubjectId.value = queryValue(route.query.subject_id)
  searchClientId.value = queryValue(route.query.client_id)
  const action = queryValue(route.query.consent_action)
  await applyConsentFilter(
    action === 'allow' || action === 'deny' || action === 'revoke' ? action : 'all',
  )
  return true
}

onMounted(() => {
  void applyQueryConsentFilter().then((handled) => {
    if (!handled && store.status === 'idle') void store.load()
  })
})
</script>

<template>
  <div class="space-y-6">
    <!-- Search Form -->
    <section class="ui-card space-y-4" aria-labelledby="audit-search-title">
      <div class="flex items-start gap-3">
        <FileSearch class="size-5 mt-1 text-primary" />
        <div>
          <h2 id="audit-search-title" class="text-base font-bold">
            {{ t('audit.search_title') }}
          </h2>
          <p class="text-sm text-muted-foreground leading-relaxed">
            {{ t('audit.search_desc') }}
          </p>
        </div>
      </div>

      <div class="audit-grid audit-grid-3 mt-4 audit-filter-grid">
        <UiFormField id="audit-search-request-id" :label="t('audit.correlation_id')">
          <UiInput
            id="audit-search-request-id"
            name="audit-search-request-id"
            v-model="searchRequestId"
            autocomplete="off"
          />
        </UiFormField>
        <UiFormField id="audit-search-action" :label="t('audit.action')">
          <UiInput
            id="audit-search-action"
            name="audit-search-action"
            v-model="searchAction"
            autocomplete="off"
          />
        </UiFormField>
        <UiFormField id="audit-search-outcome" :label="t('audit.outcome')">
          <UiInput
            id="audit-search-outcome"
            name="audit-search-outcome"
            v-model="searchOutcome"
            autocomplete="off"
          />
        </UiFormField>
      </div>

      <div v-show="showAdvancedFilters" class="audit-grid audit-grid-3 audit-filter-grid">
        <UiFormField id="audit-search-support-reference" :label="t('audit.support_reference')">
          <UiInput
            id="audit-search-support-reference"
            name="audit-search-support-reference"
            v-model="searchSupportReference"
            autocomplete="off"
          />
        </UiFormField>
        <UiFormField id="audit-search-session-id" :label="t('audit.sid')">
          <UiInput
            id="audit-search-session-id"
            name="audit-search-session-id"
            v-model="searchSessionId"
            autocomplete="off"
          />
        </UiFormField>
        <UiFormField id="audit-search-taxonomy" :label="t('audit.taxonomy')">
          <UiInput
            id="audit-search-taxonomy"
            name="audit-search-taxonomy"
            v-model="searchTaxonomy"
            autocomplete="off"
          />
        </UiFormField>
        <UiFormField id="audit-search-admin-subject-id" :label="t('audit.admin_subject')">
          <UiInput
            id="audit-search-admin-subject-id"
            name="audit-search-admin-subject-id"
            v-model="searchAdminSubjectId"
            autocomplete="off"
          />
        </UiFormField>
        <UiFormField id="audit-search-subject-id" :label="t('audit.subject_id')">
          <UiInput
            id="audit-search-subject-id"
            name="audit-search-subject-id"
            v-model="searchSubjectId"
            autocomplete="off"
          />
        </UiFormField>
        <UiFormField id="audit-search-client-id" :label="t('audit.client_id')">
          <UiInput
            id="audit-search-client-id"
            name="audit-search-client-id"
            v-model="searchClientId"
            autocomplete="off"
          />
        </UiFormField>
        <UiFormField id="audit-search-from" :label="t('audit.from')">
          <UiInput
            id="audit-search-from"
            name="audit-search-from"
            v-model="searchFrom"
            type="date"
          />
        </UiFormField>
        <UiFormField id="audit-search-to" :label="t('audit.to')">
          <UiInput id="audit-search-to" name="audit-search-to" v-model="searchTo" type="date" />
        </UiFormField>
      </div>

      <div class="audit-filter-actions pt-2">
        <UiButton
          variant="secondary"
          class="audit-advanced-filter-button"
          :aria-expanded="showAdvancedFilters"
          @click="showAdvancedFilters = !showAdvancedFilters"
        >
          <ChevronDown v-if="showAdvancedFilters" class="size-4" aria-hidden="true" />
          <ChevronRight v-else class="size-4" aria-hidden="true" />
          {{ t('audit.btn_advanced_filters') }}
        </UiButton>
        <UiButton variant="primary" class="audit-search-button" @click="submitSearch">
          {{ t('audit.btn_search') }}
        </UiButton>
        <UiButton variant="secondary" class="audit-reset-button" @click="resetSearch">
          {{ t('audit.btn_reset') }}
        </UiButton>
      </div>
    </section>

    <!-- Consent Event Filter Row -->
    <section class="ui-card space-y-4" aria-labelledby="consent-events-title">
      <div class="flex items-start gap-3">
        <CheckCircle class="size-5 mt-1 text-primary" />
        <div>
          <h2 id="consent-events-title" class="text-base font-bold">
            {{ t('audit.consent_title') }}
          </h2>
          <p class="text-sm text-muted-foreground leading-relaxed">
            {{ t('audit.consent_desc') }}
          </p>
        </div>
      </div>

      <div class="flex flex-wrap gap-2 mt-2">
        <UiButton
          :variant="selectedConsentAction === 'all' ? 'primary' : 'secondary'"
          size="sm"
          class="consent-filter-all-button"
          @click="applyConsentFilter('all')"
        >
          {{ t('audit.btn_all_consent') }}
        </UiButton>
        <UiButton
          :variant="selectedConsentAction === 'allow' ? 'primary' : 'secondary'"
          size="sm"
          class="consent-filter-allow-button"
          @click="applyConsentFilter('allow')"
        >
          Allow
        </UiButton>
        <UiButton
          :variant="selectedConsentAction === 'deny' ? 'primary' : 'secondary'"
          size="sm"
          class="consent-filter-deny-button"
          @click="applyConsentFilter('deny')"
        >
          Deny
        </UiButton>
        <UiButton
          :variant="selectedConsentAction === 'revoke' ? 'primary' : 'secondary'"
          size="sm"
          class="consent-filter-revoke-button"
          @click="applyConsentFilter('revoke')"
        >
          Revoke
        </UiButton>
      </div>

      <div class="audit-table-region">
        <p
          v-if="showConsentEventsPrompt"
          class="audit-consent-idle-prompt text-sm text-muted-foreground"
          data-test="audit-consent-idle-prompt"
        >
          Choose All, Allow, Deny, or Revoke to load consent audit events.
        </p>
        <p
          v-else-if="showConsentEventsEmpty"
          class="audit-table-empty-state audit-table-empty-state--compact text-sm text-muted-foreground"
        >
          No consent events match the selected filter.
        </p>
        <div v-else class="audit-table-wrapper audit-table-wrapper--mobile-priority">
          <div
            v-if="isConsentEventsLoading"
            class="audit-table-skeleton"
            data-test="audit-loading-table-shell"
            role="presentation"
            aria-label="Consent event table loading"
          >
            <div class="audit-table-skeleton__header">
              <span />
              <span />
              <span />
              <span />
            </div>
            <div
              v-for="row in loadingTableRows"
              :key="`consent-${row}`"
              class="audit-table-skeleton__row"
            >
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
          <UiDataList
            v-else
            caption="Consent event table"
            :columns="authenticationEventColumns"
            :rows="consentEventRows"
          >
            <template #actions="{ row }">
              <UiButton
                variant="secondary"
                size="sm"
                :class="
                  row.id === store.selectedAuthenticationEventId
                    ? 'border-primary text-primary'
                    : undefined
                "
                @click="openAuthenticationEventDetail(row.id)"
              >
                {{ t('audit.btn_view_detail') }}
              </UiButton>
            </template>
          </UiDataList>
        </div>
      </div>
      <div class="pt-2">
        <UiButton
          v-if="store.consentEventPagination?.has_more && store.consentEventPagination?.next_cursor"
          variant="primary"
          class="consent-load-more-button"
          @click="store.loadMoreConsentEvents"
        >
          Load more consent events
        </UiButton>
      </div>
    </section>

    <section class="audit-events-section" aria-labelledby="events-title">
      <div class="ui-card space-y-4">
        <h2 id="events-title" class="text-base font-bold">{{ t('audit.events_title') }}</h2>
        <div class="audit-table-region">
          <p
            v-if="showAuditEventsEmpty"
            class="audit-table-empty-state text-sm text-muted-foreground"
          >
            {{ t('audit.no_audit_events') }}
          </p>
          <div v-else class="audit-table-wrapper audit-table-wrapper--mobile-priority">
            <div
              v-if="isAuditEventsLoading"
              class="audit-table-skeleton"
              data-test="audit-loading-table-shell"
              role="presentation"
              aria-label="Admin event table loading"
            >
              <div class="audit-table-skeleton__header">
                <span />
                <span />
                <span />
                <span />
              </div>
              <div
                v-for="row in loadingTableRows"
                :key="`admin-${row}`"
                class="audit-table-skeleton__row"
              >
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
            <UiDataList
              v-else
              caption="Admin event table"
              :columns="auditEventColumns"
              :rows="auditEventRows"
            >
              <template #actions="{ row }">
                <UiButton
                  variant="secondary"
                  size="sm"
                  :class="
                    row.id === store.selectedEventId ? 'border-primary text-primary' : undefined
                  "
                  @click="openAuditEventDetail(row.id)"
                >
                  {{ t('audit.btn_view_detail') }}
                </UiButton>
              </template>
            </UiDataList>
          </div>
        </div>
        <div class="pt-2">
          <UiButton
            v-if="store.eventPagination?.has_more && store.eventPagination?.next_cursor"
            variant="primary"
            class="audit-load-more-button"
            @click="store.loadMoreEvents"
          >
            {{ t('audit.btn_load_more_audit') }}
          </UiButton>
        </div>
      </div>
    </section>
  </div>
</template>
