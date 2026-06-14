<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch, type Component } from 'vue'
import { useI18n } from '@/composables/useI18n'
import { useDateFormat } from '@/composables/useDateFormat'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
import { getAdminEnvironment } from '@/config/adminEnvironment'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import EvidenceContextPanel from '@/components/EvidenceContextPanel.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import { buttonVariants } from '@/components/ui/button'
import { useSessionStore } from '@/stores/session.store'
import { useUsersStore } from '../stores/users.store'
import { useSessionsStore } from '@/features/sessions/stores/sessions.store'
import { useRolesStore } from '@/features/roles/stores/roles.store'
import { useToast } from '@/components/ui/useToast'
import { authApi } from '@/services/auth.api'
import { formatFriendlyClientName, formatTechnicalPreview } from '@/lib/display-identifiers'
import { composeProfileDisplayName } from '@/lib/display-name'
import { useRouter } from 'vue-router'
import type { CreateUserResponse, SyncProfilePayload } from '../types'
import {
  Mail,
  CheckCircle,
  Clock,
  Lock,
  Unlock,
  Eye,
  ShieldAlert,
  Globe,
  Plus,
  ShieldX,
  UserCheck,
  Key,
  Search,
  X,
  ChevronLeft,
  LayoutDashboard,
  MonitorSmartphone,
  Settings,
  Copy,
} from 'lucide-vue-next'

const store = useUsersStore()
const sessionsStore = useSessionsStore()
const rolesStore = useRolesStore()
const session = useSessionStore()
const { t } = useI18n()
const dateFormat = useDateFormat()
const toast = useToast()
const router = useRouter()

const env = getAdminEnvironment()
const usersPollInterval = env.VITE_ADMIN_USERS_POLL_MS
  ? Number(env.VITE_ADMIN_USERS_POLL_MS)
  : 45000

useAutoRefresh({
  intervalMs: usersPollInterval,
  task: handleManualRefresh,
  enabled: () =>
    store.status !== 'forbidden' &&
    store.status !== 'unauthenticated' &&
    store.actionStatus !== 'loading' &&
    !store.pendingIntent,
})

async function handleManualRefresh(): Promise<void> {
  await store.refreshList()
  await store.refreshSelected()
}

async function copyToClipboard(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value)
    toast.pushToast({
      tone: 'success',
      title: t('common.copied') || 'Disalin',
    })
  } catch {
    // Fallback for older browsers / non-secure contexts
    const ta = document.createElement('textarea')
    ta.value = value
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    toast.pushToast({
      tone: 'success',
      title: t('common.copied') || 'Disalin',
    })
  }
}

const canWriteUsers = computed(() => session.hasPermission('admin.users.write'))
const canLockUsers = computed(() => session.hasPermission('admin.users.lock'))
const canTerminateSessions = computed(() => session.hasPermission('admin.sessions.terminate'))
const canWriteRoles = computed(() => session.hasPermission('admin.roles.write'))
const effectiveStatus = computed(
  () => store.selectedUser?.effective_status ?? store.selectedUser?.status ?? 'active',
)
const selectedUserLastLoginAt = computed(
  () =>
    store.selectedUser?.last_login_at ??
    store.loginContext?.last_seen_at ??
    store.sessions[0]?.last_activity_at ??
    store.sessions[0]?.created_at ??
    null,
)

const reason = ref('Admin review')
const selectedRole = ref('')

type DetailTab = 'overview' | 'security' | 'sessions' | 'lifecycle'
const activeDetailTab = ref<DetailTab>('overview')

type DestructiveAction =
  | 'lock'
  | 'deactivate'
  | 'reset_mfa'
  | 'issue_password_reset'
  | 'revoke_user_sessions'
const pendingAction = ref<DestructiveAction | null>(null)

const syncEmail = ref('')
const syncGivenName = ref('')
const syncFamilyName = ref('')
const syncDisplayNamePreview = computed(
  () => composeProfileDisplayName(syncGivenName.value, syncFamilyName.value) ?? '—',
)

const searchQuery = ref('')

