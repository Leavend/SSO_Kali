<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import EvidenceContextPanel from '@/components/EvidenceContextPanel.vue'
import UiDataList, { type UiDataListRow } from '@/components/ui/UiDataList.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { useSessionStore } from '@/stores/session.store'
import { useUsersStore } from '../stores/users.store'
import { useSessionsStore } from '@/features/sessions/stores/sessions.store'
import type { CreateUserPayload, SyncProfilePayload } from '../types'

const store = useUsersStore()
const sessionsStore = useSessionsStore()
const session = useSessionStore()
const canWriteUsers = computed(() => session.hasPermission('admin.users.write'))
const canLockUsers = computed(() => session.hasPermission('admin.users.lock'))
const canTerminateSessions = computed(() => session.hasPermission('admin.sessions.terminate'))
const reason = ref('Admin review')
const showCreateForm = ref(false)
type DestructiveAction =
  | 'lock'
  | 'deactivate'
  | 'reset_mfa'
  | 'issue_password_reset'
  | 'revoke_user_sessions'
const pendingAction = ref<DestructiveAction | null>(null)

const createEmail = ref('')
const createDisplayName = ref('')
const createGivenName = ref('')
const createFamilyName = ref('')
const createRole = ref<'admin' | 'user'>('user')
const createPassword = ref('')
const createLocalAccountEnabled = ref(true)

const syncEmail = ref('')
const syncDisplayName = ref('')
const syncGivenName = ref('')
const syncFamilyName = ref('')
const createRoleOptions = [
  { value: 'user', label: 'user' },
  { value: 'admin', label: 'admin' },
] as const
const userColumns = [
  { key: 'name', label: 'User' },
  { key: 'email', label: 'Email' },
  { key: 'status', label: 'Status' },
] as const
const userRows = computed<readonly UiDataListRow[]>(() =>
  store.users.map((user) => ({
    id: user.subject_id,
    name: user.display_name ?? user.email,
    email: user.email,
    status: user.status ?? 'unknown',
  })),
)

watch(
  () => store.selectedUser,
  (user) => {
    syncEmail.value = user?.email ?? ''
    syncDisplayName.value = user?.display_name ?? ''
    syncGivenName.value = user?.given_name ?? ''
    syncFamilyName.value = user?.family_name ?? ''
  },
  { immediate: true },
)

async function submitSyncProfile(): Promise<void> {
  const email = syncEmail.value.trim()
  const displayName = syncDisplayName.value.trim()
  const givenName = syncGivenName.value.trim()
  const familyName = syncFamilyName.value.trim()
  const payload: SyncProfilePayload = {
    ...(email && { email }),
    ...(displayName && { display_name: displayName }),
    ...(givenName && { given_name: givenName }),
    ...(familyName && { family_name: familyName }),
  }
  await store.syncProfileSelected(payload)
}

const selectedSessionId = computed(
  () => store.sessions[0]?.session_id ?? store.sessions[0]?.id ?? null,
)
const selectedClientId = computed(() => store.sessions[0]?.client_id ?? null)

onMounted(() => {
  if (store.status === 'idle') void store.load()
})

async function selectUser(subjectId: string): Promise<void> {
  await store.selectUser(subjectId)
}

function resetCreateForm(): void {
  createEmail.value = ''
  createDisplayName.value = ''
  createGivenName.value = ''
  createFamilyName.value = ''
  createRole.value = 'user'
  createPassword.value = ''
  createLocalAccountEnabled.value = true
}

async function submitCreateUser(): Promise<void> {
  const payload: Record<string, string | boolean | 'admin' | 'user'> = {
    email: createEmail.value.trim(),
    display_name: createDisplayName.value.trim(),
    role: createRole.value,
    local_account_enabled: createLocalAccountEnabled.value,
  }
  if (createGivenName.value.trim()) payload.given_name = createGivenName.value.trim()
  if (createFamilyName.value.trim()) payload.family_name = createFamilyName.value.trim()
  if (createPassword.value) payload.password = createPassword.value

  await store.createUser(payload as CreateUserPayload)
  if (store.actionStatus === 'success') {
    resetCreateForm()
    showCreateForm.value = false
  }
}

