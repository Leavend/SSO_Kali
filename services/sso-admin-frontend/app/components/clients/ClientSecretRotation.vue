<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AdminClientDetail, RotateSecretResponse } from '@/types/clients.types'
import { usePrivilegedAction } from '@/composables/usePrivilegedAction'
import PrivilegedActionDialog from '@/components/users/PrivilegedActionDialog.vue'
import ClientSecretReveal from '@/components/clients/ClientSecretReveal.vue'
import { buildClientEnvSnippet, extractRevealedSecret } from '@/lib/clients/client-secret'
import { clientsApi } from '@/services/clients.api'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import UiButton from '@/components/ui/UiButton.vue'

const props = defineProps<{ client: AdminClientDetail }>()
const emit = defineEmits<{ done: [] }>()

const session = useSessionStore()
const { t } = useI18n()
const action = usePrivilegedAction<RotateSecretResponse>()

const canWrite = computed(() => session.hasPermission('admin.clients.write'))
const confirming = ref(false)
// The ONLY place the rotated plaintext lives: a client-only ref — never
// useState/Pinia/localStorage/sessionStorage, never logged. Set from the POST
// response, nulled on reveal close. The reveal mounts under <ClientOnly>, so it
// can never enter the SSR HTML / __NUXT__ payload either.
const revealed = ref<string | null>(null)

const envSnippet = computed(() =>
  revealed.value === null
    ? ''
    : buildClientEnvSnippet({
        clientId: props.client.client_id,
        secret: revealed.value,
        redirectUri: props.client.redirect_uris[0],
        postLogoutUri: props.client.post_logout_redirect_uris?.[0],
        scopes: props.client.allowed_scopes,
      }),
)

function onTrigger(): void {
  action.reset()
  confirming.value = true
}

async function onConfirm(): Promise<void> {
  const result = await action.run(() => clientsApi.rotateSecret(props.client.client_id))
  if (result === null) return // failure stays in the dialog (safe copy + REF + step-up link)
  confirming.value = false
  const secret = extractRevealedSecret(result.rotation)
  if (secret === null) {
    emit('done') // defensive: no plaintext to show, still refresh the detail
    return
  }
  revealed.value = secret
}

function onCancel(): void {
  confirming.value = false
  action.reset()
}

function onRevealClose(): void {
  revealed.value = null // clear the one-time secret from memory
  emit('done') // refresh detail so has_secret_hash / secret_rotated_at update
}
</script>

<template>
  <section class="client-secret-rotation" data-testid="client-secret-rotation">
    <p v-if="!canWrite" class="client-secret-rotation__none">
      {{ t('clients.rotate_secret_unavailable') }}
    </p>

    <template v-else>
      <UiButton
        variant="danger"
        data-action="rotate-secret"
        :disabled="action.isSubmitting.value"
        @click="onTrigger"
      >
        {{ t('clients.btn_rotate_secret') }}
      </UiButton>

      <PrivilegedActionDialog
        :open="confirming"
        :title="t('clients.confirm_rotate_secret_title')"
        :description="t('clients.confirm_rotate_secret_desc')"
        :danger="true"
        :submitting="action.isSubmitting.value"
        :step-up-url="action.stepUpUrl.value"
        :step-up-label="t('users.btn_step_up')"
        :error-message="action.failure.value ? t('common.error_generic') : null"
        :request-id="action.requestId.value"
        @confirm="onConfirm"
        @cancel="onCancel"
      />

      <!-- The one-time secret reveal is browser-only: the rotated plaintext must
           never render server-side / serialize into __NUXT__. -->
      <ClientOnly>
        <ClientSecretReveal
          :open="revealed !== null"
          :client-id="client.client_id"
          :secret="revealed"
          :env-snippet="envSnippet"
          :title="t('clients.secret_rotated_title')"
          :description="t('clients.secret_rotated_desc')"
          :warning="t('clients.secret_reveal_warning')"
          :copy-label="t('clients.btn_copy_secret')"
          :clear-label="t('clients.btn_clear_secret')"
          :close-label="t('common.close')"
          @close="onRevealClose"
        />
      </ClientOnly>
    </template>
  </section>
</template>

<style scoped>
.client-secret-rotation {
  display: grid;
  gap: 12px;
  padding: 16px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-sm);
}
.client-secret-rotation__none {
  margin: 0;
  font: 400 0.875rem/1.5 var(--font-sans);
  color: var(--fg-3);
}
</style>
