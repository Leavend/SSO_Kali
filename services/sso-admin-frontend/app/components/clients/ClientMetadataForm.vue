<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AdminClientDetail, ClientUpdatePayload } from '@/types/clients.types'
import { isValidOwnerEmail } from '@/lib/clients/client-create-form'
import { usePrivilegedAction } from '@/composables/usePrivilegedAction'
import { clientsApi } from '@/services/clients.api'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { formatSupportReference } from '@/lib/display-identifiers'
import UiButton from '@/components/ui/UiButton.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'

const props = defineProps<{ client: AdminClientDetail }>()
const emit = defineEmits<{ done: [] }>()

const session = useSessionStore()
const { t } = useI18n()
const action = usePrivilegedAction<unknown>()

const canWrite = computed(() => session.hasPermission('admin.clients.write'))

// Local form state seeded from the client — never a buffer passed by reference.
const form = ref({ display_name: '', owner_email: '' })
function resetForm(): void {
  form.value = {
    display_name: props.client.display_name ?? '',
    owner_email: props.client.owner_email ?? '',
  }
}
resetForm()
watch(() => props.client.client_id, resetForm)

const emailInvalid = computed(
  () => form.value.owner_email !== '' && !isValidOwnerEmail(form.value.owner_email),
)
const isInvalid = computed(() => form.value.display_name.trim() === '' || emailInvalid.value)
const ownerEmailError = computed(
  () => emailInvalid.value || (action.fieldErrors.value.owner_email?.length ?? 0) > 0,
)
const displayNameServerError = computed(
  () => (action.fieldErrors.value.display_name?.length ?? 0) > 0,
)
const failureRef = computed(() => formatSupportReference(action.requestId.value))

function buildPayload(): ClientUpdatePayload {
  return {
    display_name: form.value.display_name.trim(),
    owner_email: form.value.owner_email.trim(),
  }
}

async function submit(): Promise<void> {
  if (isInvalid.value) return
  const result = await action.run(() => clientsApi.update(props.client.client_id, buildPayload()))
  if (result === null) return
  emit('done')
}
</script>

<template>
  <form
    v-if="canWrite"
    class="client-form"
    data-testid="client-metadata-form"
    @submit.prevent="submit"
  >
    <h3 class="client-form__title">{{ t('clients.metadata_title') }}</h3>

    <UiFormField
      id="client-display-name"
      :label="t('clients.label_display_name')"
      :error="displayNameServerError ? t('clients.validation_display_name') : undefined"
      required
    >
      <UiInput
        id="client-display-name"
        :model-value="form.display_name"
        :invalid="displayNameServerError"
        @update:model-value="form.display_name = $event"
      />
    </UiFormField>

    <UiFormField
      id="client-owner-email"
      :label="t('clients.label_owner_email')"
      :error="ownerEmailError ? t('clients.validation_owner_email') : undefined"
    >
      <UiInput
        id="client-owner-email"
        :model-value="form.owner_email"
        :invalid="ownerEmailError"
        @update:model-value="form.owner_email = $event"
      />
    </UiFormField>

    <div
      v-if="action.failure.value"
      data-testid="metadata-error"
      class="client-form__error"
      role="alert"
    >
      <p>{{ t('common.error_generic') }}</p>
      <a
        v-if="action.stepUpUrl.value"
        :href="action.stepUpUrl.value"
        data-testid="metadata-stepup-link"
        class="client-form__stepup"
        >{{ t('clients.btn_step_up') }}</a
      >
      <p v-if="failureRef" class="client-form__ref">{{ failureRef }}</p>
    </div>

    <UiButton type="submit" :disabled="isInvalid || action.isSubmitting.value">
      {{ t('clients.btn_save_metadata') }}
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
