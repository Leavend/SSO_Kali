<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { useSessionsList } from '@/composables/useSessionsList'
import { filterSessions } from '@/lib/sessions/sessions-list'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiDetailDrawer from '@/components/ui/UiDetailDrawer.vue'
import SessionsTable from '@/components/sessions/SessionsTable.vue'
import type { AdminSession } from '@/types/sessions.types'

definePageMeta({
  name: 'admin.sessions',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.sessions.terminate'],
})

const { t } = useI18n()
const store = useSessionStore()

// SAFE HYDRATION: resolve the masked principal server-side. Tokens stay in Nitro
// event.context; the session DTOs carry no token/secret (only operational metadata:
// session_id handle, subject_id, email, ip, user-agent, timestamps).
await useAsyncData('admin-sessions-principal', () => store.ensureSession())

const { sessions, viewState, requestId, isStale, refresh } = useSessionsList()

const sessionList = computed<readonly AdminSession[]>(() => sessions.value ?? [])
const searchQuery = ref('')
const filtered = computed<readonly AdminSession[]>(() =>
  filterSessions(sessionList.value, searchQuery.value),
)

const canTerminate = computed<boolean>(() => store.hasPermission('admin.sessions.terminate'))

// Master-detail: selected session drives the read-only drawer.
const selectedSessionId = ref<string | null>(null)
const selectedSession = computed<AdminSession | null>(
  () => sessionList.value.find((s) => s.session_id === selectedSessionId.value) ?? null,
)

// Single page-level success region — reused by terminate (9.7).
const successMessage = ref<string | null>(null)

function onSelectSession(sessionId: string): void {
  selectedSessionId.value = sessionId
}
function onCloseDrawer(): void {
  selectedSessionId.value = null
}
async function onRefresh(): Promise<void> {
  await refresh()
}

// Handler body filled by Task 9.7 (declared once; never renamed):
function onTerminateRequested(_session: AdminSession): void {
  /* Task 9.7 */
}
</script>

