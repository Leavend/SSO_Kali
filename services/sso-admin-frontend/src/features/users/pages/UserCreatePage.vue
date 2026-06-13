<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Check, X } from 'lucide-vue-next'
import UiButton from '@/components/ui/UiButton.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import FormPageShell from '@/components/form/FormPageShell.vue'
import FormSection from '@/components/form/FormSection.vue'
import { useI18n } from '@/composables/useI18n'
import { composeProfileDisplayName } from '@/lib/display-name'
import { useUsersStore } from '../stores/users.store'
import { useToast } from '@/components/ui/useToast'
import {
  isManagedUserPasswordValid,
  managedUserPasswordRequirements,
} from '../lib/managed-user-password-policy'
import type { CreateUserPayload, CreateUserResponse } from '../types'

const store = useUsersStore()
const { t } = useI18n()
const router = useRouter()
const toast = useToast()

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
  if (!value) return undefined
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value)) return t('users.validation_email')
  const duplicate = store.users.some((user) => user.email.toLowerCase() === value)
  return duplicate ? t('users.validation_email_duplicate') : undefined
})

const displayNameError = computed(() => {
  if (displayName.value.trim() === '') return t('users.validation_display_name')
  return undefined
})

const passwordError = computed(() => {
  if (!isLocalAccountEnabled.value) return undefined
  if (password.value === '') return undefined // Password can be optional
  return isManagedUserPasswordValid(password.value) ? undefined : t('users.validation_password')
})

const isInvalid = computed(() => {
  if (!email.value || !displayName.value) return true
  return Boolean(emailError.value || displayNameError.value || passwordError.value)
})

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

async function submit(): Promise<void> {
  if (isInvalid.value || store.actionStatus === 'loading') return
  await store.createUser(payload())
  if (store.actionStatus !== 'success') {
    if (store.actionStatus === 'step_up_required') {
      return
    }
    toast.pushToast({
      tone: 'error',
      title: 'Gagal membuat user',
      description: store.errorMessage || 'Terjadi kesalahan tidak dikenal.',
    })
    return
  }

  handleUserCreated(store.deliveryStatus ?? 'none')
  router.push({ name: 'admin.users' })
}

function cancel(): void {
  router.push({ name: 'admin.users' })
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

function handleUserCreated(deliveryStatus: CreateUserResponse['delivery_status']): void {
  const messages = {
    queued: {
      tone: 'success' as const,
      title: t('users.create_user_success_title'),
      description: t('users.create_user_success_desc'),
    },
    none: {
      tone: 'info' as const,
      title: t('users.create_user_no_email_title'),
      description: t('users.create_user_no_email_desc'),
    },
    failed: {
      tone: 'error' as const,
      title: t('users.create_user_partial_failure_title'),
      description: t('users.create_user_partial_failure_desc'),
    },
  }
  if (deliveryStatus) toast.pushToast(messages[deliveryStatus])
}

function markDisplayNameManual(): void {
  isDisplayNameManual.value = true
}
</script>

<template>
  <FormPageShell
    :parent-label="t('menu.users')"
    :active-label="t('common.btn_create')"
    :title="t('users.create_user_title')"
    :description="t('users.create_user_dialog_description')"
    :submit-label="t('users.btn_create_user')"
    :cancel-label="t('common.btn_cancel')"
    :is-submitting="store.actionStatus === 'loading'"
    :is-invalid="isInvalid"
    @submit="submit"
    @cancel="cancel"
  >
    <div v-if="store.errorMessage" class="ui-action-message ui-action-message--error mb-6" role="alert">
      {{ store.errorMessage }}
    </div>

    <!-- Section 1: Identitas -->
    <FormSection
      :title="t('common.identity')"
      description="Masukkan data identitas dasar pengguna baru."
    >
      <UiFormField
        id="create_email"
        :label="t('users.label_email')"
        :error="emailError"
        required
      >
        <UiInput
          id="create_email"
          v-model="email"
          name="create_email"
          type="email"
          autocomplete="off"
          placeholder="user@company.com"
          :invalid="Boolean(emailError)"
        />
      </UiFormField>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <UiFormField id="create_given_name" :label="t('users.label_given_name')">
          <UiInput
            id="create_given_name"
            v-model="givenName"
            name="create_given_name"
            autocomplete="off"
            placeholder="John"
          />
        </UiFormField>
        <UiFormField id="create_family_name" :label="t('users.label_family_name')">
          <UiInput
            id="create_family_name"
            v-model="familyName"
            name="create_family_name"
            autocomplete="off"
            placeholder="Doe"
          />
        </UiFormField>
      </div>

      <UiFormField
        id="create_display_name"
        :label="t('users.label_display_name')"
        :error="displayNameError"
        required
      >
        <UiInput
          id="create_display_name"
          v-model="displayName"
          name="create_display_name"
          autocomplete="off"
          placeholder="John Doe"
          :invalid="Boolean(displayNameError)"
          @input="markDisplayNameManual"
        />
        <p class="text-xs text-muted-foreground mt-1">
          {{ t('users.label_display_name_preview') }}: <strong class="text-foreground">{{ displayNamePreview }}</strong>
        </p>
      </UiFormField>
    </FormSection>

    <!-- Section 2: Akses & Keamanan -->
    <FormSection
      :title="t('common.access')"
      description="Konfigurasikan peran tingkat administratif dan metode kredensial masuk."
    >
      <UiFormField id="create_role" :label="t('users.label_role')" required>
        <UiSelect id="create_role" v-model="role" name="create_role" :options="roleOptions" />
      </UiFormField>

      <div class="border border-border rounded-xl p-4 bg-card/20 space-y-4">
        <div class="flex items-center justify-between">
          <div class="grid gap-0.5">
            <span class="text-xs font-semibold text-foreground">{{ t('users.label_local_account') }}</span>
            <span class="text-[11px] text-muted-foreground leading-relaxed">
              {{ t('users.label_local_account_helper') }}
            </span>
          </div>
          <UiSwitch v-model="isLocalAccountEnabled" :label="t('users.label_local_account')" class="sr-only" />
          <input
            type="checkbox"
            v-model="isLocalAccountEnabled"
            class="accent-primary rounded border-border w-9 h-5 cursor-pointer"
          />
        </div>

        <div v-if="isLocalAccountEnabled" class="pt-4 border-t border-border space-y-3">
          <UiFormField
            id="create_password"
            :label="t('users.label_password')"
            :error="passwordError"
          >
            <UiInput
              id="create_password"
              v-model="password"
              name="create_password"
              type="password"
              autocomplete="new-password"
              placeholder="••••••••••••"
              :invalid="Boolean(passwordError)"
            />
            <p class="text-xs text-muted-foreground mt-1">
              {{ t('users.label_password_helper') }}
            </p>
          </UiFormField>

          <!-- Password Checklist -->
          <ul v-if="password" class="space-y-1.5 list-none p-0 m-0" aria-live="polite">
            <li
              v-for="requirement in passwordRequirements"
              :key="requirement.id"
              class="flex items-center gap-2 text-xs font-medium"
              :class="requirement.met ? 'text-success-700' : 'text-destructive'"
            >
              <Check v-if="requirement.met" :size="14" aria-hidden="true" />
              <X v-else :size="14" aria-hidden="true" />
              {{ t(requirement.labelKey) }}
            </li>
          </ul>
        </div>
      </div>
    </FormSection>
  </FormPageShell>
</template>