function requestDestructiveAction(action: DestructiveAction): void {
  pendingAction.value = action
}

function cancelDestructiveAction(): void {
  pendingAction.value = null
}

async function confirmDestructiveAction(): Promise<void> {
  const action = pendingAction.value
  pendingAction.value = null
  if (action === 'lock') await store.lockSelected(reason.value)
  if (action === 'deactivate') await store.deactivateSelected(reason.value)
  if (action === 'reset_mfa') await store.resetMfaSelected(reason.value)
  if (action === 'issue_password_reset') await store.issuePasswordResetSelected()
  if (action === 'revoke_user_sessions' && store.selectedUser) {
    await sessionsStore.revokeUserSessions(store.selectedUser.subject_id)
  }
}

const confirmTitle = computed<string>(() => {
  if (pendingAction.value === 'lock') return 'Lock user?'
  if (pendingAction.value === 'deactivate') return 'Deactivate user?'
  if (pendingAction.value === 'reset_mfa') return 'Reset user MFA?'
  if (pendingAction.value === 'issue_password_reset') return 'Issue password reset?'
  if (pendingAction.value === 'revoke_user_sessions') return 'Revoke all user sessions?'
  return 'Confirm admin action?'
})

const confirmDescription = computed<string>(() => {
  const target = store.selectedUser?.email ?? store.selectedUser?.subject_id ?? 'selected user'
  if (pendingAction.value === 'lock') return `This will lock ${target} and may block sign-in.`
  if (pendingAction.value === 'deactivate') return `This will deactivate ${target}.`
  if (pendingAction.value === 'reset_mfa') return `This will remove MFA assurance for ${target}.`
  if (pendingAction.value === 'issue_password_reset') {
    return `This will issue a backend password reset workflow for ${target}.`
  }
  if (pendingAction.value === 'revoke_user_sessions') {
    return `This will terminate ${store.sessions.length} active session evidence item(s) for ${target}.`
  }
  return 'Review the impact before continuing.'
})
</script>