const filteredUsers = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return store.users
  return store.users.filter(
    (user) =>
      (user.display_name ?? '').toLowerCase().includes(query) ||
      (user.email ?? '').toLowerCase().includes(query) ||
      (user.subject_id ?? '').toLowerCase().includes(query),
  )
})

function avatarInitial(name: string): string {
  return name.charAt(0).toUpperCase()
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
  return {
    background: `linear-gradient(135deg, ${color.start}, ${color.end})`,
  }
}

watch(
  () => store.selectedSubjectId,
  () => {
    const user = store.selectedUser
    syncEmail.value = user?.email ?? ''
    syncGivenName.value = user?.given_name ?? ''
    syncFamilyName.value = user?.family_name ?? ''
    selectedRole.value = user?.roles?.[0]?.slug ?? user?.role ?? ''
    activeDetailTab.value = 'overview'
  },
  { immediate: true },
)

onMounted(async () => {
  store.restorePendingIntent()
  const intent = store.pendingIntent

  if (store.status === 'idle') {
    await store.load()
  }

  if (intent) {
    await store.selectUser(intent.subjectId)
    if (intent.payload && typeof intent.payload.reason === 'string') {
      reason.value = intent.payload.reason
    }

    toast.pushToast({
      tone: 'step_up',
      title: 'Sesi admin disegarkan',
      description: 'Silakan ulangi kembali aksi Anda.',
    })

    store.clearPendingIntent()
  }

  if (rolesStore.status === 'idle') {
    void rolesStore.load()
  }
})

async function selectUser(subjectId: string): Promise<void> {
  await store.selectUser(subjectId)
}

const detailTabs = computed<Array<{ key: DetailTab; label: string; icon: Component }>>(() => {
  const tabs: Array<{ key: DetailTab; label: string; icon: Component }> = [
    { key: 'overview', label: t('users.tab_overview'), icon: LayoutDashboard },
    { key: 'security', label: t('users.tab_security'), icon: ShieldAlert },
    {
      key: 'sessions',
      label: t('users.tab_sessions'),
      icon: MonitorSmartphone,
    },
  ]
  if (canLockUsers.value || canWriteUsers.value) {
    tabs.push({
      key: 'lifecycle',
      label: t('users.tab_lifecycle'),
      icon: Settings,
    })
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
    document.getElementById(`user-tab-${next.key}`)?.focus()
  })
}

function openCreateForm(): void {
  router.push({ name: 'admin.users.create' })
}

async function submitSyncProfile(): Promise<void> {
  const email = syncEmail.value.trim()
  const givenName = syncGivenName.value.trim()
  const familyName = syncFamilyName.value.trim()
  const displayName = composeProfileDisplayName(givenName, familyName)
  const payload: SyncProfilePayload = {
    ...(email && { email }),
    ...(displayName && { display_name: displayName }),
    ...(givenName && { given_name: givenName }),
    ...(familyName && { family_name: familyName }),
  }
  await store.syncProfileSelected(payload)
}

async function submitAssignRoles(): Promise<void> {
  if (!store.selectedUser) return
  const subjectId = store.selectedUser.subject_id
  await store.assignRoles(subjectId, selectedRole.value)
  if (store.actionStatus === 'success') {
    await store.selectUser(subjectId)
    if (subjectId === session.user?.subject_id) {
      toast.pushToast({
        tone: 'success',
        title: t('users.roles_sync_success'),
      })
      toast.pushToast({
        tone: 'info',
        title: t('users.roles_self_warn'),
      })
      try {
        const result = await session.ensureSession(true)
        if (result === 'unauthenticated') {
          window.location.assign(
            `/auth/login?return_to=${encodeURIComponent(window.location.pathname)}`,
          )
        } else if (result === 'step_up_required') {
          router.push({ name: 'admin.step-up-required' })
        } else if (result === 'forbidden') {
          router.push({ name: 'admin.forbidden' })
        }
      } catch {
        toast.pushToast({
          tone: 'error',
          title: 'Session refresh failed',
          description:
            'Role changes were saved. Refresh the page if the current session looks stale.',
        })
      }
    } else {
      toast.pushToast({
        tone: 'success',
        title: t('users.roles_sync_success'),
      })
      toast.pushToast({
        tone: 'info',
        title: t('users.roles_other_warn'),
      })
    }
  }
}

