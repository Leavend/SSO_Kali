<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from '@/composables/useI18n'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import EvidenceContextPanel from '@/components/EvidenceContextPanel.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiDetailDrawer from '@/components/ui/UiDetailDrawer.vue'
import { useToast } from '@/components/ui/useToast'
import { useSessionStore } from '@/stores/session.store'
import { useSessionsStore } from '../stores/sessions.store'
import { formatFriendlyClientName, formatTechnicalPreview } from '@/lib/display-identifiers'
import { Search, X } from 'lucide-vue-next'

const store = useSessionsStore()
const session = useSessionStore()
const { pushToast } = useToast()
const { t } = useI18n()

const canTerminateSessions = computed(() => session.hasPermission('admin.sessions.terminate'))
const pendingRevokeSessionId = ref<string | null>(null)

// ─── Search Sidebar ───────────────────────────────────────────────────────────
const searchQuery = ref('')
const filteredSessions = computed(() => {
  const query = searchQuery.value.toLowerCase().trim()
  if (!query) return store.sessions
  return store.sessions.filter(
    (s) =>
      s.session_id.toLowerCase().includes(query) ||
      (s.client_id && s.client_id.toLowerCase().includes(query)) ||
      (s.user_display_name && s.user_display_name.toLowerCase().includes(query)) ||
      (s.ip_address && s.ip_address.toLowerCase().includes(query)),
  )
})

// ─── Selection ────────────────────────────────────────────────────────────────
const selectedSession = computed(() =>
  store.sessions.find((s) => s.session_id === store.selectedSessionId),
)

async function selectSession(sessionId: string): Promise<void> {
  store.errorMessage = null
  await store.selectSession(sessionId)
}

function closeDrawer(): void {
  store.selectedSessionId = null
}

// ─── Revocation ───────────────────────────────────────────────────────────────
function requestRevokeSession(sessionId: string): void {
  pendingRevokeSessionId.value = sessionId
}

function cancelRevokeSession(): void {
  pendingRevokeSessionId.value = null
}

async function confirmRevokeSession(): Promise<void> {
  const sessionId = pendingRevokeSessionId.value
  pendingRevokeSessionId.value = null
  if (sessionId) {
    await store.revokeSession(sessionId)
    if (store.selectedSessionId === sessionId) {
      store.selectedSessionId = null
    }
  }
}

const confirmDescription = computed<string>(() =>
  pendingRevokeSessionId.value
    ? t('sessions.confirm_revoke_desc', {
        id: formatTechnicalPreview(pendingRevokeSessionId.value),
      })
    : t('common.confirm_desc') || 'Review the impact before continuing.',
)

// ─── Avatar Helpers ───────────────────────────────────────────────────────────
function avatarInitial(name: string): string {
  return name ? name.charAt(0).toUpperCase() : 'S'
}

function avatarStyle(name: string): Record<string, string> {
  // Dark-aware avatar palette lives in src/assets/tokens.css (--avatar-1..6 + -2 end).
  const palette = [
    { start: 'var(--avatar-1)', end: 'var(--avatar-1-2)' },
    { start: 'var(--avatar-2)', end: 'var(--avatar-2-2)' },
    { start: 'var(--avatar-3)', end: 'var(--avatar-3-2)' },
    { start: 'var(--avatar-4)', end: 'var(--avatar-4-2)' },
    { start: 'var(--avatar-5)', end: 'var(--avatar-5-2)' },
    { start: 'var(--avatar-6)', end: 'var(--avatar-6-2)' },
  ]
  let hash = 0
  for (let i = 0; i < name.length; i += 1) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const color = palette[Math.abs(hash) % palette.length] ?? palette[0]!
  return { background: `linear-gradient(135deg, ${color.start}, ${color.end})` }
}

onMounted(() => {
  if (store.status === 'idle') void store.load()
})