<template>
  <section class="users-page" aria-labelledby="users-title">
    <div class="page-heading">
      <p class="eyebrow">User Lifecycle</p>
      <h1 id="users-title">Users</h1>
      <p class="page-summary">
        Kelola status user, MFA support, reset lifecycle, dan evidence sesi.
      </p>
    </div>

    <UiSkeleton v-if="store.status === 'loading'" label="Memuat users" />

    <UiStatusView
      v-else-if="store.status === 'forbidden'"
      tone="forbidden"
      eyebrow="User Lifecycle"
      title="Akses users ditolak"
      :description="store.errorMessage ?? 'Kamu tidak memiliki izin untuk melihat users admin.'"
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
      title="Users admin belum bisa dimuat"
      :description="
        store.errorMessage ?? 'Coba muat ulang atau gunakan correlation ID untuk investigasi.'
      "
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <div v-else class="users-layout">
      <aside class="users-list" aria-label="Daftar users admin">
        <UiEmptyState
          v-if="store.users.length === 0"
          title="Belum ada user untuk ditampilkan."
          description="Buat user baru atau periksa filter dan permission admin."
        />

        <UiDataList v-else caption="Daftar users admin" :columns="userColumns" :rows="userRows">
          <template #actions="{ row }">
            <button
              class="secondary-action"
              :aria-current="row.id === store.selectedSubjectId ? 'true' : undefined"
              :aria-label="`View ${row.name}`"
              type="button"
              @click="selectUser(row.id)"
            >
              View
            </button>
          </template>
        </UiDataList>

        <button
          v-if="canWriteUsers"
          class="primary-action create-user-toggle"
          type="button"
          @click="showCreateForm = !showCreateForm"
        >
          {{ showCreateForm ? 'Cancel' : 'Create User' }}
        </button>

        <div v-if="canWriteUsers && showCreateForm" class="create-user-form">
          <h3>Create User</h3>
          <UiFormField id="create-email" label="Email" required>
            <UiInput
              id="create-email"
              v-model="createEmail"
              name="create-email"
              autocomplete="off"
            />
          </UiFormField>
          <UiFormField id="create-display-name" label="Display name" required>
            <UiInput
              id="create-display-name"
              v-model="createDisplayName"
              name="create-display-name"
              autocomplete="off"
            />
          </UiFormField>
          <UiFormField id="create-given-name" label="Given name">
            <UiInput
              id="create-given-name"
              v-model="createGivenName"
              name="create-given-name"
              autocomplete="off"
            />
          </UiFormField>
          <UiFormField id="create-family-name" label="Family name">
            <UiInput
              id="create-family-name"
              v-model="createFamilyName"
              name="create-family-name"
              autocomplete="off"
            />
          </UiFormField>
          <UiFormField id="create-role" label="Role" required>
            <UiSelect
              id="create-role"
              v-model="createRole"
              name="create-role"
              :options="createRoleOptions"
            />
          </UiFormField>
          <UiFormField id="create-password" label="Password (optional)">
            <UiInput
              id="create-password"
              v-model="createPassword"
              name="create-password"
              type="password"
              autocomplete="off"
            />
          </UiFormField>
          <UiSwitch v-model="createLocalAccountEnabled" label="Local account enabled" />
          <button
            class="primary-action"
            type="button"
            :disabled="store.actionStatus === 'loading'"
            @click="submitCreateUser"
          >
            {{ store.actionStatus === 'loading' ? 'Creating...' : 'Create' }}
          </button>
          <p
            v-if="store.actionStatus === 'step_up_required' && store.selectedSubjectId === null"
            class="action-message"
          >
            {{ store.errorMessage }}
          </p>
          <p v-if="store.actionStatus === 'error'" class="action-message">
            {{ store.errorMessage }}
          </p>
        </div>
      </aside>

      <article v-if="store.selectedUser" class="user-detail">
        <header class="user-detail__header">
          <div>
            <p class="eyebrow">{{ store.selectedUser.role ?? 'role unknown' }}</p>
            <h2>{{ store.selectedUser.display_name ?? store.selectedUser.email }}</h2>
            <p>{{ store.selectedUser.subject_id }}</p>
          </div>
          <div class="action-row compact-actions">
            <RouterLink
              class="primary-action"
              :to="{
                name: 'admin.audit',
                query: { consent: '1', subject_id: store.selectedUser.subject_id },
              }"
            >
              Consent trail
            </RouterLink>
            <span class="status-pill">{{ store.selectedUser.status ?? 'unknown' }}</span>
          </div>
        </header>

        <dl class="detail-grid">
          <div>
            <dt>Email</dt>
            <dd>{{ store.selectedUser.email }}</dd>
          </div>
          <div>
            <dt>Email verified</dt>
            <dd>{{ store.selectedUser.email_verified_at ?? 'Belum verified' }}</dd>
          </div>
          <div>
            <dt>Last login</dt>
            <dd>{{ store.selectedUser.last_login_at ?? 'Belum ada evidence' }}</dd>
          </div>
          <div>
            <dt>Local account</dt>
            <dd>{{ store.selectedUser.local_account_enabled ? 'Enabled' : 'Disabled' }}</dd>
          </div>
        </dl>

        <section v-if="canWriteUsers" class="detail-section" aria-labelledby="sync-title">
          <h3 id="sync-title">Sync Profile</h3>
          <p v-if="store.selectedUser.profile_synced_at" class="muted">
            Last synced: {{ store.selectedUser.profile_synced_at }}
          </p>
          <div class="create-user-form">
            <label class="reason-field">
              Email
              <input v-model="syncEmail" name="sync-email" autocomplete="off" />
            </label>
            <label class="reason-field">
              Display name
              <input v-model="syncDisplayName" name="sync-display-name" autocomplete="off" />
            </label>
            <label class="reason-field">
              Given name
              <input v-model="syncGivenName" name="sync-given-name" autocomplete="off" />
            </label>
            <label class="reason-field">
              Family name
              <input v-model="syncFamilyName" name="sync-family-name" autocomplete="off" />
            </label>
            <div class="action-row compact-actions">
              <button
                class="sync-profile-button primary-action"
                type="button"
                :disabled="store.actionStatus === 'loading'"
                @click="submitSyncProfile"
              >
                {{ store.actionStatus === 'loading' ? 'Syncing...' : 'Sync Profile' }}
              </button>
            </div>
          </div>
        </section>

        <section class="detail-section" aria-labelledby="assurance-title">
          <h3 id="assurance-title">MFA assurance / risk context</h3>
          <dl class="inline-evidence">
            <div>
              <dt>MFA required</dt>
              <dd>{{ store.loginContext?.mfa_required ? 'Yes' : 'No evidence' }}</dd>
            </div>
            <div>
              <dt>Risk score</dt>
              <dd>{{ store.loginContext?.risk_score ?? 'No evidence' }}</dd>
            </div>
            <div>
              <dt>IP</dt>
              <dd>{{ store.loginContext?.ip_address ?? 'No evidence' }}</dd>
            </div>
          </dl>
        </section>

        <section class="detail-section" aria-labelledby="sessions-title">
          <h3 id="sessions-title">Sessions</h3>
          <ul>
            <li v-for="session in store.sessions" :key="session.session_id ?? session.id">
              {{ session.session_id ?? session.id }} — {{ session.client_id ?? 'unknown client' }}
            </li>
          </ul>
          <p v-if="store.sessions.length === 0" class="muted">Tidak ada session evidence.</p>
          <button
            v-if="canTerminateSessions"
            class="revoke-user-sessions-button danger-action"
            type="button"
            @click="requestDestructiveAction('revoke_user_sessions')"
          >
            Revoke User Sessions
          </button>
        </section>

        <section
          v-if="canLockUsers || canWriteUsers"
          class="detail-section detail-section--danger"
          aria-labelledby="actions-title"
        >
          <h3 id="actions-title">Lifecycle actions</h3>
          <label class="reason-field">
            Reason
            <input v-model="reason" autocomplete="off" />
          </label>
          <div class="action-row compact-actions">
            <button
              v-if="canLockUsers"
              class="lifecycle-lock-button danger-action"
              type="button"
              @click="requestDestructiveAction('lock')"
            >
              Lock
            </button>
            <button
              v-if="canLockUsers"
              class="primary-action"
              type="button"
              @click="store.unlockSelected(reason)"
            >
              Unlock
            </button>
            <button
              v-if="canWriteUsers"
              class="danger-action"
              type="button"
              @click="requestDestructiveAction('deactivate')"
            >
              Deactivate
            </button>
            <button
              v-if="canWriteUsers"
              class="primary-action"
              type="button"
              @click="store.reactivateSelected"
            >
              Reactivate
            </button>
            <button
              v-if="canWriteUsers"
              class="lifecycle-reset-mfa-button danger-action"
              type="button"
              @click="requestDestructiveAction('reset_mfa')"
            >
              Reset MFA
            </button>
            <button
              v-if="canWriteUsers"
              class="danger-action"
              type="button"
              @click="requestDestructiveAction('issue_password_reset')"
            >
              Issue reset link
            </button>
          </div>
          <p v-if="store.errorMessage" class="action-message">{{ store.errorMessage }}</p>
          <p
            v-if="store.passwordResetToken || store.auditEventId"
            class="action-message"
            role="status"
          >
            Password reset dikirim melalui channel aman backend. Gunakan audit evidence untuk
            pelacakan.
          </p>
        </section>

        <EvidenceContextPanel
          title="Lifecycle evidence"
          :request-id="store.requestId"
          :audit-event-id="store.auditEventId"
          :session-id="selectedSessionId"
          :client-id="selectedClientId"
          :subject-id="store.selectedUser.subject_id"
        />
      </article>
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
      confirm-label="Continue"
      cancel-label="Cancel"
      @confirm="confirmDestructiveAction"
      @cancel="cancelDestructiveAction"
    />
  </section>
</template>
