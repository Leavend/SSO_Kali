<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AdminClientDetail, ClientUpdatePayload } from '@/types/clients.types'
import { validateUriPolicy } from '@/lib/clients/client-create-form'
import { usePrivilegedAction } from '@/composables/usePrivilegedAction'
import { clientsApi } from '@/services/clients.api'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { formatSupportReference } from '@/lib/display-identifiers'
import UiButton from '@/components/ui/UiButton.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiTextarea from '@/components/ui/UiTextarea.vue'
import UiInput from '@/components/ui/UiInput.vue'

const props = defineProps<{ client: AdminClientDetail }>()
const emit = defineEmits<{ done: [] }>()

const session = useSessionStore()
const { t } = useI18n()
const action = usePrivilegedAction<unknown>()

const canWrite = computed(() => session.hasPermission('admin.clients.write'))

const form = ref({ redirect_uris: '', post_logout_redirect_uris: '', backchannel_logout_uri: '' })
function resetForm(): void {
  form.value = {
    redirect_uris: (props.client.redirect_uris ?? []).join('\n'),
    post_logout_redirect_uris: (props.client.post_logout_redirect_uris ?? []).join('\n'),
    backchannel_logout_uri: props.client.backchannel_logout_uri ?? '',
  }
}
resetForm()
watch(() => props.client.client_id, resetForm)

function parseLines(value: string): readonly string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

const redirectUris = computed(() => parseLines(form.value.redirect_uris))
const postLogoutUris = computed(() => parseLines(form.value.post_logout_redirect_uris))
const backchannel = computed(() => form.value.backchannel_logout_uri.trim())

// Single consolidated validator (Task 5.3) — returns a full clients.* i18n key or null.
const validationKey = computed(() =>
  validateUriPolicy({
    redirect_uris: redirectUris.value,
    post_logout_redirect_uris: postLogoutUris.value,
    backchannel_logout_uri: backchannel.value,
  }),
)
const failureRef = computed(() => formatSupportReference(action.requestId.value))

function buildPayload(): ClientUpdatePayload {
  return {
    redirect_uris: redirectUris.value,
    post_logout_redirect_uris: postLogoutUris.value,
    backchannel_logout_uri: backchannel.value === '' ? null : backchannel.value,
  }
}

async function submit(): Promise<void> {
  if (validationKey.value !== null) return
  const result = await action.run(() => clientsApi.update(props.client.client_id, buildPayload()))
  if (result === null) return
  emit('done')
}
</script>

<template>
  <form
    v-if="canWrite"
    class="client-form"
    data-testid="client-uri-policy-form"
    @submit.prevent="submit"
  >
    <h3 class="client-form__title">{{ t('clients.uri_policy_title') }}</h3>

    <UiFormField id="client-redirect-uris" :label="t('clients.label_redirect_uris')" required>
      <UiTextarea
        id="client-redirect-uris"
        :model-value="form.redirect_uris"
        @update:model-value="form.redirect_uris = $event"
      />
    </UiFormField>

    <UiFormField id="client-post-logout-uris" :label="t('clients.label_post_logout_uris')">
      <UiTextarea
        id="client-post-logout-uris"
        :model-value="form.post_logout_redirect_uris"
        @update:model-value="form.post_logout_redirect_uris = $event"
      />
    </UiFormField>

    <UiFormField id="client-backchannel-uri" :label="t('clients.label_backchannel_uri')">
      <UiInput
        id="client-backchannel-uri"
        :model-value="form.backchannel_logout_uri"
        @update:model-value="form.backchannel_logout_uri = $event"
      />
    </UiFormField>

    <p
      v-if="validationKey"
      data-testid="uri-policy-validation"
      class="client-form__validation"
      role="alert"
    >
      {{ t(validationKey) }}
    </p>

    <div
      v-if="action.failure.value"
      data-testid="uri-policy-error"
      class="client-form__error"
      role="alert"
    >
      <p>{{ t('common.error_generic') }}</p>
      <a
        v-if="action.stepUpUrl.value"
        :href="action.stepUpUrl.value"
        data-testid="uri-policy-stepup-link"
        class="client-form__stepup"
        >{{ t('clients.btn_step_up') }}</a
      >
      <p v-if="failureRef" class="client-form__ref">{{ failureRef }}</p>
    </div>

    <UiButton type="submit" :disabled="validationKey !== null || action.isSubmitting.value">
      {{ t('clients.btn_save_uri_policy') }}
    </UiButton>
  </form>
</template>

<style scoped>
.client-form {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--border);
}
.client-form__title {
  margin: 0;
  font: 600 0.9375rem/1.2 var(--font-sans);
  color: var(--fg);
}
.client-form__validation {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--danger);
}
.client-form__error {
  display: grid;
  gap: 4px;
  padding: 12px;
  border: 1px solid var(--danger);
  border-radius: var(--r-sm);
}
.client-form__error p {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--danger);
}
.client-form__stepup {
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--accent);
}
.client-form__ref {
  font-family: var(--font-mono);
  color: var(--fg-3);
}
</style>
