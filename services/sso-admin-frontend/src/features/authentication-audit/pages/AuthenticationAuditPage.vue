<script setup lang="ts">
/**
 * AuthenticationAuditPage — FR-044 / UC-41–UC-42.
 * Dedicated page for authentication events audit.
 * Distinct from Audit Trail (admin.audit.read).
 * Permission: admin.authentication-audit.read
 */

import { computed, onMounted, ref } from 'vue'
import EvidenceContextPanel from '@/components/EvidenceContextPanel.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import { useAuthAuditStore } from '../stores/auth-audit.store'
import type { AuthAuditFilters } from '../types'
import { useI18n } from '@/composables/useI18n'
import { useDateFormat } from '@/composables/useDateFormat'
import { formatFriendlyClientName, formatTechnicalPreview } from '@/lib/display-identifiers'
import {
  Search,
  ChevronLeft,
  ChevronDown,
  Copy,
  Check,
  Shield,
  ShieldCheck,
  ShieldAlert,
  LogIn,
  LogOut,
  Key,
  FileCheck,
  FileText,
  Code,
} from 'lucide-vue-next'

const store = useAuthAuditStore()
const { t } = useI18n()
const dateFormat = useDateFormat()

const searchSubjectId = ref('')
const searchClientId = ref('')
const searchSessionId = ref('')
const searchRequestId = ref('')
const searchEventType = ref('')
const searchOutcome = ref('')
const searchErrorCode = ref('')
const searchSupportReference = ref('')
const searchConsentAction = ref('')
const searchFrom = ref('')
const searchTo = ref('')

const filtersExpanded = ref(false)
const contextExpanded = ref(false)
const copied = ref(false)

function toggleFilters(): void {
  filtersExpanded.value = !filtersExpanded.value
}

function toggleContext(): void {
  contextExpanded.value = !contextExpanded.value
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch {
    // Fail-safe fallback if clipboard API is not available
  }
}

function getOutcomeClass(outcome: string | null | undefined): string {
  if (!outcome) return 'outcome--unknown'
  const lower = outcome.toLowerCase()
  if (lower === 'succeeded' || lower === 'success') return 'outcome--success'
  if (lower === 'failed' || lower === 'error' || lower === 'denied') return 'outcome--danger'
  return 'outcome--warning'
}

function getEventIcon(eventType: string, outcome: string | null | undefined) {
  const isSuccess = outcome
    ? outcome.toLowerCase() === 'succeeded' || outcome.toLowerCase() === 'success'
    : false
  const type = eventType.toLowerCase()

  if (type.includes('login')) return isSuccess ? LogIn : ShieldAlert
  if (type.includes('logout')) return LogOut
  if (type.includes('mfa')) return Key
  if (type.includes('consent')) return FileCheck
  return isSuccess ? ShieldCheck : ShieldAlert
}

