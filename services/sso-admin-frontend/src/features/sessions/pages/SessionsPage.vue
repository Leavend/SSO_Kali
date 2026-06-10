<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch, type Component } from 'vue'
import { useI18n } from '@/composables/useI18n'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import EvidenceContextPanel from '@/components/EvidenceContextPanel.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import { useToast } from '@/components/ui/useToast'
import { useSessionStore } from '@/stores/session.store'
import { useSessionsStore } from '../stores/sessions.store'
import { formatFriendlyClientName, formatTechnicalPreview } from '@/lib/display-identifiers'
import { ChevronLeft, LayoutDashboard, Search, ShieldAlert, X } from 'lucide-vue-next'

const store = useSessionsStore()
const session = useSessionStore()
const { pushToast } = useToast()
const { t } = useI18n()

const canTerminateSessions = computed(() => session.hasPermission('admin.sessions.terminate'))
const pendingRevokeSessionId = ref<string | null>(null)

// ─── Tabs Navigation ──────────────────────────────────────────────────────────
type DetailTab = 'overview' | 'lifecycle'
const activeDetailTab = ref<DetailTab>('overview')

const detailTabs = computed<Array<{ key: DetailTab; label: string; icon: Component }>>(() => {
  const tabs: Array<{ key: DetailTab; label: string; icon: Component }> = [
    { key: 'overview', label: t('sessions.tab_overview'), icon: LayoutDashboard },
  ]
  if (canTerminateSessions.value) {
    tabs.push({ key: 'lifecycle', label: t('sessions.tab_lifecycle'), icon: ShieldAlert })
  }
  return tabs
})

function selectDetailTab(key: DetailTab): void {
  activeDetailTab.value = key
}