<template>
  <section class="sessions" data-page="sessions" data-admin-shell>
    <header class="sessions__hero">
      <span class="sessions__eyebrow">{{ t('sessions.eyebrow') }}</span>
      <h1 class="sessions__title">{{ t('sessions.title') }}</h1>
      <p class="sessions__summary">{{ t('sessions.summary') }}</p>
      <p class="sessions__principal" data-principal-name>
        {{ t('sessions.signed_in_as', { name: store.principal?.display_name ?? '—' }) }}
      </p>
    </header>

    <p
      v-if="successMessage"
      class="sessions__success"
      role="status"
      aria-live="polite"
      data-testid="sessions-action-success"
    >
      {{ successMessage }}
    </p>

    <UiSkeleton v-if="viewState === 'loading'" :rows="6" :label="t('sessions.loading')" />

    <UiStatusView
      v-else-if="viewState === 'forbidden'"
      tone="forbidden"
      :eyebrow="t('sessions.eyebrow')"
      :title="t('sessions.forbidden_title')"
      :description="t('common.forbidden_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'unauthenticated'"
      tone="step_up"
      :eyebrow="t('sessions.eyebrow')"
      :title="t('common.session_expired_title')"
      :description="t('common.session_expired_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'error'"
      tone="error"
      :eyebrow="t('sessions.eyebrow')"
      :title="t('sessions.error_title')"
      :description="t('common.error_loading_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    >
      <template #actions>
        <UiButton variant="secondary" size="sm" data-testid="sessions-refresh" @click="onRefresh">
          {{ t('common.btn_refresh') }}
        </UiButton>
      </template>
    </UiStatusView>

    <UiEmptyState
      v-else-if="viewState === 'empty'"
      :title="t('sessions.empty')"
      :description="t('sessions.empty_desc')"
    />

    <template v-else>
      <div v-if="isStale" class="sessions__banner" role="status">
        {{ t('common.error_loading_desc') }}
      </div>

      <UiFormField id="sessions-search" :label="t('sessions.search_label')">
        <UiInput
          id="sessions-search"
          v-model="searchQuery"
          :placeholder="t('sessions.search_placeholder')"
          data-testid="sessions-search"
        />
      </UiFormField>

      <SessionsTable
        :sessions="filtered"
        :caption="t('sessions.list_aria')"
        :user-label="t('sessions.col_user')"
        :session-id-label="t('sessions.col_session_id')"
        :client-label="t('sessions.col_client')"
        :ip-label="t('sessions.col_ip')"
        :status-label="t('common.status')"
        :active-label="t('sessions.status_active')"
        @select="onSelectSession"
      />

      <UiDetailDrawer
        v-if="selectedSession"
        :open="selectedSession !== null"
        title-id="session-detail-drawer"
        :title="selectedSession.display_name ?? t('sessions.title')"
        :description="t('sessions.detail_tabs_label')"
        :close-label="t('common.close')"
        wide
        @close="onCloseDrawer"
      >
        <div class="session-detail" data-testid="session-detail">
          <div class="session-detail__head">
            <UiStatusBadge tone="success" :label="t('sessions.status_active')" />
          </div>
          <dl class="session-detail__grid">
            <div>
              <dt>{{ t('sessions.ov_session_id') }}</dt>
              <dd><UiFolio :value="selectedSession.session_id" variant="id" /></dd>
            </div>
            <div>
              <dt>{{ t('sessions.ov_client_id') }}</dt>
              <dd>{{ selectedSession.client_id ?? '—' }}</dd>
            </div>
            <div>
              <dt>{{ t('sessions.ov_user_name') }}</dt>
              <dd>{{ selectedSession.display_name ?? '—' }}</dd>
            </div>
            <div>
              <dt>{{ t('sessions.ov_email') }}</dt>
              <dd>{{ selectedSession.email ?? '—' }}</dd>
            </div>
            <div>
              <dt>{{ t('sessions.ov_ip_address') }}</dt>
              <dd><UiFolio :value="String(selectedSession.ip_address ?? '—')" variant="id" /></dd>
            </div>
            <div>
              <dt>{{ t('sessions.ov_user_agent') }}</dt>
              <dd>{{ selectedSession.user_agent ?? '—' }}</dd>
            </div>
            <div>
              <dt>{{ t('sessions.ov_created') }}</dt>
              <dd>
                <UiFolio :value="String(selectedSession.created_at ?? '—')" variant="timestamp" />
              </dd>
            </div>
            <div>
              <dt>{{ t('sessions.ov_last_activity') }}</dt>
              <dd>
                <UiFolio
                  :value="String(selectedSession.last_activity_at ?? '—')"
                  variant="timestamp"
                />
              </dd>
            </div>
          </dl>
        </div>
      </UiDetailDrawer>
    </template>
  </section>
</template>

<style scoped>
.sessions {
  display: grid;
  gap: 24px;
  padding: 24px;
}
.sessions__hero {
  display: grid;
  gap: 6px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.sessions__eyebrow {
  font: 600 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.sessions__title {
  margin: 0;
  font: 600 1.5rem/1.2 var(--font-sans);
  letter-spacing: -0.02em;
  color: var(--fg);
}
.sessions__summary,
.sessions__principal {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.sessions__success {
  margin: 0;
  padding: 10px 14px;
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--fg);
  background: var(--card);
  border: 1px solid var(--border);
}
.sessions__banner {
  padding: 10px 14px;
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--warning-soft-fg);
  background: var(--warning-soft);
  border: 1px solid var(--warning-soft-fg);
}
.session-detail {
  display: grid;
  gap: 16px;
}
.session-detail__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
  margin: 0;
}
.session-detail__grid dt {
  font: 600 0.625rem/1.2 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.session-detail__grid dd {
  margin: 2px 0 0;
  font: 400 0.8125rem/1.4 var(--font-sans);
  color: var(--fg);
}
</style>