function filled(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

const hasEvents = computed<boolean>(() => store.events.length > 0)

async function submitSearch(): Promise<void> {
  const newFilters: AuthAuditFilters = {
    ...(filled(searchSubjectId.value) && { subject_id: filled(searchSubjectId.value) }),
    ...(filled(searchClientId.value) && { client_id: filled(searchClientId.value) }),
    ...(filled(searchSessionId.value) && { session_id: filled(searchSessionId.value) }),
    ...(filled(searchRequestId.value) && { request_id: filled(searchRequestId.value) }),
    ...(filled(searchEventType.value) && { event_type: filled(searchEventType.value) }),
    ...(filled(searchOutcome.value) && { outcome: filled(searchOutcome.value) }),
    ...(filled(searchErrorCode.value) && { error_code: filled(searchErrorCode.value) }),
    ...(filled(searchSupportReference.value) && {
      support_reference: filled(searchSupportReference.value),
    }),
    ...(filled(searchConsentAction.value) && { consent_action: filled(searchConsentAction.value) }),
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
  searchErrorCode.value = ''
  searchSupportReference.value = ''
  searchConsentAction.value = ''
  searchFrom.value = ''
  searchTo.value = ''
  await store.search({})
}

onMounted(() => {
  if (store.status === 'idle') void store.load()
})
</script>

<template>
  <section
    class="authentication-audit-page max-w-page mx-auto px-4 md:px-6 py-8"
    aria-labelledby="auth-audit-title"
  >
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

    <div
      v-else
      class="auth-audit-layout"
      :class="{ 'auth-audit-layout--has-selection': store.selectedEventId !== null }"
    >
      <!-- Left Sidebar: Filters and Scrollable Event Cards -->
      <aside class="auth-audit-sidebar">
        <!-- Collapsible Filters Section -->
        <section
          class="auth-audit-card auth-audit-filters-section"
          aria-labelledby="auth-audit-search-title"
        >
          <button
            class="filters-toggle-btn"
            type="button"
            :aria-expanded="filtersExpanded"
            @click="toggleFilters"
          >
            <span class="flex items-center gap-2">
              <Search :size="16" class="text-primary" />
              <h2 id="auth-audit-search-title" class="filters-title">
                {{ t('auth_audit.filter_title') }}
              </h2>
            </span>
            <span class="chevron-icon" :class="{ 'chevron-icon--rotated': filtersExpanded }">
              <ChevronDown :size="16" />
            </span>
          </button>

          <div class="filters-primary mt-4">
            <UiFormField id="auth-audit-request-id" :label="t('auth_audit.request_id')">
              <UiInput
                id="auth-audit-request-id"
                v-model="searchRequestId"
                name="auth-audit-request-id"
                autocomplete="off"
              />
            </UiFormField>
          </div>

          <div v-show="filtersExpanded" class="filters-content mt-4">
            <div class="filters-grid">
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
              <UiFormField id="auth-audit-event-type" :label="t('auth_audit.event_type')">
                <UiInput
                  id="auth-audit-event-type"
                  v-model="searchEventType"
                  name="auth-audit-event-type"
                  autocomplete="off"
                />
              </UiFormField>
              <UiFormField id="auth-audit-outcome" :label="t('auth_audit.outcome')">
                <UiSelect
                  id="auth-audit-outcome"
                  v-model="searchOutcome"
                  :options="[
                    { value: '', label: 'Semua Hasil / All' },
                    { value: 'succeeded', label: 'Success' },
                    { value: 'failed', label: 'Failed' },
                  ]"
                />
              </UiFormField>
              <UiFormField id="auth-audit-error-code" :label="t('auth_audit.error_code')">
                <UiInput
                  id="auth-audit-error-code"
                  v-model="searchErrorCode"
                  name="auth-audit-error-code"
                  autocomplete="off"
                />
              </UiFormField>
              <UiFormField
                id="auth-audit-support-reference"
                :label="t('auth_audit.support_reference')"
              >
                <UiInput
                  id="auth-audit-support-reference"
                  v-model="searchSupportReference"
                  name="auth-audit-support-reference"
                  autocomplete="off"
                />
              </UiFormField>
              <UiFormField id="auth-audit-consent-action" :label="t('auth_audit.consent_action')">
                <UiSelect
                  id="auth-audit-consent-action"
                  v-model="searchConsentAction"
                  :options="[
                    { value: '', label: t('auth_audit.consent_action_all') },
                    { value: 'allow', label: t('auth_audit.consent_action_allow') },
                    { value: 'deny', label: t('auth_audit.consent_action_deny') },
                    { value: 'revoke', label: t('auth_audit.consent_action_revoke') },
                  ]"
                />
              </UiFormField>
              <UiFormField id="auth-audit-from" :label="t('auth_audit.from')">
                <UiInput
                  id="auth-audit-from"
                  v-model="searchFrom"
                  name="auth-audit-from"
                  type="date"
                />
              </UiFormField>
              <UiFormField id="auth-audit-to" :label="t('auth_audit.to')">
                <UiInput id="auth-audit-to" v-model="searchTo" name="auth-audit-to" type="date" />
              </UiFormField>
            </div>
          </div>

          <div class="action-row compact-actions mt-4">
            <UiButton
              variant="primary"
              class="auth-audit-search-button flex-1"
              type="button"
              @click="submitSearch"
            >
              {{ t('auth_audit.btn_filter') }}
            </UiButton>
            <UiButton
              variant="secondary"
              class="auth-audit-reset-button flex-1"
              type="button"
              @click="resetSearch"
            >
              {{ t('auth_audit.btn_reset') }}
            </UiButton>
          </div>
        </section>

        <!-- Events List Container -->
        <section
          class="auth-audit-card auth-audit-list-section"
          aria-labelledby="auth-audit-events-title"
        >
          <h2 id="auth-audit-events-title" class="sr-only">{{ t('auth_audit.events_title') }}</h2>

          <UiEmptyState
            v-if="!hasEvents"
            :title="t('auth_audit.empty_title')"
            :description="t('auth_audit.empty_description')"
          />

          <div v-else class="event-cards-container">
            <ul class="event-cards-list" role="list">
              <li
                v-for="event in store.events"
                :key="event.event_id"
                class="event-card-item"
                :class="{
                  'event-card-item--active': event.event_id === store.selectedEventId,
                }"
              >
                <button
                  class="event-card-item__select"
                  type="button"
                  :aria-current="event.event_id === store.selectedEventId ? 'true' : undefined"
                  @click="store.selectEvent(event.event_id)"
                >
                  <!-- Leading themed avatar/icon wrapper -->
                  <div class="event-card-item__avatar-wrapper">
                    <div
                      class="event-card-icon-container"
                      :class="getOutcomeClass(event.outcome)"
                      aria-hidden="true"
                    >
                      <component :is="getEventIcon(event.event_type, event.outcome)" :size="16" />
                    </div>
                  </div>

                  <span class="event-card-item__body">
                    <span class="event-card-item__header-row">
                      <span class="event-card-item__type">{{ event.event_type }}</span>
                      <span class="outcome-badge" :class="getOutcomeClass(event.outcome)">
                        {{ event.outcome }}
                      </span>
                    </span>
                    <span class="event-card-item__subject">
                      {{
                        event.subject?.email ?? formatTechnicalPreview(event.subject?.subject_id)
                      }}
                    </span>
                    <span class="event-card-item__footer-row">
                      <span class="event-card-item__time">{{
                        dateFormat.smart(event.occurred_at)
                      }}</span>
                      <span
                        v-if="event.request?.request_id"
                        class="event-card-item__req-id font-mono text-xs"
                      >
                        {{ formatTechnicalPreview(event.request.request_id) }}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            </ul>

            <UiButton
              v-if="store.pagination?.has_more && store.pagination?.next_cursor"
              variant="secondary"
              class="auth-audit-load-more-button w-full mt-4"
              type="button"
              @click="store.loadMore"
            >
              {{ t('auth_audit.btn_load_more') }}
            </UiButton>
          </div>
        </section>
      </aside>

      <!-- Right Main Panel: Detail View -->
      <article
        v-if="store.selectedEvent"
        class="auth-audit-detail"
        aria-labelledby="auth-audit-detail-title"
      >
        <!-- Mobile back button to close selection -->
        <div class="auth-audit-detail-back-bar">
          <UiButton
            variant="secondary"
            class="flex items-center gap-2"
            type="button"
            @click="store.selectedEventId = null"
          >
            <ChevronLeft :size="16" />
            {{ t('common.back_to_list') }}
          </UiButton>
        </div>

        <header class="detail-header-card">
          <div class="detail-header-row">
            <span class="detail-eyebrow">{{ t('auth_audit.detail_title') }}</span>
            <span
              class="outcome-badge outcome-badge--large"
              :class="getOutcomeClass(store.selectedEvent.outcome)"
            >
              {{ store.selectedEvent.outcome }}
            </span>
          </div>
          <h2 id="auth-audit-detail-title" class="detail-title">
            {{ store.selectedEvent.event_type }}
          </h2>
          <div class="detail-event-id-wrap">
            <span class="label">Kode event:</span>
            <code class="value font-mono break-anywhere">{{
              formatTechnicalPreview(store.selectedEvent.event_id)
            }}</code>
            <button
              class="copy-btn"
              type="button"
              :title="copied ? 'Copied' : 'Copy event reference'"
              @click="copyToClipboard(formatTechnicalPreview(store.selectedEvent.event_id))"
            >
              <Check v-if="copied" :size="14" class="text-emerald-500 animate-scale-up" />
              <Copy v-else :size="14" />
            </button>
          </div>
        </header>

        <div class="detail-section">
          <h3 class="flex items-center gap-2">
            <Shield :size="16" class="text-primary" />
            <span>Informasi Dasar</span>
          </h3>
          <dl class="detail-metadata-grid">
            <div>
              <dt>{{ t('auth_audit.col_type') }}</dt>
              <dd>
                <code>{{ store.selectedEvent.event_type }}</code>
              </dd>
            </div>
            <div>
              <dt>{{ t('auth_audit.col_outcome') }}</dt>
              <dd>
                <code>{{ store.selectedEvent.outcome }}</code>
              </dd>
            </div>
            <div>
              <dt>{{ t('auth_audit.col_subject') }}</dt>
              <dd>
                {{
                  store.selectedEvent.subject?.email ??
                  formatTechnicalPreview(store.selectedEvent.subject?.subject_id)
                }}
              </dd>
            </div>
            <div>
              <dt>Kode akun</dt>
              <dd class="font-mono break-anywhere">
                {{ formatTechnicalPreview(store.selectedEvent.subject?.subject_id) }}
              </dd>
            </div>
            <div>
              <dt>Aplikasi</dt>
              <dd>
                <code>{{ formatFriendlyClientName(store.selectedEvent.client_id) }}</code>
              </dd>
            </div>
            <div>
              <dt>Kode sesi</dt>
              <dd class="font-mono break-anywhere">
                {{ formatTechnicalPreview(store.selectedEvent.session_id) }}
              </dd>
            </div>
            <div>
              <dt>{{ t('auth_audit.col_occurred_at') }}</dt>
              <dd class="font-mono">{{ dateFormat.absolute(store.selectedEvent.occurred_at) }}</dd>
            </div>
            <div v-if="store.selectedEvent.error_code">
              <dt>{{ t('auth_audit.col_error_code') }}</dt>
              <dd class="error-code-val font-semibold">{{ store.selectedEvent.error_code }}</dd>
            </div>
          </dl>
        </div>

        <div v-if="store.selectedEvent.request" class="detail-section">
          <h3 class="flex items-center gap-2">
            <FileText :size="16" class="text-primary" />
            <span>Informasi Request</span>
          </h3>
          <dl class="detail-metadata-grid">
            <div>
              <dt>Kode request</dt>
              <dd class="font-mono break-anywhere">
                {{ formatTechnicalPreview(store.selectedEvent.request.request_id) }}
              </dd>
            </div>
            <div>
              <dt>{{ t('auth_audit.col_ip_address') }}</dt>
              <dd>
                <code>{{ store.selectedEvent.request.ip_address ?? '—' }}</code>
              </dd>
            </div>
            <div class="col-span-full">
              <dt>User Agent</dt>
              <dd class="ua-val text-sm leading-relaxed">
                {{ store.selectedEvent.request.user_agent ?? '—' }}
              </dd>
            </div>
          </dl>
        </div>

        <!-- Collapsible Context Metadata -->
        <div
          v-if="store.selectedEvent.context && Object.keys(store.selectedEvent.context).length > 0"
          class="detail-section"
        >
          <button
            class="context-toggle-btn"
            type="button"
            :aria-expanded="contextExpanded"
            @click="toggleContext"
          >
            <span class="flex items-center gap-2">
              <Code :size="16" class="text-primary" />
              <span>Context Data (Metadata)</span>
            </span>
            <span class="chevron-icon" :class="{ 'chevron-icon--rotated': contextExpanded }">
              <ChevronDown :size="16" />
            </span>
          </button>
          <div v-show="contextExpanded" class="context-content mt-2">
            <pre
              class="policy-json bg-muted p-3 rounded-lg text-xs font-mono overflow-auto max-h-60"
              >{{ JSON.stringify(store.selectedEvent.context, null, 2) }}</pre
            >
          </div>
        </div>

        <EvidenceContextPanel
          title="Authentication audit evidence"
          :request-id="store.requestId"
          :correlation-id="store.selectedEvent?.request?.request_id"
          :session-id="store.selectedEvent?.session_id"
          :client-id="store.selectedEvent?.client_id"
          :subject-id="store.selectedEvent?.subject?.subject_id"
          :audit-event-id="store.selectedEvent?.event_id"
        />
      </article>

      <section v-else class="auth-audit-detail-empty" role="status">
        <UiEmptyState
          title="Tidak Ada Event Terpilih"
          description="Pilih salah satu event autentikasi dari daftar di samping untuk melihat rincian detail secara mendalam."
        >
          <template #icon>
            <Shield :size="28" class="text-primary animate-pulse" />
          </template>
        </UiEmptyState>
      </section>
    </div>
  </section>
