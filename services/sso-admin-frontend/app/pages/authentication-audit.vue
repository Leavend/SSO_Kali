<!-- app/pages/authentication-audit.vue -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { useAuthAuditEvents } from '@/composables/useAuthAuditEvents'
import { resolveOutcomeTone } from '@/lib/auth-audit/auth-audit-view-state'
import AuthAuditTable from '@/components/auth-audit/AuthAuditTable.vue'
import AuthAuditFilterBar, {
  type AuthAuditFilterLabels,
} from '@/components/auth-audit/AuthAuditFilterBar.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import UiDetailDrawer from '@/components/ui/UiDetailDrawer.vue'
import type { AuthAuditEvent, AuthAuditFilters } from '@/types/auth-audit.types'

definePageMeta({
  name: 'admin.authentication-audit',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.authentication-audit.read'],
})

const { t } = useI18n()
const store = useSessionStore()
const route = useRoute()

await useAsyncData('admin-authentication-audit-principal', () => store.ensureSession())

// A client_id deep-link (the clients-detail consent-trail link → this page) seeds
// the SSR first page pre-filtered to that client. The filter bar has no client_id
// field; Reset/Filter then take over with the bar's draft.
const clientIdQuery = typeof route.query.clientId === 'string' ? route.query.clientId : undefined

const { events, viewState, requestId, isStale, hasMore, search, loadMore, refresh } =
  useAuthAuditEvents(clientIdQuery ? { client_id: clientIdQuery } : {})

const eventList = computed<readonly AuthAuditEvent[]>(() => events.value ?? [])

const selectedId = ref<string | null>(null)
const selectedEvent = computed<AuthAuditEvent | null>(
  () => eventList.value.find((e) => e.event_id === selectedId.value) ?? null,
)

const outcomeText = (outcome: string): string => t(`auth_audit.outcome_${outcome}`)

const filterLabels = computed<AuthAuditFilterLabels>(() => ({
  title: t('auth_audit.filter_title'),
  outcome: t('auth_audit.filter_outcome'),
  outcomeAll: t('auth_audit.outcome_all'),
  outcomeSucceeded: t('auth_audit.outcome_succeeded'),
  outcomeFailed: t('auth_audit.outcome_failed'),
  outcomeStarted: t('auth_audit.outcome_started'),
  eventType: t('auth_audit.filter_event_type'),
  subjectId: t('auth_audit.filter_subject_id'),
  from: t('auth_audit.filter_from'),
  to: t('auth_audit.filter_to'),
  filter: t('auth_audit.btn_filter'),
  reset: t('auth_audit.btn_reset'),
}))

const contextEntries = computed<readonly [string, string][]>(() => {
  const ctx = selectedEvent.value?.context
  if (!ctx) return []
  return Object.entries(ctx).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])
})

function onSelect(eventId: string): void {
  selectedId.value = eventId
}
function onCloseDrawer(): void {
  selectedId.value = null
}
async function onSearch(filters: AuthAuditFilters): Promise<void> {
  selectedId.value = null
  await search(filters)
}
async function onReset(): Promise<void> {
  selectedId.value = null
  await search({})
}
async function onLoadMore(): Promise<void> {
  await loadMore()
}
async function onRefresh(): Promise<void> {
  await refresh()
}
</script>

