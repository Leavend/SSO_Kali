<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useUsersStore } from '../stores/users.store'

const store = useUsersStore()
const reason = ref('Admin review')

onMounted(() => {
  if (store.status === 'idle') void store.load()
})

async function selectUser(subjectId: string): Promise<void> {
  await store.selectUser(subjectId)
}
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

    <div v-if="store.status === 'loading'" class="state-card" role="status">Memuat users...</div>

    <div
      v-else-if="store.status === 'forbidden'"
      class="state-card state-card--danger"
      role="alert"
    >
      <h2>Akses users ditolak</h2>
      <p>{{ store.errorMessage }}</p>
    </div>

    <div
      v-else-if="store.status === 'unauthenticated'"
      class="state-card state-card--danger"
      role="alert"
    >
      <h2>Sesi admin berakhir</h2>
      <p>{{ store.errorMessage }}</p>
    </div>

    <div v-else-if="store.status === 'error'" class="state-card state-card--danger" role="alert">
      <h2>Users admin belum bisa dimuat</h2>
      <p>{{ store.errorMessage }}</p>
    </div>

    <div v-else class="users-layout">
      <aside class="users-list" aria-label="Daftar users admin">
        <button
          v-for="user in store.users"
          :key="user.subject_id"
          class="user-list-item"
          :class="{ 'user-list-item--active': user.subject_id === store.selectedSubjectId }"
          type="button"
          @click="selectUser(user.subject_id)"
        >
          <strong>{{ user.display_name ?? user.email }}</strong>
          <span>{{ user.email }}</span>
          <small>{{ user.status ?? 'unknown' }}</small>
        </button>

        <p v-if="store.users.length === 0" class="muted">Belum ada user.</p>
      </aside>

      <article v-if="store.selectedUser" class="user-detail">
        <header class="user-detail__header">
          <div>
            <p class="eyebrow">{{ store.selectedUser.role ?? 'role unknown' }}</p>
            <h2>{{ store.selectedUser.display_name ?? store.selectedUser.email }}</h2>
            <p>{{ store.selectedUser.subject_id }}</p>
          </div>
          <span class="status-pill">{{ store.selectedUser.status ?? 'unknown' }}</span>
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
        </section>

        <section class="detail-section detail-section--danger" aria-labelledby="actions-title">
          <h3 id="actions-title">Lifecycle actions</h3>
          <label class="reason-field">
            Reason
            <input v-model="reason" autocomplete="off" />
          </label>
          <div class="action-row compact-actions">
            <button class="danger-action" type="button" @click="store.lockSelected(reason)">
              Lock
            </button>
            <button class="primary-action" type="button" @click="store.unlockSelected(reason)">
              Unlock
            </button>
            <button class="danger-action" type="button" @click="store.deactivateSelected(reason)">
              Deactivate
            </button>
            <button class="primary-action" type="button" @click="store.reactivateSelected">
              Reactivate
            </button>
            <button class="danger-action" type="button" @click="store.resetMfaSelected(reason)">
              Reset MFA
            </button>
            <button class="danger-action" type="button" @click="store.issuePasswordResetSelected">
              Issue reset link
            </button>
          </div>
          <p v-if="store.errorMessage" class="action-message">{{ store.errorMessage }}</p>
          <p v-if="store.auditEventId" class="request-evidence">
            Audit event: {{ store.auditEventId }}
          </p>
          <div v-if="store.passwordResetToken" class="secret-reveal" role="status">
            <strong>Password reset token</strong>
            <code>{{ store.passwordResetToken }}</code>
            <button
              data-test="clear-password-reset-token"
              type="button"
              @click="store.clearPasswordResetToken"
            >
              Hapus token dari layar
            </button>
          </div>
        </section>
      </article>
    </div>

    <p v-if="store.requestId" class="request-evidence">Request ID: {{ store.requestId }}</p>
  </section>
</template>