</template>

<style scoped>
/* Page container */
.authentication-audit-page {
  display: grid;
  gap: 18px;
}

/* Master layout wrapper */
.auth-audit-layout {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  align-items: start;
  gap: 24px;
}

/* Sidebar structure */
.auth-audit-sidebar {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  width: 100%;
}

/* Base custom card style matching the site layout */
.auth-audit-card {
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--card);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.04);
  min-width: 0;
}

/* Filter toggle button header */
.filters-toggle-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: var(--foreground);
  text-align: left;
}

.filters-toggle-btn:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 4px;
  border-radius: 4px;
}

.filters-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.1rem;
  font-weight: 700;
}

/* Chevron animations */
.chevron-icon {
  display: inline-flex;
  transition: transform 0.2s ease;
}

.chevron-icon--rotated {
  transform: rotate(180deg);
}

/* Compact filter grid */
.filters-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

@media (min-width: 480px) and (max-width: 760px) {
  .filters-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* Card list styling */
.event-cards-container {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.event-cards-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
  min-width: 0;
}

/* Single event card item */
.event-card-item {
  display: flex;
  border-radius: 16px;
  border: 1px solid var(--border);
  background: var(--card);
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    transform 0.15s ease;
  position: relative;
  overflow: hidden;
}

.event-card-item:hover {
  border-color: rgba(99, 102, 241, 0.4);
  background: var(--secondary);
  transform: translateY(-1px);
}

.event-card-item--active {
  border-color: var(--primary);
  background: var(--secondary);
  box-shadow: 0 0 0 1px var(--primary);
}

.event-card-item:focus-within {
  border-color: var(--primary);
  box-shadow: 0 0 0 1px var(--primary);
}

.event-card-item__select {
  display: flex;
  align-items: center;
  width: 100%;
  background: none;
  border: none;
  padding: 12px 14px;
  cursor: pointer;
  text-align: left;
  color: inherit;
  gap: 12px;
}

.event-card-item__select:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: -2px;
  border-radius: 16px;
}