function requestDestructiveAction(action: DestructiveAction): void {
  pendingAction.value = action
}

function cancelDestructiveAction(): void {
  pendingAction.value = null
}

async function revokeSingleSession(sessionId?: string): Promise<void> {
  if (!sessionId) return
  await sessionsStore.revokeSession(sessionId)
  if (store.selectedUser) {
    await store.selectUser(store.selectedUser.subject_id)
  }
}

async function confirmDestructiveAction(): Promise<void> {
  const action = pendingAction.value
  pendingAction.value = null
  if (action === 'lock') await store.lockSelected(reason.value)
  if (action === 'deactivate') await store.deactivateSelected(reason.value)
  if (action === 'reset_mfa') await store.resetMfaSelected(reason.value)
  if (action === 'issue_password_reset') {
    await store.issuePasswordResetSelected()
    if (store.actionStatus === 'success') {
      if (store.deliveryStatus === 'queued') {
        toast.pushToast({
          tone: 'success',
          title: t('users.reset_password_success_title'),
          description: t('users.reset_password_success_desc'),
        })
      } else if (store.deliveryStatus === 'failed') {
        toast.pushToast({
          tone: 'error',
          title: t('users.reset_password_failed_title'),
          description: t('users.reset_password_failed_desc'),
        })
      }
    }
  }
  if (action === 'revoke_user_sessions' && store.selectedUser) {
    await sessionsStore.revokeUserSessions(store.selectedUser.subject_id)
    await store.selectUser(store.selectedUser.subject_id)
  }
}

const confirmTitle = computed<string>(() => {
  if (pendingAction.value === 'lock') return t('users.confirm_lock_title')
  if (pendingAction.value === 'deactivate') return t('users.confirm_deactivate_title')
  if (pendingAction.value === 'reset_mfa') return t('users.confirm_reset_mfa_title')
  if (pendingAction.value === 'issue_password_reset') return t('users.confirm_password_reset_title')
  if (pendingAction.value === 'revoke_user_sessions') {
    return t('users.confirm_revoke_sessions_title')
  }
  return t('common.confirm_title') || 'Confirm admin action?'
})

const confirmDescription = computed<string>(() => {
  const target = store.selectedUser?.email ?? store.selectedUser?.subject_id ?? 'selected user'
  if (pendingAction.value === 'lock') return t('users.confirm_lock_desc', { target })
  if (pendingAction.value === 'deactivate') return t('users.confirm_deactivate_desc', { target })
  if (pendingAction.value === 'reset_mfa') return t('users.confirm_reset_mfa_desc', { target })
  if (pendingAction.value === 'issue_password_reset') {
    return t('users.confirm_password_reset_desc', { target })
  }
  if (pendingAction.value === 'revoke_user_sessions') {
    return t('users.confirm_revoke_sessions_desc', { target })
  }
  return t('common.confirm_desc') || 'Review the impact before continuing.'
})

const selectedSessionId = computed(
  () => store.sessions[0]?.session_id ?? store.sessions[0]?.id ?? null,
)
const selectedClientId = computed(() => store.sessions[0]?.client_id ?? null)
</script>