<template>
  <section class="auth-audit" data-page="authentication-audit" data-admin-shell>
    <header class="auth-audit__hero">
      <span class="auth-audit__eyebrow">{{ t('auth_audit.eyebrow') }}</span>
      <h1 class="auth-audit__title">{{ t('auth_audit.title') }}</h1>
      <p class="auth-audit__summary">{{ t('auth_audit.summary') }}</p>
      <p class="auth-audit__principal" data-principal-name>
        {{ t('auth_audit.signed_in_as', { name: store.principal?.display_name ?? '—' }) }}
      </p>
    </header>

    <AuthAuditFilterBar :labels="filterLabels" @search="onSearch" @reset="onReset" />

    <UiSkeleton v-if="viewState === 'loading'" :rows="6" :label="t('auth_audit.loading')" />

    <UiStatusView
      v-else-if="viewState === 'forbidden'"
      tone="forbidden"
      :eyebrow="t('auth_audit.eyebrow')"
      :title="t('auth_audit.forbidden_title')"
      :description="t('common.forbidden_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'unauthenticated'"
      tone="step_up"
      :eyebrow="t('auth_audit.eyebrow')"
      :title="t('auth_audit.session_expired_title')"
      :description="t('auth_audit.session_expired_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'error'"
      tone="error"
      :eyebrow="t('auth_audit.eyebrow')"
      :title="t('auth_audit.error_loading_title')"
      :description="t('auth_audit.error_loading_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    >
      <template #actions>
        <UiButton variant="secondary" size="sm" data-testid="auth-audit-refresh" @click="onRefresh">
          {{ t('common.btn_refresh') }}
        </UiButton>
      </template>
    </UiStatusView>

    <UiEmptyState
      v-else-if="viewState === 'empty'"
      :title="t('auth_audit.empty_title')"
      :description="t('auth_audit.empty_description')"
    />

    <template v-else>
      <div v-if="isStale" class="auth-audit__banner" role="status">
        {{ t('auth_audit.error_loading_desc') }}
      </div>

      <AuthAuditTable
        :events="eventList"
        :caption="t('auth_audit.table_caption')"
        :occurred-label="t('auth_audit.col_occurred_at')"
        :type-label="t('auth_audit.col_type')"
        :outcome-label="t('auth_audit.col_outcome')"
        :subject-label="t('auth_audit.col_subject')"
        :ip-label="t('auth_audit.col_ip_address')"
        :outcome-text="outcomeText"
        @select="onSelect"
      />

      <div v-if="hasMore" class="auth-audit__more">
        <UiButton variant="secondary" size="sm" data-testid="auth-audit-load-more" @click="onLoadMore">
          {{ t('auth_audit.btn_load_more') }}
        </UiButton>
      </div>

      <UiDetailDrawer
        v-if="selectedEvent"
        :open="selectedEvent !== null"
        title-id="auth-audit-detail-drawer"
        :title="selectedEvent.event_type"
        :description="selectedEvent.event_id"
        :close-label="t('common.close')"
        @close="onCloseDrawer"
      >
        <div class="auth-audit-detail" data-testid="auth-audit-detail">
          <div class="auth-audit-detail__head">
            <UiStatusBadge
              :tone="resolveOutcomeTone(selectedEvent.outcome)"
              :label="outcomeText(selectedEvent.outcome)"
            />
          </div>
          <dl class="auth-audit-detail__grid">
            <div>
              <dt>{{ t('auth_audit.ov_email') }}</dt>
              <dd>{{ selectedEvent.subject.email ?? '—' }}</dd>
            </div>
            <div>
              <dt>{{ t('auth_audit.ov_subject_id') }}</dt>
              <dd><UiFolio :value="selectedEvent.subject.subject_id ?? '—'" variant="id" /></dd>
            </div>
            <div>
              <dt>{{ t('auth_audit.ov_client_id') }}</dt>
              <dd>{{ selectedEvent.client_id ?? '—' }}</dd>
            </div>
            <div>
              <dt>{{ t('auth_audit.ov_session_id') }}</dt>
              <dd><UiFolio :value="selectedEvent.session_id ?? '—'" variant="id" /></dd>
            </div>
            <div>
              <dt>{{ t('auth_audit.ov_ip_address') }}</dt>
              <dd>{{ selectedEvent.request.ip_address ?? '—' }}</dd>
            </div>
            <div>
              <dt>{{ t('auth_audit.ov_request_id') }}</dt>
              <dd><UiFolio :value="selectedEvent.request.request_id ?? '—'" variant="id" /></dd>
            </div>
            <div class="auth-audit-detail__wide">
              <dt>{{ t('auth_audit.ov_user_agent') }}</dt>
              <dd>{{ selectedEvent.request.user_agent ?? '—' }}</dd>
            </div>
            <div>
              <dt>{{ t('auth_audit.ov_error_code') }}</dt>
              <dd>{{ selectedEvent.error_code ?? '—' }}</dd>
            </div>
            <div>
              <dt>{{ t('auth_audit.ov_occurred_at') }}</dt>
              <dd>
                <UiFolio
                  v-if="selectedEvent.occurred_at"
                  :value="selectedEvent.occurred_at"
                  variant="timestamp"
                />
                <span v-else>—</span>
              </dd>
            </div>
            <div class="auth-audit-detail__wide">
              <dt>{{ t('auth_audit.ov_context') }}</dt>
              <dd>
                <dl v-if="contextEntries.length" class="auth-audit-detail__context">
                  <div v-for="[key, value] in contextEntries" :key="key">
                    <dt>{{ key }}</dt>
                    <dd>{{ value }}</dd>
                  </div>
                </dl>
                <span v-else>{{ t('auth_audit.ov_context_empty') }}</span>
              </dd>
            </div>
          </dl>
        </div>
      </UiDetailDrawer>
    </template>
  </section>
</template>

<style scoped>
.auth-audit {
  display: grid;
  gap: 24px;
  padding: 24px;
}
.auth-audit__hero {
  display: grid;
  gap: 6px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.auth-audit__eyebrow {
  font: 600 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.auth-audit__title {
  margin: 0;
  font: 600 1.5rem/1.2 var(--font-sans);
  letter-spacing: -0.02em;
  color: var(--fg);
}
.auth-audit__summary,
.auth-audit__principal {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.auth-audit__banner {
  padding: 10px 14px;
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--warning-soft-fg);
  background: var(--warning-soft);
  border: 1px solid var(--warning-soft-fg);
}
.auth-audit__more {
  display: flex;
  justify-content: center;
}
.auth-audit-detail {
  display: grid;
  gap: 16px;
}
.auth-audit-detail__head {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.auth-audit-detail__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
  margin: 0;
}
.auth-audit-detail__wide {
  grid-column: 1 / -1;
}
.auth-audit-detail__grid > div > dt {
  font: 600 0.625rem/1.2 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.auth-audit-detail__grid > div > dd {
  margin: 2px 0 0;
  font: 400 0.8125rem/1.4 var(--font-sans);
  color: var(--fg);
  overflow-wrap: anywhere;
}
.auth-audit-detail__context {
  margin: 0;
  display: grid;
  gap: 6px;
}
.auth-audit-detail__context > div {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
  gap: 8px;
}
.auth-audit-detail__context dt {
  font: 600 0.6875rem/1.3 var(--font-mono, monospace);
  color: var(--fg-2);
}
.auth-audit-detail__context dd {
  margin: 0;
  font: 400 0.75rem/1.4 var(--font-mono, monospace);
  color: var(--fg);
  overflow-wrap: anywhere;
}
</style>