/* Color indicator themed icons */
.event-card-item__avatar-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.event-card-icon-container {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  flex-shrink: 0;
  transition: background-color 0.2s ease;
}

.event-card-icon-container.outcome--success {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
  border: 1px solid rgba(34, 197, 94, 0.2);
}

.event-card-icon-container.outcome--danger {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.event-card-icon-container.outcome--warning {
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.2);
}

/* Body of card */
.event-card-item__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.event-card-item__header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.event-card-item__type {
  font-weight: 700;
  color: var(--foreground);
  font-size: 0.95rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Small outcome badges */
.outcome-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: var(--muted);
  color: var(--muted-foreground);
}

.outcome-badge.outcome--success {
  color: #22c55e;
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.2);
}

.outcome-badge.outcome--danger {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.outcome-badge.outcome--warning {
  color: #d97706;
  background: rgba(217, 119, 6, 0.1);
  border: 1px solid rgba(217, 119, 6, 0.2);
}

.event-card-item__subject {
  font-size: 0.82rem;
  color: var(--muted-foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.event-card-item__footer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.74rem;
  color: var(--muted-foreground);
  opacity: 0.85;
}

.event-card-item__req-id {
  font-size: 0.7rem;
}

/* Detail panel structure */
.auth-audit-detail {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--card);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.04);
  min-width: 0;
}