function onTabKeydown(event: KeyboardEvent, index: number): void {
  const tabs = detailTabs.value
  let nextIndex = index
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    nextIndex = (index + 1) % tabs.length
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    nextIndex = (index - 1 + tabs.length) % tabs.length
  } else if (event.key === 'Home') {
    nextIndex = 0
  } else if (event.key === 'End') {
    nextIndex = tabs.length - 1
  } else {
    return
  }
  event.preventDefault()
  const next = tabs[nextIndex]
  if (!next) return
  activeDetailTab.value = next.key
  void nextTick(() => {
    document.getElementById(`session-tab-${next.key}`)?.focus()
  })
}

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
  activeDetailTab.value = 'overview'
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
  const palette = [
    { start: '#6366F1', end: '#4F46E5' },
    { start: '#EC4899', end: '#DB2777' },
    { start: '#10B981', end: '#059669' },
    { start: '#F59E0B', end: '#D97706' },
    { start: '#3B82F6', end: '#2563EB' },
    { start: '#8B5CF6', end: '#7C3AED' },
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
  <section class="sessions-page" aria-labelledby="sessions-title">
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

    <div
      v-else
      class="sessions-layout"
      :class="{ 'sessions-layout--has-selection': store.selectedSessionId !== null }"
    >
      <!-- Action status: spans full grid width, above sidebar and detail panel -->
      <div
        v-if="store.actionStatus === 'step_up_required' || store.actionStatus === 'error'"
        class="sessions-status-bar"
        aria-live="polite"
      >
        <p class="ui-action-message ui-action-message--error" role="alert">
          {{ store.errorMessage }}
        </p>
      </div>

      <!-- ─── Sidebar: searchable session list ──────────────────────────── -->
      <aside class="sessions-list" :aria-label="t('sessions.list_aria')">
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

          <!-- Session card list: <li> wraps a select button + sibling revoke button
               so that interactive elements are never nested (HTML spec §4.3.18). -->
          <ul class="sessions-list-cards" role="list">
            <li
              v-for="adminSession in filteredSessions"
              :key="adminSession.session_id"
              class="session-card-item"
              :class="{
                'session-card-item--active': adminSession.session_id === store.selectedSessionId,
              }"
            >
              <button
                class="session-card-item__select"
                type="button"
                :aria-current="
                  adminSession.session_id === store.selectedSessionId ? 'true' : undefined
                "
                @click="selectSession(adminSession.session_id)"
              >
                <span
                  class="session-card-item__avatar"
                  :style="avatarStyle(adminSession.user_display_name ?? adminSession.session_id)"
                  aria-hidden="true"
                >
                  {{ avatarInitial(adminSession.user_display_name ?? adminSession.session_id) }}
                </span>
                <span class="session-card-item__body">
                  <span class="session-card-item__name">{{ adminSession.user_display_name }}</span>
                  <span class="session-card-item__id">{{
                    formatTechnicalPreview(adminSession.session_id)
                  }}</span>
                  <span class="session-card-item__meta">
                    <span class="session-card-item__client">{{
                      formatFriendlyClientName(adminSession.client_id)
                    }}</span>
                    <span class="session-card-item__ip">{{ adminSession.ip_address }}</span>
                  </span>
                </span>
              </button>

              <button
                v-if="canTerminateSessions"
                class="revoke-button session-card-item__revoke"
                type="button"
                @click.stop="requestRevokeSession(adminSession.session_id)"
              >
                {{ t('sessions.btn_revoke') }}
              </button>
            </li>
          </ul>
        </template>
      </aside>

      <!-- ─── Session Detail Panel ──────────────────────────────────────── -->
      <article v-if="selectedSession" class="session-detail">
        <!-- Mobile back button -->
        <div class="session-detail-back-bar">
          <UiButton variant="secondary" size="sm" @click="store.selectedSessionId = null">
            <ChevronLeft :size="16" />
            {{ t('common.back_to_list') }}
          </UiButton>
        </div>

        <!-- Hero -->
        <header class="client-profile-hero">
          <div
            class="client-profile-hero__avatar"
            :style="avatarStyle(selectedSession.user_display_name ?? selectedSession.session_id)"
            aria-hidden="true"
          >
            {{ avatarInitial(selectedSession.user_display_name ?? selectedSession.session_id) }}
          </div>
          <div class="client-profile-hero__content">
            <div class="client-profile-hero__header-row">
              <h2>{{ selectedSession.user_display_name }}</h2>
              <span class="ui-badge badge--active">{{ t('sessions.status_active') }}</span>
            </div>
            <p class="client-profile-hero__env">
              {{ formatFriendlyClientName(selectedSession.client_id) }}
            </p>
            <p class="client-profile-hero__client-id">
              {{ formatTechnicalPreview(selectedSession.session_id) }}
            </p>
          </div>
        </header>

        <!-- Tabs Navigation -->
        <nav
          class="client-detail-tabs"
          role="tablist"
          :aria-label="t('sessions.detail_tabs_label')"
        >
          <button
            v-for="(tab, index) in detailTabs"
            :id="`session-tab-${tab.key}`"
            :key="tab.key"
            class="client-detail-tab"
            :class="{ 'client-detail-tab--active': activeDetailTab === tab.key }"
            role="tab"
            :aria-selected="activeDetailTab === tab.key"
            :aria-controls="`session-panel-${tab.key}`"
            :tabindex="activeDetailTab === tab.key ? 0 : -1"
            type="button"
            @click="selectDetailTab(tab.key)"
            @keydown="onTabKeydown($event, index)"
          >
            <component :is="tab.icon" :size="16" aria-hidden="true" />
            {{ tab.label }}
          </button>
        </nav>

        <!-- Panel: Overview -->
        <div
          v-show="activeDetailTab === 'overview'"
          id="session-panel-overview"
          role="tabpanel"
          aria-labelledby="session-tab-overview"
          class="tab-panel"
        >
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
        </div>

        <!-- Panel: Lifecycle (danger zone) -->
        <div
          v-show="activeDetailTab === 'lifecycle'"
          id="session-panel-lifecycle"
          role="tabpanel"
          aria-labelledby="session-tab-lifecycle"
          class="tab-panel"
        >
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
        </div>

        <EvidenceContextPanel title="Sessions evidence" :request-id="store.requestId" />
      </article>

      <!-- ─── Empty state when no session selected ──────────────────────── -->
      <section v-else class="session-detail-empty" role="status">
        <UiEmptyState
          :title="t('sessions.no_session_title')"
          :description="t('sessions.no_session_desc')"
        />
      </section>
    </div>

    <EvidenceContextPanel
      v-if="!selectedSession"
      title="Sessions evidence"
      :request-id="store.requestId"
    />

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