<template>
  <section class="users-page max-w-page mx-auto px-4 md:px-6 py-8" aria-labelledby="users-title">
    <div class="page-heading">
      <p class="eyebrow">{{ t('users.eyebrow') }}</p>
      <h1 id="users-title">{{ t('users.title') }}</h1>
      <p class="page-summary">{{ t('users.summary') }}</p>
    </div>

    <UiSkeleton v-if="store.status === 'loading'" :label="t('users.loading')" />

    <UiStatusView
      v-else-if="store.status === 'forbidden'"
      tone="forbidden"
      eyebrow="User Lifecycle"
      :title="t('users.forbidden_title')"
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
      :title="t('users.error_title')"
      :description="store.errorMessage ?? t('common.error_loading_desc')"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <div
      v-else
      class="users-layout"
      :class="{
        'users-layout--has-selection': store.selectedSubjectId !== null,
      }"
    >
      <!-- ─── Sidebar: searchable user list ─────────────────────────────── -->
      <aside class="users-list" :aria-label="t('users.title')">
        <UiEmptyState
          v-if="store.users.length === 0"
          :title="t('users.empty_title')"
          :description="t('users.empty_desc')"
        />

        <template v-else>
          <UiFormField id="search-users" :label="t('users.label_search')" class="users-search">
            <div class="users-search__control">
              <Search :size="16" class="users-search__icon" aria-hidden="true" />
              <UiInput
                id="search-users"
                v-model="searchQuery"
                :placeholder="t('users.search_placeholder')"
                autocomplete="off"
                class="users-search__input"
              />
              <button
                v-if="searchQuery"
                class="users-search__clear"
                type="button"
                :aria-label="t('common.btn_reset')"
                @click="searchQuery = ''"
              >
                <X :size="14" />
              </button>
            </div>
          </UiFormField>

          <ul class="user-cards-list" role="list">
            <li v-for="user in filteredUsers" :key="user.subject_id">
              <button
                class="user-card-item"
                type="button"
                :class="{
                  'user-card-item--active': user.subject_id === store.selectedSubjectId,
                }"
                :aria-current="user.subject_id === store.selectedSubjectId ? 'true' : undefined"
                @click="selectUser(user.subject_id)"
              >
                <span
                  class="user-card-item__avatar"
                  :style="avatarStyle(user.display_name ?? user.email)"
                  aria-hidden="true"
                >
                  {{ avatarInitial(user.display_name ?? user.email) }}
                </span>
                <span class="user-card-item__content">
                  <span class="user-card-item__name-row">
                    <span class="user-card-item__name">{{ user.display_name ?? user.email }}</span>
                    <span
                      class="user-card-item__badge"
                      :class="`badge--${user.effective_status ?? user.status ?? 'active'}`"
                    >
                      {{ user.effective_status ?? user.status ?? 'active' }}
                    </span>
                  </span>
                  <span class="user-card-item__email">{{ user.email }}</span>
                  <span class="user-card-item__meta">
                    <span class="user-card-item__role">{{ user.role ?? 'user' }}</span>
                  </span>
                </span>
              </button>
            </li>
          </ul>
        </template>

        <UiButton
          v-if="canWriteUsers"
          class="create-user-toggle users-list__create"
          @click="openCreateForm"
        >
          <Plus :size="16" />
          {{ t('users.btn_create_user') }}
        </UiButton>
      </aside>

      <!-- ─── Detail ────────────────────────────────────────────────────── -->
      <div v-if="store.selectedUser" class="user-detail-container">
        <!-- Mobile back button to list view -->
        <div class="user-detail-back-bar">
          <UiButton variant="secondary" size="sm" @click="store.selectedSubjectId = null">
            <ChevronLeft :size="16" />
            {{ t('common.back_to_list') }}
          </UiButton>
        </div>

        <!-- Hero -->
        <div class="user-detail-card user-profile-hero">
          <span
            class="user-profile-hero__avatar"
            :style="avatarStyle(store.selectedUser.display_name ?? store.selectedUser.email)"
            aria-hidden="true"
          >
            {{ avatarInitial(store.selectedUser.display_name ?? store.selectedUser.email) }}
          </span>
          <div class="user-profile-hero__content">
            <div class="user-profile-hero__header-row">
              <h2>
                {{ store.selectedUser.display_name ?? store.selectedUser.email }}
              </h2>
              <span
                class="ui-badge user-profile-hero__status-badge"
                :class="`badge--${store.selectedUser.effective_status ?? store.selectedUser.status ?? 'active'}`"
              >
                {{
                  store.selectedUser.effective_status ??
                  store.selectedUser.status ??
                  t('users.status_unknown')
                }}
              </span>
            </div>
            <p class="user-profile-hero__role">
              {{ store.selectedUser.role ?? t('users.status_unknown') }}
            </p>
            <p class="user-profile-hero__subid stat-value--with-copy">
              <span class="stat-value stat-value--truncate stat-value--mono" title="Kode akun">{{
                formatTechnicalPreview(store.selectedUser.subject_id)
              }}</span>
              <button
                class="pill__copy"
                type="button"
                :aria-label="(t('common.copy') || 'Salin') + ' kode akun'"
                :title="t('common.copy') || 'Salin'"
                @click="copyToClipboard(formatTechnicalPreview(store.selectedUser.subject_id))"
              >
                <Copy :size="14" />
              </button>
            </p>

            <div class="user-profile-hero__actions">
              <RouterLink
                :class="buttonVariants({ variant: 'secondary' })"
                :to="{
                  name: 'admin.audit',
                  query: {
                    consent: '1',
                    subject_id: store.selectedUser.subject_id,
                  },
                }"
              >
                <Eye :size="16" />
                {{ t('users.btn_consent_trail') }}
              </RouterLink>
            </div>
          </div>
        </div>

        <!-- Tab navigation -->
        <div class="user-detail-tabs" role="tablist" :aria-label="t('users.detail_tabs_label')">
          <button
            v-for="(tab, index) in detailTabs"
            :id="`user-tab-${tab.key}`"
            :key="tab.key"
            class="user-detail-tab"
            :class="{ 'user-detail-tab--active': activeDetailTab === tab.key }"
            type="button"
            role="tab"
            :aria-selected="activeDetailTab === tab.key ? 'true' : 'false'"
            :aria-controls="`user-panel-${tab.key}`"
            :tabindex="activeDetailTab === tab.key ? 0 : -1"
            @click="selectDetailTab(tab.key)"
            @keydown="onTabKeydown($event, index)"
          >
            <component :is="tab.icon" :size="16" aria-hidden="true" />
            {{ tab.label }}
          </button>
        </div>

        <!-- Cross-tab status (errors + reset evidence stay visible) -->
        <div
          v-if="store.errorMessage || store.passwordResetToken || store.auditEventId"
          class="user-detail-status"
          aria-live="polite"
        >
          <p v-if="store.errorMessage" class="ui-action-message" role="alert">
            {{ store.errorMessage }}
          </p>
          <p
            v-if="store.passwordResetToken || store.auditEventId"
            class="ui-action-message"
            role="status"
          >
            {{ t('users.password_reset_evidence') }}
          </p>
        </div>

        <!-- Panel: Overview -->
        <section
          id="user-panel-overview"
          class="user-detail-panel"
          role="tabpanel"
          aria-labelledby="user-tab-overview"
          tabindex="0"
          :hidden="activeDetailTab !== 'overview'"
        >
          <!-- Identity stats -->
          <div class="user-stats-grid">
            <div class="user-stat-card pill--full">
              <span class="user-stat-card__icon-wrapper"><Mail :size="18" /></span>
              <div class="user-stat-card__info">
                <div class="user-stat-card__label">
                  {{ t('users.label_email') }}
                </div>
                <div class="stat-value--with-copy">
                  <span
                    class="user-stat-card__value stat-value stat-value--truncate"
                    :title="store.selectedUser.email"
                    >{{ store.selectedUser.email }}</span
                  >
                  <button
                    class="pill__copy"
                    type="button"
                    :aria-label="t('common.copy') || 'Salin' + ' ' + t('users.label_email')"
                    :title="t('common.copy') || 'Salin'"
                    @click="copyToClipboard(store.selectedUser.email)"
                  >
                    <Copy :size="14" />
                  </button>
                </div>
              </div>
            </div>
            <div class="user-stat-card">
              <span class="user-stat-card__icon-wrapper"><CheckCircle :size="18" /></span>
              <div class="user-stat-card__info">
                <div class="user-stat-card__label">
                  {{ t('users.email_verified') }}
                </div>
                <div class="user-stat-card__value">
                  {{ dateFormat.smart(store.selectedUser.email_verified_at) }}
                </div>
              </div>
            </div>
            <div class="user-stat-card">
              <span class="user-stat-card__icon-wrapper"><Clock :size="18" /></span>
              <div class="user-stat-card__info">
                <div class="user-stat-card__label">
                  {{ t('users.last_login') }}
                </div>
                <div class="user-stat-card__value">
                  {{ dateFormat.smart(selectedUserLastLoginAt) }}
                </div>
              </div>
            </div>
            <div class="user-stat-card">
              <span class="user-stat-card__icon-wrapper">
                <Lock v-if="!store.selectedUser.local_account_enabled" :size="18" />
                <Unlock v-else :size="18" />
              </span>
              <div class="user-stat-card__info">
                <div class="user-stat-card__label">
                  {{ t('users.local_account') }}
                </div>
                <div class="user-stat-card__value">
                  {{
                    store.selectedUser.local_account_enabled
                      ? t('users.enabled')
                      : t('users.disabled')
                  }}
                </div>
              </div>
            </div>
          </div>

          <!-- Sync profile -->
          <div v-if="canWriteUsers" class="user-detail-card">
            <h3 class="user-detail-section-title">
              {{ t('users.sync_profile_title') }}
            </h3>
            <p v-if="store.selectedUser.profile_synced_at" class="user-detail-card__hint">
              {{ t('users.last_synced') }}:
              {{ dateFormat.smart(store.selectedUser.profile_synced_at) }}
            </p>
            <div class="user-form-grid user-form-grid-2">
              <UiFormField id="sync-email" :label="t('users.label_email')">
                <UiInput id="sync-email" v-model="syncEmail" name="sync-email" autocomplete="off" />
              </UiFormField>
              <UiFormField id="sync-given-name" :label="t('users.label_given_name')">
                <UiInput
                  id="sync-given-name"
                  v-model="syncGivenName"
                  name="sync-given-name"
                  autocomplete="off"
                />
              </UiFormField>
              <UiFormField id="sync-family-name" :label="t('users.label_family_name')">
                <UiInput
                  id="sync-family-name"
                  v-model="syncFamilyName"
                  name="sync-family-name"
                  autocomplete="off"
                />
              </UiFormField>
              <div class="ui-form-field">
                <span class="ui-form-field__label">
                  {{ t('users.label_display_name_preview') }}
                </span>
                <div
                  class="sync-profile-preview"
                  data-testid="sync-display-name-preview"
                  aria-live="polite"
                >
                  {{ syncDisplayNamePreview }}
                </div>
              </div>
            </div>
            <div class="user-detail-card__actions">
              <UiButton
                class="sync-profile-button"
                :disabled="store.actionStatus === 'loading'"
                @click="submitSyncProfile"
              >
                {{
                  store.actionStatus === 'loading'
                    ? t('common.syncing')
                    : t('users.btn_sync_profile')
                }}
              </UiButton>
            </div>
          </div>

          <!-- Assign roles -->
          <div v-if="canWriteRoles" class="user-detail-card">
            <h3 class="user-detail-section-title">
              {{ t('users.assign_roles_title') }}
            </h3>
            <div class="user-form-grid user-form-grid-1">
              <div class="role-selection-grid">
                <div v-for="role in rolesStore.roles" :key="role.slug" class="role-checkbox-item">
                  <label :for="`role-${role.slug}`" class="role-checkbox-label">
                    <input
                      :id="`role-${role.slug}`"
                      v-model="selectedRole"
                      type="radio"
                      :value="role.slug"
                      class="role-checkbox-input"
                    />
                    <span class="role-checkbox-custom"></span>
                    <span class="role-checkbox-text">
                      <span class="role-checkbox-name">{{ role.label || role.slug }}</span>
                      <span class="role-checkbox-slug">{{ role.slug }}</span>
                    </span>
                  </label>
                </div>
              </div>
            </div>
            <p v-if="selectedRole === ''" class="roles-selection-error">
              {{ t('users.roles_min_required') }}
            </p>
            <div class="user-detail-card__actions">
              <UiButton
                class="save-roles-button"
                :disabled="
                  store.actionStatus === 'loading' ||
                  rolesStore.status === 'loading' ||
                  selectedRole === ''
                "
                @click="submitAssignRoles"
              >
                {{
                  store.actionStatus === 'loading' ? t('common.saving') : t('users.btn_save_roles')
                }}
              </UiButton>
            </div>
          </div>
        </section>

        <!-- Panel: Security & MFA -->
        <section
          id="user-panel-security"
          class="user-detail-panel"
          role="tabpanel"
          aria-labelledby="user-tab-security"
          tabindex="0"
          :hidden="activeDetailTab !== 'security'"
        >
          <!-- MFA assurance -->
          <div class="user-detail-card">
            <h3 class="user-detail-section-title">
              {{ t('users.assurance_title') }}
            </h3>
            <div class="user-stats-grid user-stats-grid--auto">
              <div class="user-stat-card">
                <span class="user-stat-card__icon-wrapper"><ShieldAlert :size="18" /></span>
                <div class="user-stat-card__info">
                  <div class="user-stat-card__label">
                    {{ t('users.mfa_required') }}
                  </div>
                  <div class="user-stat-card__value">
                    {{ store.loginContext?.mfa_required ? t('users.yes') : t('users.no') }}
                  </div>
                </div>
              </div>
              <div class="user-stat-card">
                <span class="user-stat-card__icon-wrapper"><Globe :size="18" /></span>
                <div class="user-stat-card__info">
                  <div class="user-stat-card__label">
                    {{ t('users.ip_address') }}
                  </div>
                  <div
                    class="user-stat-card__value stat-value stat-value--truncate stat-value--mono"
                    :title="store.loginContext?.ip_address ?? ''"
                  >
                    {{ store.loginContext?.ip_address ?? t('users.no_evidence') }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Panel: Sessions -->
        <section
          id="user-panel-sessions"
          class="user-detail-panel"
          role="tabpanel"
          aria-labelledby="user-tab-sessions"
          tabindex="0"
          :hidden="activeDetailTab !== 'sessions'"
        >
          <!-- Sessions -->
          <div class="user-detail-card">
            <h3 class="user-detail-section-title">
              {{ t('users.sessions_title') }}
            </h3>
            <ul class="user-session-list">
              <li
                v-for="userSession in store.sessions"
                :key="userSession.session_id ?? userSession.id"
                class="user-session-list__item"
              >
                <div class="user-session-list__meta">
                  <span
                    class="user-session-list__client stat-value stat-value--truncate"
                    title="Aplikasi"
                  >
                    {{ formatFriendlyClientName(userSession.client_id) }}
                  </span>
                  <span
                    class="user-session-list__id stat-value stat-value--truncate stat-value--mono"
                    title="Kode sesi"
                  >
                    {{ formatTechnicalPreview(userSession.session_id ?? userSession.id) }}
                  </span>
                </div>
                <UiButton
                  v-if="canTerminateSessions"
                  variant="danger"
                  size="sm"
                  @click="revokeSingleSession(userSession.session_id ?? userSession.id)"
                >
                  {{ t('users.btn_revoke_session') }}
                </UiButton>
              </li>
            </ul>
            <p v-if="store.sessions.length === 0" class="user-detail-card__hint">
              {{ t('users.no_sessions') }}
            </p>
            <div v-if="canTerminateSessions" class="user-detail-card__actions">
              <UiButton
                class="revoke-user-sessions-button"
                variant="danger"
                @click="requestDestructiveAction('revoke_user_sessions')"
              >
                <ShieldX :size="16" />
                {{ t('users.btn_revoke_sessions') }}
              </UiButton>
            </div>
          </div>
        </section>

        <!-- Panel: Lifecycle (danger zone) -->
        <section
          v-if="canLockUsers || canWriteUsers"
          id="user-panel-lifecycle"
          class="user-detail-panel"
          role="tabpanel"
          aria-labelledby="user-tab-lifecycle"
          tabindex="0"
          :hidden="activeDetailTab !== 'lifecycle'"
        >
          <!-- Lifecycle actions -->
          <div class="user-detail-card user-detail-card--danger">
            <h3 class="user-detail-section-title user-detail-section-title--danger">
              {{ t('users.lifecycle_title') }}
            </h3>
            <UiFormField id="lifecycle-reason" :label="t('users.label_reason')">
              <UiInput
                id="lifecycle-reason"
                v-model="reason"
                name="lifecycle-reason"
                autocomplete="off"
              />
            </UiFormField>

            <div class="user-detail__sub-actions">
              <h4 class="user-detail__sub-actions-title">
                {{ t('users.group_account_status') }}
              </h4>
              <div class="user-detail__action-row">
                <UiButton
                  v-if="canLockUsers"
                  class="lifecycle-lock-button"
                  variant="danger"
                  :disabled="
                    store.actionStatus === 'loading' ||
                    effectiveStatus === 'locked' ||
                    effectiveStatus === 'disabled' ||
                    effectiveStatus === 'deactivated'
                  "
                  @click="requestDestructiveAction('lock')"
                >
                  <Lock :size="14" />
                  {{ t('users.btn_lock') }}
                </UiButton>
                <UiButton
                  v-if="canLockUsers"
                  class="lifecycle-unlock-button"
                  :disabled="store.actionStatus === 'loading' || effectiveStatus !== 'locked'"
                  @click="store.unlockSelected(reason)"
                >
                  <Unlock :size="14" />
                  {{ t('users.btn_unlock') }}
                </UiButton>
                <UiButton
                  v-if="canWriteUsers"
                  class="lifecycle-deactivate-button"
                  variant="danger"
                  :disabled="
                    store.actionStatus === 'loading' ||
                    effectiveStatus === 'disabled' ||
                    effectiveStatus === 'deactivated'
                  "
                  @click="requestDestructiveAction('deactivate')"
                >
                  <ShieldX :size="14" />
                  {{ t('users.btn_deactivate') }}
                </UiButton>
                <UiButton
                  v-if="canWriteUsers"
                  class="lifecycle-reactivate-button"
                  :disabled="
                    store.actionStatus === 'loading' ||
                    (effectiveStatus !== 'disabled' && effectiveStatus !== 'deactivated')
                  "
                  @click="store.reactivateSelected"
                >
                  <UserCheck :size="14" />
                  {{ t('users.btn_reactivate') }}
                </UiButton>
              </div>
            </div>

            <div v-if="canWriteUsers" class="user-detail__sub-actions">
              <h4 class="user-detail__sub-actions-title">
                {{ t('users.group_credentials') }}
              </h4>
              <div class="user-detail__action-row">
                <UiButton
                  class="lifecycle-reset-mfa-button"
                  variant="danger"
                  :disabled="
                    store.actionStatus === 'loading' ||
                    effectiveStatus === 'disabled' ||
                    effectiveStatus === 'deactivated'
                  "
                  @click="requestDestructiveAction('reset_mfa')"
                >
                  <ShieldAlert :size="14" />
                  {{ t('users.btn_reset_mfa') }}
                </UiButton>
                <UiButton
                  variant="danger"
                  :disabled="
                    store.actionStatus === 'loading' ||
                    effectiveStatus === 'disabled' ||
                    effectiveStatus === 'deactivated'
                  "
                  @click="requestDestructiveAction('issue_password_reset')"
                >
                  <Key :size="14" />
                  {{ t('users.btn_issue_reset') }}
                </UiButton>
              </div>
            </div>
          </div>
        </section>

        <EvidenceContextPanel
          title="Lifecycle evidence"
          :request-id="store.requestId"
          :audit-event-id="store.auditEventId"
          :session-id="selectedSessionId"
          :client-id="selectedClientId"
          :subject-id="store.selectedUser.subject_id"
        />
      </div>

      <div v-else class="user-detail-empty">
        <UiEmptyState
          :title="t('users.select_user_title')"
          :description="t('users.select_user_desc')"
        />
      </div>
    </div>

    <EvidenceContextPanel
      v-if="!store.selectedUser"
      title="Users evidence"
      :request-id="store.requestId"
    />

    <ConfirmDialog
      :open="pendingAction !== null"
      :title="confirmTitle"
      :description="confirmDescription"
      :confirm-label="t('common.btn_continue')"
      :cancel-label="t('common.btn_cancel')"
      @confirm="confirmDestructiveAction"
      @cancel="cancelDestructiveAction"
    />
  </section>
</template>