.auth-audit-detail-empty {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* Mobile back bar */
.auth-audit-detail-back-bar {
  display: none;
  margin-bottom: 8px;
}

/* Premium detail header card */
.detail-header-card {
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: linear-gradient(135deg, var(--muted) 0%, rgba(99, 102, 241, 0.03) 100%);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.detail-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.detail-eyebrow {
  font-size: 0.75rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--primary);
}

.outcome-badge--large {
  padding: 4px 12px;
  font-size: 0.8rem;
}

.detail-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.6rem;
  font-weight: 900;
  color: var(--foreground);
  letter-spacing: -0.02em;
}

.detail-event-id-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  color: var(--muted-foreground);
  flex-wrap: wrap;
}

.detail-event-id-wrap .value {
  color: var(--foreground);
  background: var(--card);
  padding: 2px 6px;
  border-radius: 6px;
  border: 1px solid var(--border);
}

/* Copy button micro-interaction */
.copy-btn {
  background: var(--secondary);
  border: 1px solid var(--border);
  padding: 6px;
  cursor: pointer;
  color: var(--muted-foreground);
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.copy-btn:hover {
  background-color: var(--primary);
  color: var(--primary-foreground);
  border-color: var(--primary);
  transform: scale(1.05);
}

.copy-btn:active {
  transform: scale(0.95);
}

/* Detail sections inside pane */
.detail-section {
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--muted);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.02);
}

