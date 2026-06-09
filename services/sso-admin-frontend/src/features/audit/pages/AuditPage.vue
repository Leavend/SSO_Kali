<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from '@/composables/useI18n'
import { useDateFormat } from '@/composables/useDateFormat'
import { useRoute } from 'vue-router'
import {
  ClipboardList,
  ShieldCheck,
  Download,
  History,
  UserX,
  FileSearch,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  Settings,
  Key,
} from 'lucide-vue-next'
import EvidenceContextPanel from '@/components/EvidenceContextPanel.vue'
import UiDataList, { type UiDataListRow } from '@/components/ui/UiDataList.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import { useSessionStore } from '@/stores/session.store'
import { useAuditStore } from '../stores/audit.store'
import { formatFriendlyClientName, formatTechnicalPreview } from '@/lib/display-identifiers'
import type {
  AuditExportFilters,
  ComplianceEvidencePackFilters,
  RetentionStatusItem,
} from '../types'

const store = useAuditStore()
const session = useSessionStore()
const route = useRoute()
const { t } = useI18n()
const dateFormat = useDateFormat()

const activeTab = ref<'logs' | 'security' | 'reports' | 'retention' | 'dsr'>('logs')

const canExportAudit = computed(() => session.hasPermission('admin.audit.export'))
const canGenerateEvidencePack = computed(() => session.hasPermission('admin.audit.export'))
const canReviewDsr = computed(() => session.hasPermission('admin.dsr.review'))
const reviewNotes = ref('Evidence verified')

const packFormat = ref<'zip' | 'json'>('zip')
const packFrom = ref('')
const packTo = ref('')
const packCorrelationId = ref('')

const canSubmitEvidencePack = computed(
  () => (packFrom.value !== '' && packTo.value !== '') || packCorrelationId.value.trim() !== '',
)

async function submitEvidencePack(): Promise<void> {
  if (!canSubmitEvidencePack.value) return
  const correlationId = packCorrelationId.value.trim()
  const filters: ComplianceEvidencePackFilters = {
    format: packFormat.value,
    ...(packFrom.value && { from: packFrom.value }),
    ...(packTo.value && { to: packTo.value }),
    ...(correlationId && { correlation_id: correlationId }),
  }
  await store.generateEvidencePack(filters)
}

const exportFormat = ref<'csv' | 'jsonl'>('csv')
const exportFrom = ref('')
const exportTo = ref('')
const exportAction = ref('')
const exportOutcome = ref('')
const searchRequestId = ref('')
const searchSessionId = ref('')
const searchAction = ref('')
const searchOutcome = ref('')
const searchTaxonomy = ref('')
const searchAdminSubjectId = ref('')
const searchSubjectId = ref('')
const searchClientId = ref('')
const searchFrom = ref('')
const searchTo = ref('')
const selectedConsentAction = ref<'all' | 'allow' | 'deny' | 'revoke'>('all')