watch(
  () => store.actionStatus,
  (status) => {
    if (status === 'success') {
      pushToast({
        tone: 'success',
        title: 'Session revoked',
        description: 'Admin session termination completed.',
        requestId: store.requestId ?? undefined,
      })
      return
    }

    if (status === 'step_up_required') {
      pushToast({
        tone: 'step_up',
        title: 'Fresh auth required',
        description: store.errorMessage ?? 'Re-authenticate before retrying this action.',
      })
      return
    }

    if (status === 'error') {
      pushToast({
        tone: 'error',
        title: 'Session operation failed',
        description: store.errorMessage ?? 'Retry after checking admin API health.',
        requestId: store.requestId ?? undefined,
      })
    }
  },
)
</script>

<template>
  <section
    class="sessions-page max-w-page mx-auto px-4 md:px-6 py-8"
    aria-labelledby="sessions-title"
  >
    <div class="page-heading">
      <p class="eyebrow">{{ t('sessions.eyebrow') }}</p>
      <h1 id="sessions-title">{{ t('sessions.title') }}</h1>
      <p class="page-summary">{{ t('sessions.summary') }}</p>
    </div>

    <UiSkeleton v-if="store.status === 'loading'" :label="t('sessions.loading')" />

    <UiStatusView
      v-else-if="store.status === 'forbidden'"
      tone="forbidden"
      eyebrow="Sessions"
      :title="t('sessions.forbidden_title')"
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
      :title="t('sessions.error_title')"
      :description="store.errorMessage ?? t('common.error_loading_desc')"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <div v-else class="sessions-table-region">
      <!-- Action status: above the table -->
      <div
        v-if="store.actionStatus === 'step_up_required' || store.actionStatus === 'error'"
        class="sessions-status-bar"
        aria-live="polite"
      >
        <p class="ui-action-message ui-action-message--error" role="alert">
          {{ store.errorMessage }}
        </p>
      </div>

      <UiEmptyState
        v-if="store.sessions.length === 0"
        :title="t('sessions.empty')"
        :description="t('sessions.empty_desc')"
      />

      <template v-else>
        <UiFormField
          id="search-sessions"
          :label="t('sessions.search_label')"
          class="sessions-search"
        >
          <div class="sessions-search__control">
            <Search :size="16" class="sessions-search__icon" aria-hidden="true" />
            <UiInput
              id="search-sessions"
              v-model="searchQuery"
              :placeholder="t('sessions.search_placeholder')"
              autocomplete="off"
              class="sessions-search__input"
            />
            <button
              v-if="searchQuery"
              class="sessions-search__clear"
              type="button"
              :aria-label="t('common.btn_reset')"
              @click="searchQuery = ''"
            >
              <X :size="14" />
            </button>
          </div>
        </UiFormField>

        <div class="tbl-shell">
          <div class="tbl-scroll">
            <table class="tbl tbl--clickable">
              <caption class="sr-only">
                {{
                  t('sessions.list_aria')
                }}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{{ t('sessions.col_user') }}</th>
                  <th scope="col">{{ t('sessions.col_session_id') }}</th>
                  <th scope="col">{{ t('sessions.col_client') }}</th>
                  <th scope="col">{{ t('sessions.col_ip') }}</th>
                  <th scope="col">{{ t('common.status') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="adminSession in filteredSessions"
                  :key="adminSession.session_id"
                  :aria-selected="adminSession.session_id === store.selectedSessionId"
                  tabindex="0"
                  @click="selectSession(adminSession.session_id)"
                  @keydown.enter.prevent="selectSession(adminSession.session_id)"
                  @keydown.space.prevent="selectSession(adminSession.session_id)"
                >
                  <td :data-label="t('sessions.col_user')">
                    <span class="tbl__rowname">
                      <span
                        class="tbl__avatar"
                        :style="
                          avatarStyle(adminSession.user_display_name ?? adminSession.session_id)
                        "
                        aria-hidden="true"
                      >
                        {{
                          avatarInitial(adminSession.user_display_name ?? adminSession.session_id)
                        }}
                      </span>
                      <span class="tbl__rowmeta">
                        <span class="tbl__primary">{{ adminSession.user_display_name }}</span>
                      </span>
                    </span>
                  </td>
                  <td class="tbl__cell--mono" :data-label="t('sessions.col_session_id')">
                    {{ formatTechnicalPreview(adminSession.session_id) }}
                  </td>
                  <td :data-label="t('sessions.col_client')">
                    {{ formatFriendlyClientName(adminSession.client_id) }}
                  </td>
                  <td class="tbl__cell--mono" :data-label="t('sessions.col_ip')">
                    {{ adminSession.ip_address }}
                  </td>
                  <td :data-label="t('common.status')">
                    <UiStatusBadge tone="success" :label="t('sessions.status_active')" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </div>

    <EvidenceContextPanel
      v-if="!selectedSession"
      title="Sessions evidence"
      :request-id="store.requestId"
    />

    <!-- ─── Session Detail Drawer ─────────────────────────────────────────── -->
    <UiDetailDrawer
      v-if="selectedSession"
      :open="store.selectedSessionId !== null"
      title-id="session-detail-drawer"
      :title="selectedSession.user_display_name ?? t('sessions.title')"
      :description="t('sessions.detail_tabs_label')"
      :close-label="t('common.close')"
      @close="closeDrawer"
    >
      <header class="drawer-hero">
        <div
          class="drawer-hero__avatar"
          :style="avatarStyle(selectedSession.user_display_name ?? selectedSession.session_id)"
          aria-hidden="true"
        >
          {{ avatarInitial(selectedSession.user_display_name ?? selectedSession.session_id) }}
        </div>
        <div class="drawer-hero__meta">
          <UiStatusBadge tone="success" :label="t('sessions.status_active')" />
          <p class="drawer-hero__sub">{{ formatFriendlyClientName(selectedSession.client_id) }}</p>
        </div>
      </header>

      <dl class="detail-grid">
        <div>
          <dt>Kode sesi</dt>
          <dd>
            <code>{{ formatTechnicalPreview(selectedSession.session_id) }}</code>
          </dd>
        </div>
        <div>
          <dt>Aplikasi</dt>
          <dd>
            <code>{{ formatFriendlyClientName(selectedSession.client_id) }}</code>
          </dd>
        </div>
        <div>
          <dt>{{ t('sessions.ov_user_name') }}</dt>
          <dd>{{ selectedSession.user_display_name }}</dd>
        </div>
        <div>
          <dt>{{ t('sessions.ov_ip_address') }}</dt>
          <dd>
            <code>{{ selectedSession.ip_address }}</code>
          </dd>
        </div>
      </dl>

      <section
        v-if="canTerminateSessions"
        class="detail-section detail-section--danger"
        aria-labelledby="terminate-session-title"
      >
        <h3 id="terminate-session-title">{{ t('sessions.terminate_title') }}</h3>
        <p class="detail-section__lead">{{ t('sessions.terminate_hint') }}</p>
        <div class="user-detail__sub-actions">
          <h4 class="user-detail__sub-actions-title">{{ t('sessions.sub_revoke_title') }}</h4>
          <p class="user-detail-card__hint">{{ t('sessions.revoke_hint') }}</p>
          <div class="user-detail-card__actions">
            <UiButton
              variant="danger"
              class="revoke-button"
              type="button"
              @click="requestRevokeSession(selectedSession.session_id)"
            >
              {{ t('sessions.btn_revoke') }}
            </UiButton>
          </div>
        </div>
      </section>

      <EvidenceContextPanel title="Sessions evidence" :request-id="store.requestId" />
    </UiDetailDrawer>

    <ConfirmDialog
      :open="pendingRevokeSessionId !== null"
      :title="t('sessions.confirm_revoke_title')"
      :description="confirmDescription"
      :confirm-label="t('sessions.btn_revoke')"
      :cancel-label="t('common.btn_cancel')"
      @confirm="confirmRevokeSession"
      @cancel="cancelRevokeSession"
    />
  </section>
</template>
