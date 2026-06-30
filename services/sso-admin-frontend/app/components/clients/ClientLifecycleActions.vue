<script setup lang="ts">
import { computed, ref } from 'vue'
import type {
  ActivatePayload,
  AdminClientDetail,
  ClientStatus,
  DecommissionPayload,
  DisablePayload,
} from '@/types/clients.types'
import { CLIENT_ACTIONS, type ClientActionId } from '@/lib/clients/client-actions'
import { usePrivilegedAction } from '@/composables/usePrivilegedAction'
import PrivilegedActionDialog from '@/components/users/PrivilegedActionDialog.vue'
import { clientsApi } from '@/services/clients.api'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import UiButton from '@/components/ui/UiButton.vue'

const props = defineProps<{ client: AdminClientDetail }>()
const emit = defineEmits<{ done: []; deleted: [] }>()

const session = useSessionStore()
const { t } = useI18n()
const action = usePrivilegedAction<unknown>()

const activeAction = ref<ClientActionId | null>(null)
// `reason` doubles as the disable/decommission reason AND the delete type-to-confirm
// text (the reused PrivilegedActionDialog exposes a single `reason` field; the exact
// client_id match is enforced in onConfirm below).
const reason = ref('')
const confirmMismatch = ref(false)

const BTN_KEY: Record<ClientActionId, string> = {
  activate: 'btn_activate_client',
  disable: 'btn_disable_client',
  decommission: 'btn_decommission_client',
  delete: 'btn_delete_client',
}

const visibleActions = computed(() =>
  (Object.keys(CLIENT_ACTIONS) as ClientActionId[]).filter(
    (id) =>
      session.hasPermission(CLIENT_ACTIONS[id].permission) &&
      session.hasPermission(CLIENT_ACTIONS[id].secondaryPermission),
  ),
)
const hasAnyAction = computed(() => visibleActions.value.length > 0)

function isApplicable(id: ClientActionId): boolean {
  return CLIENT_ACTIONS[id].appliesTo.includes(props.client.status as ClientStatus)
}

const activeDescriptor = computed(() =>
  activeAction.value ? CLIENT_ACTIONS[activeAction.value] : null,
)
const dialogTitle = computed(() =>
  activeAction.value ? t(`clients.confirm_${activeAction.value}_title`) : '',
)
const dialogDescription = computed(() =>
  activeAction.value ? t(`clients.confirm_${activeAction.value}_desc`) : '',
)
const reasonLabel = computed(() => {
  switch (activeAction.value) {
    case 'disable':
      return t('clients.label_disable_reason')
    case 'decommission':
      return t('clients.label_decommission')
    case 'delete':
      return t('clients.label_delete_confirmation')
    default:
      return ''
  }
})
const dialogError = computed(() => {
  if (confirmMismatch.value) return t('clients.delete_confirmation_error')
  return action.failure.value ? t('common.error_generic') : null
})

function callApi(id: ClientActionId): Promise<unknown> {
  const cid = props.client.client_id
  switch (id) {
    case 'activate': {
      // Posts {} on purpose — the backend mints/derives the secret server-side
      // (no UI secret_hash path this phase).
      const payload: ActivatePayload = {}
      return clientsApi.activate(cid, payload)
    }
    case 'disable': {
      const payload: DisablePayload = { reason: reason.value.trim() }
      return clientsApi.disable(cid, payload)
    }
    case 'decommission': {
      const payload: DecommissionPayload = { reason: reason.value.trim() }
      return clientsApi.decommission(cid, payload)
    }
    case 'delete':
      return clientsApi.delete(cid)
  }
}

async function execute(id: ClientActionId): Promise<void> {
  const result = await action.run(() => callApi(id))
  // Failure stays visible in the dialog (REF + safe copy + step-up); no stale state.
  if (result === null) return
  activeAction.value = null
  reason.value = ''
  confirmMismatch.value = false
  if (id === 'delete') emit('deleted')
  else emit('done')
}

function onTrigger(id: ClientActionId): void {
  action.reset()
  reason.value = ''
  confirmMismatch.value = false
  activeAction.value = id
}

function onUpdateReason(value: string): void {
  reason.value = value
  confirmMismatch.value = false
}

function onConfirm(): void {
  const id = activeAction.value
  if (!id) return
  // Type-to-confirm gate: delete only runs when the typed value equals the client_id.
  if (CLIENT_ACTIONS[id].confirmByClientId && reason.value.trim() !== props.client.client_id) {
    confirmMismatch.value = true
    return
  }
  void execute(id)
}

function onCancel(): void {
  activeAction.value = null
  reason.value = ''
  confirmMismatch.value = false
  action.reset()
}
</script>

<template>
  <section class="client-actions" data-testid="client-lifecycle-actions">
    <h3 class="client-actions__title">{{ t('clients.lifecycle_title') }}</h3>
    <p class="client-actions__impact">{{ t('clients.lifecycle_impact') }}</p>

    <p v-if="!hasAnyAction" class="client-actions__none">{{ t('clients.actions_none') }}</p>

    <div v-if="hasAnyAction" class="client-actions__buttons" role="group">
      <UiButton
        v-for="id in visibleActions"
        :key="id"
        :data-action="id"
        :variant="CLIENT_ACTIONS[id].danger ? 'danger' : 'secondary'"
        :disabled="!isApplicable(id) || action.isSubmitting.value"
        @click="onTrigger(id)"
      >
        {{ t(`clients.${BTN_KEY[id]}`) }}
      </UiButton>
    </div>

    <PrivilegedActionDialog
      :open="activeAction !== null"
      :title="dialogTitle"
      :description="dialogDescription"
      :danger="activeDescriptor?.danger ?? false"
      :reason-label="reasonLabel"
      :reason-required="
        (activeDescriptor?.reason?.required ?? false) ||
        activeDescriptor?.confirmByClientId === true
      "
      :reason-min="activeDescriptor?.confirmByClientId ? 1 : activeDescriptor?.reason?.min"
      :reason-max="activeDescriptor?.reason?.max ?? 255"
      :reason="reason"
      :submitting="action.isSubmitting.value"
      :step-up-url="action.stepUpUrl.value"
      :step-up-label="t('clients.btn_step_up')"
      :error-message="dialogError"
      :request-id="action.requestId.value"
      @update:reason="onUpdateReason"
      @confirm="onConfirm"
      @cancel="onCancel"
    />
  </section>
</template>

<style scoped>
.client-actions {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--border);
}
.client-actions__title {
  margin: 0;
  font: 600 0.9375rem/1.2 var(--font-sans);
  color: var(--fg);
}
.client-actions__impact {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.client-actions__none {
  margin: 0;
  font: 400 0.875rem/1.5 var(--font-sans);
  color: var(--fg-3);
}
.client-actions__buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
</style>