.detail-section h3 {
  margin: 0 0 14px 0;
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 800;
  color: var(--foreground);
  letter-spacing: -0.01em;
}

/* Detail grid for metadata key-values */
.detail-metadata-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin: 0;
}

.detail-metadata-grid > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.detail-metadata-grid dt {
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted-foreground);
}

.detail-metadata-grid dd {
  margin: 0;
  font-size: 0.92rem;
  color: var(--foreground);
  overflow-wrap: break-word;
}

.detail-metadata-grid dd code {
  font-family: var(--font-mono);
  background: var(--card);
  padding: 2px 6px;
  border-radius: 6px;
  border: 1px solid var(--border);
  font-size: 0.85rem;
}

.col-span-full {
  grid-column: 1 / -1;
}

.error-code-val {
  color: var(--destructive) !important;
}

.ua-val {
  background: var(--card);
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  font-size: 0.8rem;
  font-family: var(--font-mono);
}

/* Context toggle & JSON display */
.context-toggle-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: var(--foreground);
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 800;
  text-align: left;
}

.context-toggle-btn:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 4px;
  border-radius: 4px;
}

.context-content {
  margin-top: 10px;
}

/* Animations */
@keyframes scaleUp {
  0% {
    transform: scale(0.85);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.animate-scale-up {
  animation: scaleUp 0.15s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

/* ── Responsive ─────────────────────────────────────────────────────────── */
@media (max-width: 760px) {
  .auth-audit-layout {
    grid-template-columns: 1fr;
  }

  /* On mobile with a selection, hide the sidebar and show only the detail. */
  .auth-audit-layout--has-selection .auth-audit-sidebar {
    display: none !important;
  }

  /* On mobile without a selection, hide the empty detail placeholder. */
  .auth-audit-layout:not(.auth-audit-layout--has-selection) .auth-audit-detail-empty {
    display: none !important;
  }

  .auth-audit-sidebar {
    max-width: none !important;
    grid-column: auto !important;
  }

  .auth-audit-detail,
  .auth-audit-detail-empty {
    grid-column: auto !important;
  }

  .auth-audit-detail-back-bar {
    display: block;
  }

  .auth-audit-detail {
    padding: 16px !important;
    gap: 16px !important;
  }

  .detail-header-card {
    padding: 14px !important;
  }

  .detail-title {
    font-size: 1.25rem !important;
    overflow-wrap: anywhere !important;
    word-break: break-word !important;
  }

  .detail-section {
    padding: 14px !important;
  }

  .detail-metadata-grid {
    grid-template-columns: 1fr !important;
    gap: 10px !important;
  }

  .detail-metadata-grid dd {
    overflow-wrap: anywhere !important;
    word-break: break-word !important;
  }

  .compact-actions {
    display: grid !important;
    grid-template-columns: 1fr !important;
  }
}
</style>
