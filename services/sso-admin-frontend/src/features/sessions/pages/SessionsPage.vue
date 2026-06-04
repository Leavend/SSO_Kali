<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from '@/composables/useI18n'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import EvidenceContextPanel from '@/components/EvidenceContextPanel.vue'
import UiDataList, { type UiDataListRow } from '@/components/ui/UiDataList.vue'
import { useToast } from '@/components/ui/useToast'
import { useSessionStore } from '@/stores/session.store'
import { useSessionsStore } from '../stores/sessions.store'

const store = useSessionsStore()
const session = useSessionStore()
const { pushToast } = useToast()
const { t } = useI18n()
const canTerminateSessions = computed(() => session.hasPermission('admin.sessions.terminate'))
const pendingRevokeSessionId = ref<string | null>(null)
const sessionRows = computed<readonly UiDataListRow[]>(() =>
  store.sessions.map((adminSession) => ({
    id: adminSession.session_id,
    session_id: adminSession.session_id,
    client_id: adminSession.client_id,
    user_display_name: adminSession.user_display_name,
    ip_address: adminSession.ip_address,
  })),
)

const sessionColumns = computed(
  () =>
    [
      { key: 'session_id', label: t('sessions.col_session_id') },
      { key: 'client_id', label: t('sessions.col_client') },
      { key: 'user_display_name', label: t('sessions.col_user') },
      { key: 'ip_address', label: t('sessions.col_ip') },
    ] as const,
)

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

function requestRevokeSession(sessionId: string): void {
  pendingRevokeSessionId.value = sessionId
}

function cancelRevokeSession(): void {
  pendingRevokeSessionId.value = null
}

async function confirmRevokeSession(): Promise<void> {
  const sessionId = pendingRevokeSessionId.value
  pendingRevokeSessionId.value = null
  if (sessionId) await store.revokeSession(sessionId)
}

const confirmDescription = computed<string>(() =>
  pendingRevokeSessionId.value
    ? `This will terminate admin session ${pendingRevokeSessionId.value}.`
    : 'Review the impact before continuing.',
)
</script>

<template>
  <section class="sessions-page" aria-labelledby="sessions-title">
    <div class="page-heading">
      <h1 id="sessions-title">{{ t('sessions.title') }}</h1>
    </div>

    <div v-if="store.status === 'loading'" class="ui-card" role="status">
      {{ t('sessions.loading') }}
    </div>

    <div v-else-if="store.status === 'forbidden'" class="ui-card ui-card--danger" role="alert">
      <h2>{{ t('sessions.forbidden_title') }}</h2>
      <p>{{ store.errorMessage }}</p>
    </div>

    <div
      v-else-if="store.status === 'unauthenticated'"
      class="ui-card ui-card--danger"
      role="alert"
    >
      <h2>{{ t('sessions.session_expired_title') }}</h2>
      <p>{{ store.errorMessage }}</p>
    </div>

    <div v-else-if="store.status === 'error'" class="ui-card ui-card--danger" role="alert">
      <h2>{{ t('sessions.error_title') }}</h2>
      <p>{{ store.errorMessage }}</p>
    </div>

    <div v-else-if="store.sessions.length === 0" class="ui-card" role="status">
      <p>{{ t('sessions.empty') }}</p>
    </div>

    <div v-else>
      <UiDataList caption="Admin sessions" :columns="sessionColumns" :rows="sessionRows">
        <template #actions="{ row }">
          <button
            v-if="canTerminateSessions"
            class="revoke-button ui-action ui-action--danger"
            type="button"
            @click="requestRevokeSession(row.id)"
          >
            {{ t('sessions.btn_revoke') }}
          </button>
        </template>
      </UiDataList>

      <p v-if="store.actionStatus === 'step_up_required'" class="ui-action-message" role="alert">
        {{ store.errorMessage }}
      </p>
      <p v-if="store.actionStatus === 'error'" class="ui-action-message" role="alert">
        {{ store.errorMessage }}
      </p>

      <EvidenceContextPanel title="Sessions evidence" :request-id="store.requestId" />
    </div>

    <ConfirmDialog
      :open="pendingRevokeSessionId !== null"
      title="Revoke admin session?"
      :description="confirmDescription"
      confirm-label="Revoke"
      cancel-label="Cancel"
      @confirm="confirmRevokeSession"
      @cancel="cancelRevokeSession"
    />
  </section>
</template>