function filled(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

async function submitSearch(): Promise<void> {
  await Promise.all([
    store.searchEvents({
      ...(filled(searchAction.value) && { action: filled(searchAction.value) }),
      ...(filled(searchOutcome.value) && { outcome: filled(searchOutcome.value) }),
      ...(filled(searchTaxonomy.value) && { taxonomy: filled(searchTaxonomy.value) }),
      ...(filled(searchAdminSubjectId.value) && {
        admin_subject_id: filled(searchAdminSubjectId.value),
      }),
      ...(searchFrom.value && { from: searchFrom.value }),
      ...(searchTo.value && { to: searchTo.value }),
    }),
    store.searchAuthenticationEvents({
      ...(filled(searchRequestId.value) && { request_id: filled(searchRequestId.value) }),
      ...(filled(searchSessionId.value) && { session_id: filled(searchSessionId.value) }),
      ...(filled(searchSubjectId.value) && { subject_id: filled(searchSubjectId.value) }),
      ...(filled(searchClientId.value) && { client_id: filled(searchClientId.value) }),
      ...(filled(searchOutcome.value) && { outcome: filled(searchOutcome.value) }),
      ...(searchFrom.value && { from: searchFrom.value }),
      ...(searchTo.value && { to: searchTo.value }),
    }),
  ])
}

async function resetSearch(): Promise<void> {
  searchRequestId.value = ''
  searchSessionId.value = ''
  searchAction.value = ''
  searchOutcome.value = ''
  searchTaxonomy.value = ''
  searchAdminSubjectId.value = ''
  searchSubjectId.value = ''
  searchClientId.value = ''
  selectedConsentAction.value = 'all'
  searchFrom.value = ''
  searchTo.value = ''
  await Promise.all([store.searchEvents({}), store.searchAuthenticationEvents({})])
}

async function applyConsentFilter(
  action: 'all' | 'allow' | 'deny' | 'revoke' = 'all',
): Promise<void> {
  selectedConsentAction.value = action
  searchAction.value = action === 'revoke' ? 'profile.connected_app.revoke' : ''
  searchTaxonomy.value = action === 'revoke' ? 'profile.connected_app_revoked' : ''
  searchOutcome.value =
    action === 'allow' || action === 'revoke' ? 'succeeded' : action === 'deny' ? 'failed' : ''
  await Promise.all([
    store.searchEvents({
      ...(action === 'revoke' && { action: 'profile.connected_app.revoke' }),
      ...(action === 'revoke' && { taxonomy: 'profile.connected_app_revoked' }),
      ...(filled(searchAdminSubjectId.value) && {
        admin_subject_id: filled(searchAdminSubjectId.value),
      }),
      ...(searchFrom.value && { from: searchFrom.value }),
      ...(searchTo.value && { to: searchTo.value }),
    }),
    store.searchAuthenticationEvents({
      event_type: 'consent_decision',
      ...(action !== 'all' && { consent_action: action }),
      ...(action === 'allow' || action === 'revoke' ? { outcome: 'succeeded' } : {}),
      ...(action === 'deny' ? { outcome: 'failed' } : {}),
      ...(filled(searchSubjectId.value) && { subject_id: filled(searchSubjectId.value) }),
      ...(filled(searchClientId.value) && { client_id: filled(searchClientId.value) }),
      ...(searchFrom.value && { from: searchFrom.value }),
      ...(searchTo.value && { to: searchTo.value }),
    }),
  ])
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
  activeTab.value = 'logs'
  return true
}

async function submitExport(): Promise<void> {
  const action = exportAction.value.trim()
  const outcome = exportOutcome.value.trim()
  const filters: AuditExportFilters = {
    format: exportFormat.value,
    ...(exportFrom.value && { from: exportFrom.value }),
    ...(exportTo.value && { to: exportTo.value }),
    ...(action && { action }),
    ...(outcome && { outcome }),
  }
  await store.exportEvents(filters)
}

const selectedCorrelationId = computed(
  () => store.selectedAuthenticationEvent?.request?.request_id ?? null,
)
const selectedSessionId = computed(() => store.selectedAuthenticationEvent?.session_id ?? null)
const selectedClientId = computed(() => store.selectedAuthenticationEvent?.client_id ?? null)
const selectedSubjectId = computed(
  () =>
    store.selectedAuthenticationEvent?.subject?.subject_id ??
    store.selectedEvent?.actor?.subject_id ??
    null,
)
const hasAuditEvidence = computed(
  () =>
    store.events.length > 0 ||
    store.authenticationEvents.length > 0 ||
    store.dataSubjectRequests.length > 0 ||
    store.integrity !== null ||
    store.retentionStatus !== null,
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
const authenticationEventRows = computed<readonly UiDataListRow[]>(() =>
  store.authenticationEvents.map((event) => ({
    id: event.event_id,
    event_id: formatTechnicalPreview(event.event_id),
    event_type: event.event_type,
    outcome: event.outcome,
    request_id: formatTechnicalPreview(event.request?.request_id),
  })),
)

function retentionWindowLabel(item: RetentionStatusItem): string {
  if (item.window.days !== undefined) return `${item.window.days} hari`
  if (item.window.hours !== undefined) return `${item.window.hours} jam`
  if (item.window.seconds !== undefined) return `${item.window.seconds} detik`
  return 'No window evidence'
}

function retentionNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? 'No evidence' : String(value)
}

onMounted(() => {
  void applyQueryConsentFilter().then((handled) => {
    if (!handled && store.status === 'idle') void store.load()
  })
})
</script>

<template>
  <section class="audit-page" aria-labelledby="audit-title">
    <div class="page-heading">
      <p class="eyebrow">{{ t('audit.eyebrow') }}</p>
      <h1 id="audit-title">{{ t('audit.title') }}</h1>
      <p class="page-summary">{{ t('audit.summary') }}</p>
    </div>

    <UiSkeleton v-if="store.status === 'loading'" :label="t('audit.loading')" />

    <UiStatusView
      v-else-if="store.status === 'forbidden'"
      tone="forbidden"
      eyebrow="Compliance Evidence"
      :title="t('audit.forbidden_title')"
      :description="store.errorMessage ?? t('common.forbidden_desc')"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="store.status === 'unauthenticated'"
      tone="error"
      eyebrow="Session"
      :title="t('common.session_expired_title')"
      :description="store.errorMessage ?? t('common.session_expired_desc')"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="store.status === 'error'"
      tone="api"
      eyebrow="Admin API"
      :title="t('audit.error_title')"
      :description="store.errorMessage ?? t('common.error_loading_desc')"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <UiEmptyState
      v-else-if="!hasAuditEvidence"
      :title="t('audit.empty_title')"
      :description="t('audit.empty_desc')"
    />

    <div v-else class="space-y-6">
      <!-- Horizontal Tab System -->
      <div class="audit-tabs-container">
        <nav class="audit-tabs" aria-label="Audit navigation tabs">
          <button
            class="audit-tab-btn"
            :class="{ 'audit-tab-btn--active': activeTab === 'logs' }"
            type="button"
            @click="activeTab = 'logs'"
          >
            <ClipboardList class="size-4" />
            <span>{{ t('audit.tab_logs') }}</span>
          </button>
          <button
            class="audit-tab-btn"
            :class="{ 'audit-tab-btn--active': activeTab === 'security' }"
            type="button"
            @click="activeTab = 'security'"
          >
            <ShieldCheck class="size-4" />
            <span>{{ t('audit.tab_security') }}</span>
          </button>
          <button
            v-if="canExportAudit || canGenerateEvidencePack"
            class="audit-tab-btn"
            :class="{ 'audit-tab-btn--active': activeTab === 'reports' }"
            type="button"
            @click="activeTab = 'reports'"
          >
            <Download class="size-4" />
            <span>{{ t('audit.tab_reports') }}</span>
          </button>
          <button
            class="audit-tab-btn"
            :class="{ 'audit-tab-btn--active': activeTab === 'retention' }"
            type="button"
            @click="activeTab = 'retention'"
          >
            <History class="size-4" />
            <span>{{ t('audit.tab_retention') }}</span>
          </button>
          <button
            v-if="canReviewDsr"
            class="audit-tab-btn"
            :class="{ 'audit-tab-btn--active': activeTab === 'dsr' }"
            type="button"
            @click="activeTab = 'dsr'"
          >
            <UserX class="size-4" />
            <span>{{ t('audit.tab_dsr') }}</span>
          </button>
        </nav>
      </div>

      <!-- Tab Content Area (using v-show to keep elements accessible in test environments) -->
      <div class="space-y-6">
        <!-- Tab 1: Audit Logs -->
        <div v-show="activeTab === 'logs'" class="space-y-6">
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

            <div class="audit-grid audit-grid-3 mt-4">
              <UiFormField id="audit-search-request-id" :label="t('audit.correlation_id')">
                <UiInput
                  id="audit-search-request-id"
                  name="audit-search-request-id"
                  v-model="searchRequestId"
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
                <UiInput
                  id="audit-search-to"
                  name="audit-search-to"
                  v-model="searchTo"
                  type="date"
                />
              </UiFormField>
            </div>

            <div class="flex gap-2 pt-2">
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
          </section>

          <!-- Master-Detail Audit Events -->
          <section class="audit-master-detail" aria-labelledby="events-title">
            <!-- Table View -->
            <div class="ui-card space-y-4">
              <h2 id="events-title" class="text-base font-bold">{{ t('audit.events_title') }}</h2>
              <div class="audit-table-wrapper">
                <UiDataList
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
                      @click="store.selectEvent(row.id)"
                    >
                      View
                    </UiButton>
                  </template>
                </UiDataList>
              </div>
              <p v-if="store.events.length === 0" class="text-sm text-muted-foreground pt-2">
                {{ t('audit.no_audit_events') }}
              </p>
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

            <!-- Detail Pane -->
            <div class="space-y-4">
              <article v-if="store.selectedEvent" class="ui-card space-y-4">
                <h2 class="text-base font-bold">Event detail</h2>
                <div class="border-b border-border pb-2">
                  <span
                    class="audit-badge"
                    :class="
                      store.selectedEvent.outcome === 'succeeded'
                        ? 'audit-badge--success'
                        : 'audit-badge--danger'
                    "
                  >
                    {{ store.selectedEvent.outcome }}
                  </span>
                </div>
                <dl class="space-y-3">
                  <div class="flex flex-col gap-1">
                    <dt class="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                      Actor
                    </dt>
                    <dd class="text-sm font-semibold break-anywhere">
                      {{
                        store.selectedEvent.actor?.email ??
                        formatTechnicalPreview(store.selectedEvent.actor?.subject_id)
                      }}
                    </dd>
                  </div>
                  <div class="flex flex-col gap-1 border-t border-border pt-2">
                    <dt class="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                      Request
                    </dt>
                    <dd class="text-sm break-anywhere bg-muted p-2 rounded-lg font-mono">
                      <span class="font-bold text-primary mr-1">{{
                        store.selectedEvent.request?.method ?? 'GET'
                      }}</span>
                      {{ store.selectedEvent.request?.path }}
                    </dd>
                  </div>
                  <div class="flex flex-col gap-1 border-t border-border pt-2">
                    <dt class="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                      Reason
                    </dt>
                    <dd class="text-sm break-anywhere">
                      {{ store.selectedEvent.reason ?? 'No reason evidence' }}
                    </dd>
                  </div>
                  <div class="flex flex-col gap-1 border-t border-border pt-2">
                    <dt class="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                      Occurred at
                    </dt>
                    <dd class="text-sm font-mono">
                      {{ dateFormat.smart(store.selectedEvent.occurred_at) }}
                    </dd>
                  </div>
                </dl>
              </article>
              <div
                v-else
                class="ui-card flex flex-col items-center justify-center py-16 text-center text-muted-foreground border-dashed"
              >
                <ClipboardList class="size-8 mb-2 opacity-40 text-primary animate-pulse" />
                <p class="text-sm font-semibold text-muted-foreground">
                  Pilih event untuk melihat detail secara mendalam.
                </p>
              </div>
            </div>
          </section>
        </div>

        <!-- Tab 2: Security Notification -->
        <div v-show="activeTab === 'security'" class="space-y-6">
          <section class="audit-master-detail" aria-labelledby="security-evidence-title">
            <!-- Table View -->
            <div class="ui-card space-y-4">
              <h2 id="security-evidence-title" class="text-base font-bold">
                {{ t('audit.security_evidence_title') }}
              </h2>
              <div class="audit-table-wrapper">
                <UiDataList
                  caption="Authentication event table"
                  :columns="authenticationEventColumns"
                  :rows="authenticationEventRows"
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
                      @click="store.selectAuthenticationEvent(row.id)"
                    >
                      View
                    </UiButton>
                  </template>
                </UiDataList>
              </div>
              <p
                v-if="store.authenticationEvents.length === 0"
                class="text-sm text-muted-foreground pt-2"
              >
                {{ t('audit.no_security_events') }}
              </p>
              <div class="pt-2">
                <UiButton
                  v-if="
                    store.authenticationEventPagination?.has_more &&
                    store.authenticationEventPagination?.next_cursor
                  "
                  variant="primary"
                  class="authentication-load-more-button"
                  @click="store.loadMoreAuthenticationEvents"
                >
                  {{ t('audit.btn_load_more_security') }}
                </UiButton>
              </div>
            </div>

            <!-- Detail Pane -->
            <div class="space-y-4">
              <article v-if="store.selectedAuthenticationEvent" class="ui-card space-y-4">
                <h2 class="text-base font-bold">Security event detail</h2>
                <div class="border-b border-border pb-2">
                  <span
                    class="audit-badge"
                    :class="
                      store.selectedAuthenticationEvent.outcome === 'succeeded'
                        ? 'audit-badge--success'
                        : 'audit-badge--danger'
                    "
                  >
                    {{ store.selectedAuthenticationEvent.outcome }}
                  </span>
                </div>
                <dl class="space-y-3">
                  <div class="flex flex-col gap-1">
                    <dt class="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                      Subject
                    </dt>
                    <dd class="text-sm font-semibold break-anywhere">
                      {{
                        store.selectedAuthenticationEvent.subject?.email ??
                        formatTechnicalPreview(store.selectedAuthenticationEvent.subject?.subject_id)
                      }}
                    </dd>
                  </div>
                  <div class="flex flex-col gap-1 border-t border-border pt-2">
                    <dt class="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                      Client
                    </dt>
                    <dd class="text-sm break-anywhere font-semibold">
                      {{ formatFriendlyClientName(store.selectedAuthenticationEvent.client_id) }}
                    </dd>
                  </div>
                  <div class="flex flex-col gap-1 border-t border-border pt-2">
                    <dt class="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                      Kode sesi
                    </dt>
                    <dd class="text-sm font-mono break-anywhere">
                      {{ formatTechnicalPreview(store.selectedAuthenticationEvent.session_id) }}
                    </dd>
                  </div>
                  <div
                    class="flex flex-col gap-1 border-t border-border pt-2"
                    v-if="store.selectedAuthenticationEvent.error_code"
                  >
                    <dt class="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                      Error code
                    </dt>
                    <dd class="text-sm text-destructive font-semibold">
                      {{ store.selectedAuthenticationEvent.error_code }}
                    </dd>
                  </div>
                </dl>
              </article>
              <div
                v-else
                class="ui-card flex flex-col items-center justify-center py-16 text-center text-muted-foreground border-dashed"
              >
                <ShieldCheck class="size-8 mb-2 opacity-40 text-primary animate-pulse" />
                <p class="text-sm font-semibold text-muted-foreground">
                  Pilih event untuk melihat detail secara mendalam.
                </p>
              </div>
            </div>
          </section>

          <!-- Security Policy Cards Grid -->
          <div class="audit-grid audit-grid-2">
            <!-- Suspicious Login Challenge Card -->
            <section class="ui-card audit-card-premium space-y-3" aria-labelledby="challenge-title">
              <div class="flex items-center gap-2">
                <AlertTriangle class="size-5 text-amber-500" />
                <h3 id="challenge-title" class="text-base font-bold">
                  {{ t('audit.challenge_title') }}
                </h3>
              </div>
              <p class="text-sm text-muted-foreground leading-relaxed">
                {{ t('audit.risk_challenge_desc') }}
              </p>
            </section>

            <!-- ACR Permissive Policy Card -->
            <section class="ui-card audit-card-premium space-y-3" aria-labelledby="acr-title">
              <div class="flex items-center gap-2">
                <Key class="size-5 text-indigo-500" />
                <h3 id="acr-title" class="text-base font-bold">{{ t('audit.acr_title') }}</h3>
              </div>
              <p class="text-sm text-muted-foreground leading-relaxed">
                {{ t('audit.acr_policy_desc') }}
              </p>
            </section>
          </div>

          <!-- Observable evidence title -->
          <div class="pt-4 border-t border-border">
            <h3 class="text-base font-bold mb-4 flex items-center gap-2 text-primary">
              <Settings class="size-5" />
              {{ t('audit.portal_evidence_title') }}
            </h3>
            <div class="audit-grid audit-grid-3">
              <!-- Consent revocation viewer -->
              <div class="ui-card audit-card-premium space-y-2">
                <h4 class="text-sm font-bold text-foreground">
                  {{ t('audit.consent_revocation_title') }}
                </h4>
                <p class="text-xs text-muted-foreground leading-relaxed">
                  {{ t('audit.consent_revocation_desc') }}
                </p>
              </div>
              <!-- Legacy session sunset -->
              <div class="ui-card audit-card-premium space-y-2">
                <h4 class="text-sm font-bold text-foreground">
                  {{ t('audit.legacy_fallback_title') }}
                </h4>
                <p class="text-xs text-muted-foreground leading-relaxed">
                  {{ t('audit.legacy_fallback_desc') }}
                </p>
              </div>
              <!-- Token lifetime production guard -->
              <div class="ui-card audit-card-premium space-y-2">
                <h4 class="text-sm font-bold text-foreground">
                  {{ t('audit.token_lifetime_title') }}
                </h4>
                <p class="text-xs text-muted-foreground leading-relaxed">
                  {{ t('audit.token_lifetime_desc') }}
                </p>
              </div>
              <!-- Session / logout evidence console -->
              <div class="ui-card audit-card-premium space-y-2">
                <h4 class="text-sm font-bold text-foreground">
                  {{ t('audit.session_logout_title') }}
                </h4>
                <p class="text-xs text-muted-foreground leading-relaxed">
                  {{ t('audit.session_logout_desc') }}
                </p>
              </div>
              <!-- Safe error regression review -->
              <div class="ui-card audit-card-premium space-y-2">
                <h4 class="text-sm font-bold text-foreground">{{ t('audit.safe_error_title') }}</h4>
                <p class="text-xs text-muted-foreground leading-relaxed">
                  {{ t('audit.safe_error_desc') }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Tab 3: Export & Evidence Pack -->
        <div v-show="activeTab === 'reports'" class="audit-grid audit-grid-2">
          <!-- Export Section -->
          <section v-if="canExportAudit" class="ui-card space-y-4" aria-labelledby="export-title">
            <div class="flex items-center gap-2">
              <Download class="size-5 text-primary" />
              <h2 id="export-title" class="text-lg font-bold">{{ t('audit.export_title') }}</h2>
            </div>
            <p class="text-sm text-muted-foreground leading-relaxed">
              {{ t('audit.export_desc') }}
            </p>

            <fieldset class="border border-border rounded-xl p-4 bg-muted space-y-2">
              <legend class="px-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                {{ t('audit.format') }}
              </legend>
              <div class="flex gap-4">
                <label class="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                  <input
                    v-model="exportFormat"
                    type="radio"
                    name="export-format"
                    value="csv"
                    class="accent-primary"
                  />
                  <span>CSV</span>
                </label>
                <label class="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                  <input
                    v-model="exportFormat"
                    type="radio"
                    name="export-format"
                    value="jsonl"
                    class="accent-primary"
                  />
                  <span>JSONL</span>
                </label>
              </div>
            </fieldset>

            <div class="audit-grid audit-grid-2">
              <UiFormField id="export-from" :label="t('audit.from')">
                <UiInput id="export-from" name="export-from" v-model="exportFrom" type="date" />
              </UiFormField>
              <UiFormField id="export-to" :label="t('audit.to')">
                <UiInput id="export-to" name="export-to" v-model="exportTo" type="date" />
              </UiFormField>
              <UiFormField id="export-action" :label="t('audit.action')">
                <UiInput
                  id="export-action"
                  name="export-action"
                  v-model="exportAction"
                  autocomplete="off"
                />
              </UiFormField>
              <UiFormField id="export-outcome" :label="t('audit.outcome')">
                <UiInput
                  id="export-outcome"
                  name="export-outcome"
                  v-model="exportOutcome"
                  autocomplete="off"
                />
              </UiFormField>
            </div>

            <div class="pt-2">
              <UiButton
                variant="primary"
                class="audit-export-button"
                :disabled="store.actionStatus === 'loading'"
                @click="submitExport"
              >
                {{ store.actionStatus === 'loading' ? 'Exporting...' : t('audit.btn_export') }}
              </UiButton>
            </div>
            <p
              v-if="store.actionStatus === 'step_up_required'"
              class="text-sm font-bold text-destructive"
              role="alert"
            >
              {{ store.errorMessage }}
            </p>
          </section>

          <!-- Evidence Pack Section -->
          <section
            v-if="canGenerateEvidencePack"
            class="ui-card space-y-4"
            aria-labelledby="evidence-pack-title"
          >
            <div class="flex items-center gap-2">
              <ShieldCheck class="size-5 text-primary" />
              <h2 id="evidence-pack-title" class="text-lg font-bold">
                {{ t('audit.evidence_pack_title') }}
              </h2>
            </div>
            <p class="text-sm text-muted-foreground leading-relaxed">
              {{ t('audit.evidence_pack_desc') }}
            </p>

            <fieldset class="border border-border rounded-xl p-4 bg-muted space-y-2">
              <legend class="px-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                {{ t('audit.pack_format') }}
              </legend>
              <div class="flex gap-4">
                <label class="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                  <input
                    v-model="packFormat"
                    type="radio"
                    name="evidence-pack-format"
                    value="zip"
                    class="accent-primary"
                  />
                  <span>ZIP</span>
                </label>
                <label class="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                  <input
                    v-model="packFormat"
                    type="radio"
                    name="evidence-pack-format"
                    value="json"
                    class="accent-primary"
                  />
                  <span>JSON</span>
                </label>
              </div>
            </fieldset>

            <div class="audit-grid audit-grid-2">
              <UiFormField id="evidence-pack-from" :label="t('audit.from')">
                <UiInput
                  id="evidence-pack-from"
                  name="evidence-pack-from"
                  v-model="packFrom"
                  type="date"
                />
              </UiFormField>
              <UiFormField id="evidence-pack-to" :label="t('audit.to')">
                <UiInput
                  id="evidence-pack-to"
                  name="evidence-pack-to"
                  v-model="packTo"
                  type="date"
                />
              </UiFormField>
              <UiFormField
                id="evidence-pack-correlation-id"
                :label="t('audit.correlation_id_label')"
                class="col-span-full"
              >
                <UiInput
                  id="evidence-pack-correlation-id"
                  name="evidence-pack-correlation-id"
                  v-model="packCorrelationId"
                  autocomplete="off"
                />
              </UiFormField>
            </div>

            <p
              v-if="!canSubmitEvidencePack"
              class="text-xs text-muted-foreground leading-relaxed italic bg-muted p-2 rounded-lg"
            >
              {{ t('audit.evidence_pack_hint') }}
            </p>

            <div class="pt-2">
              <UiButton
                variant="primary"
                class="compliance-evidence-pack-button"
                :disabled="store.actionStatus === 'loading' || !canSubmitEvidencePack"
                @click="submitEvidencePack"
              >
                {{
                  store.actionStatus === 'loading' ? 'Generating...' : t('audit.btn_generate_pack')
                }}
              </UiButton>
            </div>
            <p
              v-if="store.actionStatus === 'step_up_required'"
              class="text-sm font-bold text-destructive"
              role="alert"
            >
              {{ store.errorMessage }}
            </p>
          </section>
        </div>

        <!-- Tab 4: Retention & Integrity -->
        <div v-show="activeTab === 'retention'" class="space-y-6">
          <!-- Integrity Card -->
          <section class="ui-card space-y-4" aria-labelledby="integrity-title">
            <div
              class="flex items-center justify-between flex-wrap gap-4 border-b border-border pb-4"
            >
              <div class="flex items-center gap-3">
                <ShieldCheck class="size-6 text-emerald-500" v-if="store.integrity?.verified" />
                <AlertCircle class="size-6 text-amber-500" v-else />
                <div>
                  <h2 id="integrity-title" class="text-lg font-bold">
                    {{ t('audit.integrity_title') }}
                  </h2>
                  <p class="text-sm text-muted-foreground">
                    Verification status of audit trail security log chains.
                  </p>
                </div>
              </div>
              <span
                class="audit-badge"
                :class="store.integrity?.verified ? 'audit-badge--success' : 'audit-badge--danger'"
              >
                {{ store.integrity?.verified ? 'Integrity verified' : 'Integrity needs review' }}
              </span>
            </div>

            <dl class="audit-grid audit-grid-2">
              <div class="bg-muted p-4 rounded-xl border border-border flex flex-col gap-1">
                <dt class="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  {{ t('audit.checked_events') }}
                </dt>
                <dd class="text-2xl font-black text-foreground">
                  {{ store.integrity?.checked_events ?? 'No evidence' }}
                </dd>
              </div>
              <div class="bg-muted p-4 rounded-xl border border-border flex flex-col gap-1">
                <dt class="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  {{ t('audit.latest_hash') }}
                </dt>
                <dd class="text-sm font-mono text-foreground break-anywhere leading-relaxed pt-1">
                  {{ store.integrity?.latest_event_hash ?? 'No evidence' }}
                </dd>
              </div>
            </dl>
          </section>

          <!-- Retention Status -->
          <section class="ui-card space-y-4" aria-labelledby="retention-title">
            <div class="flex items-center gap-3">
              <History class="size-5 text-primary" />
              <div>
                <h2 id="retention-title" class="text-lg font-bold">
                  {{ t('audit.retention_title') }}
                </h2>
                <p class="text-sm text-muted-foreground">{{ t('audit.retention_desc') }}</p>
              </div>
            </div>

            <div class="audit-grid audit-grid-3 pt-2">
              <div
                v-for="item in store.retentionStatus?.items ?? []"
                :key="item.category"
                class="bg-muted p-4 rounded-xl border border-border space-y-3 audit-card-premium"
              >
                <div class="border-b border-border pb-2">
                  <strong class="text-sm font-bold text-foreground">{{ item.label }}</strong>
                </div>
                <dl class="space-y-2 text-xs font-semibold">
                  <div class="flex justify-between items-center border-b border-border/50 pb-1">
                    <dt class="text-muted-foreground">{{ t('audit.window') }}</dt>
                    <dd class="text-foreground text-right">{{ retentionWindowLabel(item) }}</dd>
                  </div>
                  <div class="flex justify-between items-center border-b border-border/50 pb-1">
                    <dt class="text-muted-foreground">{{ t('audit.schedule') }}</dt>
                    <dd class="text-foreground text-right">{{ item.schedule ?? 'No schedule' }}</dd>
                  </div>
                  <div class="flex justify-between items-center border-b border-border/50 pb-1">
                    <dt class="text-muted-foreground">{{ t('audit.last_pruned') }}</dt>
                    <dd class="text-foreground text-right">
                      {{ item.last_pruned_at ?? 'Belum ada run' }}
                    </dd>
                  </div>
                  <div class="flex justify-between items-center border-b border-border/50 pb-1">
                    <dt class="text-muted-foreground">{{ t('audit.pruned_rows') }}</dt>
                    <dd
                      class="text-foreground font-mono bg-secondary px-2 py-0.5 rounded text-right"
                    >
                      {{ retentionNumber(item.last_pruned_count) }}
                    </dd>
                  </div>
                  <div class="flex justify-between items-center">
                    <dt class="text-muted-foreground">{{ t('audit.candidate_rows') }}</dt>
                    <dd
                      class="text-foreground font-mono bg-secondary px-2 py-0.5 rounded text-right"
                    >
                      {{ retentionNumber(item.candidate_count) }}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            <p
              v-if="(store.retentionStatus?.items.length ?? 0) === 0"
              class="text-sm text-muted-foreground pt-2 italic"
            >
              {{ t('audit.no_retention') }}
            </p>
          </section>
        </div>

        <!-- Tab 5: DSR Queue -->
        <div v-show="activeTab === 'dsr'" class="space-y-6">
          <section class="ui-card space-y-6" aria-labelledby="dsr-title">
            <div class="flex items-center gap-3">
              <UserX class="size-5 text-primary" />
              <div>
                <h2 id="dsr-title" class="text-lg font-bold">{{ t('audit.dsr_title') }}</h2>
                <p class="text-sm text-muted-foreground">
                  Manage and audit Data Subject Requests (DSR) under compliance laws.
                </p>
              </div>
            </div>

            <!-- Notes Field -->
            <div class="max-w-md" v-if="canReviewDsr">
              <UiFormField id="dsr-review-notes" :label="t('audit.review_notes')">
                <UiInput
                  id="dsr-review-notes"
                  name="dsr-review-notes"
                  v-model="reviewNotes"
                  autocomplete="off"
                />
              </UiFormField>
            </div>

            <!-- Requests List -->
            <div class="audit-grid audit-grid-2 pt-2">
              <div
                v-for="request in store.dataSubjectRequests"
                :key="request.request_id"
                class="bg-muted p-5 rounded-xl border border-border space-y-4 audit-card-premium"
              >
                <div
                  class="flex justify-between items-center flex-wrap gap-2 border-b border-border pb-2"
                >
                  <strong class="text-sm font-bold text-foreground break-anywhere">{{
                    formatTechnicalPreview(request.request_id)
                  }}</strong>
                  <span class="audit-badge audit-badge--info">
                    {{ request.type }}
                  </span>
                </div>
                <div class="space-y-2 text-xs font-semibold">
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">Status:</span>
                    <span class="text-foreground capitalize">{{ request.status }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">Kode akun:</span>
                    <span class="text-foreground font-mono break-anywhere">{{
                      formatTechnicalPreview(request.subject_id)
                    }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">{{ t('audit.sla_due') }}:</span>
                    <span class="text-foreground font-mono">{{
                      request.sla_due_at ?? 'No SLA evidence'
                    }}</span>
                  </div>
                </div>

                <div
                  v-if="canReviewDsr"
                  class="flex flex-wrap gap-2 pt-2 border-t border-border/50"
                >
                  <UiButton
                    variant="primary"
                    size="sm"
                    @click="store.reviewRequest(request.request_id, 'approved', reviewNotes)"
                  >
                    {{ t('audit.approve') }}
                  </UiButton>
                  <UiButton
                    variant="danger"
                    size="sm"
                    @click="store.reviewRequest(request.request_id, 'rejected', reviewNotes)"
                  >
                    {{ t('audit.reject') }}
                  </UiButton>
                  <UiButton
                    variant="secondary"
                    size="sm"
                    @click="store.fulfillRequest(request.request_id, true)"
                  >
                    {{ t('audit.dry_run_fulfill') }}
                  </UiButton>
                </div>
              </div>
            </div>

            <p
              v-if="store.dataSubjectRequests.length === 0"
              class="text-sm text-muted-foreground italic"
            >
              {{ t('audit.no_dsr') }}
            </p>
          </section>
        </div>
      </div>

      <p
        v-if="store.errorMessage"
        class="text-sm font-bold text-destructive bg-destructive/10 p-3 rounded-lg mt-6"
        role="alert"
      >
        {{ store.errorMessage }}
      </p>
    </div>

    <!-- Evidence contextual panel -->
    <EvidenceContextPanel
      title="Audit evidence context"
      :request-id="store.requestId"
      :correlation-id="selectedCorrelationId"
      :session-id="selectedSessionId"
      :client-id="selectedClientId"
      :subject-id="selectedSubjectId"
    />
  </section>
</template>
