<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check, X } from 'lucide-vue-next'
import UiButton from '@/components/ui/UiButton.vue'
import UiDialog from '@/components/ui/UiDialog.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { useI18n } from '@/composables/useI18n'
import { composeProfileDisplayName } from '@/lib/display-name'
import { useUsersStore } from '../stores/users.store'
import {
  isManagedUserPasswordValid,
  managedUserPasswordRequirements,
} from '../lib/managed-user-password-policy'
import type { CreateUserPayload, CreateUserResponse } from '../types'

interface Props {
  readonly open: boolean
}

interface Emits {
  (event: 'close'): void
  (event: 'created', deliveryStatus: CreateUserResponse['delivery_status']): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()
const store = useUsersStore()
const { t } = useI18n()
const email = ref('')
const displayName = ref('')
const givenName = ref('')
const familyName = ref('')
const role = ref<'admin' | 'user'>('user')
const password = ref('')
const isLocalAccountEnabled = ref(true)
const isDisplayNameManual = ref(false)
const displayNamePreview = computed(
  () => composeProfileDisplayName(givenName.value, familyName.value) ?? '—',
)
const passwordRequirements = computed(() => managedUserPasswordRequirements(password.value))
const emailError = computed(() => {
  const value = email.value.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value)) return t('users.validation_email')
  const duplicate = store.users.some((user) => user.email.toLowerCase() === value)
  return duplicate ? t('users.validation_email_duplicate') : undefined
})
const displayNameError = computed(() =>
  displayName.value.trim() === '' ? t('users.validation_display_name') : undefined,
)
const passwordError = computed(() =>
  isManagedUserPasswordValid(password.value) ? undefined : t('users.validation_password'),
)
const isInvalid = computed(() =>
  Boolean(emailError.value || displayNameError.value || passwordError.value),
)
const roleOptions = computed(() => [
  { value: 'user', label: t('users.role_user') },
  { value: 'admin', label: t('users.role_admin') },
])

watch([givenName, familyName], () => {
  if (!isDisplayNameManual.value)
    displayName.value = displayNamePreview.value === '—' ? '' : displayNamePreview.value
})

watch(isLocalAccountEnabled, (enabled) => {
  if (!enabled) password.value = ''
})

watch(
  () => props.open,
  (open) => {
    if (open) reset()
  },
)

async function submit(): Promise<void> {
  if (isInvalid.value || store.actionStatus === 'loading') return
  await store.createUser(payload())
  if (store.actionStatus !== 'success') return

  emit('created', store.deliveryStatus ?? undefined)
  close()
}

function payload(): CreateUserPayload {
  const given = givenName.value.trim()
  const family = familyName.value.trim()
  return {
    email: email.value.trim(),
    display_name: displayName.value.trim(),
    role: role.value,
    local_account_enabled: isLocalAccountEnabled.value,
    ...(given && { given_name: given }),
    ...(family && { family_name: family }),
    ...(password.value && { password: password.value }),
  }
}

function close(): void {
  reset()
  emit('close')
}

function reset(): void {
  email.value = ''
  displayName.value = ''
  givenName.value = ''
  familyName.value = ''
  role.value = 'user'
  password.value = ''
  isLocalAccountEnabled.value = true
  isDisplayNameManual.value = false
}

function markDisplayNameManual(): void {
  isDisplayNameManual.value = true
}
</script>

<template>
  <UiDialog
    :open="open"
    title-id="create-user-title"
    :title="t('users.create_user_title')"
    :description="t('users.create_user_dialog_description')"
    :close-label="t('common.btn_cancel')"
    @close="close"
  >
    <form
      data-testid="create-user-form"
      :aria-label="t('users.create_user_title')"
      @submit.prevent="submit"
    >
      <div class="user-modal-body">
        <div class="user-modal-group">
          <h4 class="user-modal-group-title">{{ t('common.identity') }}</h4>
          <UiFormField
            id="create-email"
            :label="t('users.label_email')"
            :error="emailError"
            required
          >
            <UiInput
              id="create-email"
              v-model="email"
              name="create-email"
              type="email"
              autocomplete="off"
              :invalid="Boolean(emailError)"
              aria-describedby="create-email-error"
            />
          </UiFormField>
          <div class="user-form-grid user-form-grid-2">
            <UiFormField id="create-given-name" :label="t('users.label_given_name')">
              <UiInput
                id="create-given-name"
                v-model="givenName"
                name="create-given-name"
                autocomplete="off"
              />
            </UiFormField>
            <UiFormField id="create-family-name" :label="t('users.label_family_name')">
              <UiInput
                id="create-family-name"
                v-model="familyName"
                name="create-family-name"
                autocomplete="off"
              />
            </UiFormField>
          </div>
          <UiFormField
            id="create-display-name"
            :label="t('users.label_display_name')"
            :error="displayNameError"
            required
          >
            <UiInput
              id="create-display-name"
              v-model="displayName"
              name="create-display-name"
              autocomplete="off"
              :invalid="Boolean(displayNameError)"
              aria-describedby="create-display-name-error"
              @input="markDisplayNameManual"
            />
            <p class="ui-field-hint">
              {{ t('users.label_display_name_preview') }}: <strong>{{ displayNamePreview }}</strong>
            </p>
          </UiFormField>
        </div>
        <div class="user-modal-group">
          <h4 class="user-modal-group-title">{{ t('common.access') }}</h4>
          <UiFormField id="create-role" :label="t('users.label_role')" required>
            <UiSelect id="create-role" v-model="role" name="create-role" :options="roleOptions" />
          </UiFormField>
          <UiFormField
            id="create-password"
            :label="t('users.label_password')"
            :hint="t('users.label_password_helper')"
            :error="passwordError"
          >
            <UiInput
              id="create-password"
              v-model="password"
              name="create-password"
              type="password"
              autocomplete="new-password"
              :disabled="!isLocalAccountEnabled"
              :invalid="Boolean(passwordError)"
              aria-describedby="create-password-error"
            />
          </UiFormField>
          <ul v-if="password" class="password-checklist" aria-live="polite">
            <li
              v-for="requirement in passwordRequirements"
              :key="requirement.id"
              :class="{ 'password-checklist__item--met': requirement.met }"
            >
              <Check v-if="requirement.met" :size="14" aria-hidden="true" />
              <X v-else :size="14" aria-hidden="true" />
              {{ t(requirement.labelKey) }}
            </li>
          </ul>
          <div class="user-modal-switch-field">
            <UiSwitch v-model="isLocalAccountEnabled" :label="t('users.label_local_account')" />
            <p class="ui-field-hint">{{ t('users.label_local_account_helper') }}</p>
          </div>
        </div>
      </div>
      <div class="user-modal-footer">
        <UiButton variant="secondary" type="button" @click="close">{{
          t('common.btn_cancel')
        }}</UiButton>
        <UiButton
          data-testid="create-user-submit"
          type="submit"
          :disabled="store.actionStatus === 'loading' || isInvalid"
        >
          {{ store.actionStatus === 'loading' ? t('common.creating') : t('users.btn_create_user') }}
        </UiButton>
      </div>
      <p v-if="store.actionStatus === 'step_up_required'" class="ui-action-message" role="alert">
        {{ store.errorMessage }}
      </p>
      <p v-if="store.actionStatus === 'error'" class="ui-action-message" role="alert">
        {{ store.errorMessage }}
      </p>
    </form>
  </UiDialog>
</template>
