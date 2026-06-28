<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check, X } from 'lucide-vue-next'
import { useI18n } from '@/composables/useI18n'
import { useSessionStore } from '@/stores/session.store'
import { useUsersList } from '@/composables/useUsersList'
import { usePrivilegedAction } from '@/composables/usePrivilegedAction'
import { usersApi } from '@/services/users.api'
import {
  isValidEmail,
  isValidBirthDate,
  isValidNik,
  isValidNip,
  isValidNisn,
  normalizeEmail,
} from '@/lib/users/user-identifiers'
import {
  evaluateManagedUserPassword,
  type PasswordRequirementId,
} from '@/lib/users/managed-user-password-policy'
import type { CreateUserPayload, CreateUserResponse } from '@/types/users.types'
import FormPageShell from '@/components/form/FormPageShell.vue'
import FormSection from '@/components/form/FormSection.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect, { type UiSelectOption } from '@/components/ui/UiSelect.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'

definePageMeta({
  name: 'admin.users.create',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.users.write'],
})

const { t } = useI18n()
const store = useSessionStore()
const action = usePrivilegedAction<CreateUserResponse>()

const { users } = useUsersList()
const canCheckDuplicates = computed(() => store.hasPermission('admin.users.read'))
const existingEmails = computed(() => new Set(users.value.map((u) => u.email.toLowerCase())))

// --- form state -------------------------------------------------------------
const email = ref('')
const givenName = ref('')
const familyName = ref('')
const displayName = ref('')
const role = ref<string>('user')
const isLocalAccountEnabled = ref(true)
const password = ref('')
const nik = ref('')
const nip = ref('')
const nisn = ref('')
const birthDate = ref('')
const isDisplayNameManual = ref(false)

const roleOptions = computed<readonly UiSelectOption[]>(() => [
  { value: 'user', label: t('users.role_user') },
  { value: 'admin', label: t('users.role_admin') },
  { value: 'pegawai', label: t('users.role_pegawai') },
])

function firstWord(value: string): string {
  return value.trim().split(/\s+/u).filter(Boolean)[0] ?? ''
}
const displayNamePreview = computed<string>(
  () => [firstWord(givenName.value), firstWord(familyName.value)].filter(Boolean).join(' ') || '—',
)
watch([givenName, familyName], () => {
  if (!isDisplayNameManual.value) {
    displayName.value = displayNamePreview.value === '—' ? '' : displayNamePreview.value
  }
})
watch(isLocalAccountEnabled, (enabled) => {
  if (!enabled) password.value = ''
})

const passwordRequirements = computed(() => evaluateManagedUserPassword(password.value))
function requirementLabel(id: PasswordRequirementId): string {
  return id === 'min_length'
    ? t('users.password_requirement_length')
    : t(`users.password_requirement_${id}`)
}

// --- validation -------------------------------------------------------------
const serverFieldErrors = computed(() => action.fieldErrors.value)
function serverError(field: string): string | undefined {
  return serverFieldErrors.value[field]?.[0]
}

const emailError = computed<string | undefined>(() => {
  const value = email.value.trim().toLowerCase()
  if (!value) return serverError('email')
  if (!isValidEmail(value)) return t('users.validation_email')
  if (canCheckDuplicates.value && existingEmails.value.has(value)) {
    return t('users.validation_email_duplicate')
  }
  return serverError('email')
})
const displayNameError = computed<string | undefined>(() =>
  displayName.value.trim() === '' ? t('users.validation_display_name') : undefined,
)
const passwordError = computed<string | undefined>(() => {
  if (!isLocalAccountEnabled.value || password.value === '') return undefined
  return passwordRequirements.value.every((r) => r.met) ? undefined : t('users.validation_password')
})
const nikError = computed<string | undefined>(() =>
  nik.value.trim() !== '' && !isValidNik(nik.value.trim())
    ? t('users.validation_nik')
    : serverError('nik'),
)
const nipError = computed<string | undefined>(() =>
  nip.value.trim() !== '' && !isValidNip(nip.value.trim())
    ? t('users.validation_nip')
    : serverError('nip'),
)
const nisnError = computed<string | undefined>(() =>
  nisn.value.trim() !== '' && !isValidNisn(nisn.value.trim())
    ? t('users.validation_nisn')
    : serverError('nisn'),
)
const birthDateError = computed<string | undefined>(() =>
  birthDate.value.trim() !== '' && !isValidBirthDate(birthDate.value.trim())
    ? t('users.validation_birth_date')
    : serverError('birth_date'),
)

const isInvalid = computed<boolean>(() => {
  if (!email.value.trim() || !displayName.value.trim()) return true
  return Boolean(
    emailError.value ||
    displayNameError.value ||
    passwordError.value ||
    nikError.value ||
    nipError.value ||
    nisnError.value ||
    birthDateError.value,
  )
})

// --- failure surface --------------------------------------------------------
const showFailure = computed<boolean>(() => {
  const s = action.status.value
  return (
    s === 'forbidden' ||
    s === 'unauthenticated' ||
    s === 'step_up_required' ||
    s === 'rate_limited' ||
    s === 'error'
  )
})
const failureTone = computed<'error' | 'forbidden' | 'step_up'>(() => {
  switch (action.status.value) {
    case 'forbidden':
      return 'forbidden'
    case 'unauthenticated':
    case 'step_up_required':
      return 'step_up'
    default:
      return 'error'
  }
})
const failureTitle = computed<string>(() => {
  switch (action.status.value) {
    case 'forbidden':
      return t('users.forbidden_title')
    case 'unauthenticated':
      return t('common.session_expired_title')
    case 'step_up_required':
      return t('users.step_up_required_title')
    case 'rate_limited':
      return t('users.rate_limited_title')
    default:
      return t('users.create_failed_title')
  }
})
const failureDescription = computed<string>(() => {
  switch (action.status.value) {
    case 'forbidden':
      return t('common.forbidden_desc')
    case 'unauthenticated':
      return t('common.session_expired_desc')
    case 'step_up_required':
      return t('users.step_up_required_desc')
    case 'rate_limited':
      return t('users.rate_limited_desc')
    default:
      return t('users.create_failed_desc')
  }
})

// --- submit -----------------------------------------------------------------
function buildPayload(): CreateUserPayload {
  const given = givenName.value.trim()
  const family = familyName.value.trim()
  const nikV = nik.value.trim()
  const nipV = nip.value.trim()
  const nisnV = nisn.value.trim()
  const birth = birthDate.value.trim()
  return {
    email: normalizeEmail(email.value),
    display_name: displayName.value.trim(),
    role: role.value as CreateUserPayload['role'],
    local_account_enabled: isLocalAccountEnabled.value,
    ...(given && { given_name: given }),
    ...(family && { family_name: family }),
    ...(isLocalAccountEnabled.value && password.value && { password: password.value }),
    ...(nikV && { nik: nikV }),
    ...(nipV && { nip: nipV }),
    ...(nisnV && { nisn: nisnV }),
    ...(birth && { birth_date: birth }),
  }
}

async function onSubmit(): Promise<void> {
  if (isInvalid.value || action.isSubmitting.value) return
  const created = await action.run(() => usersApi.create(buildPayload()))
  if (created) {
    await navigateTo({
      name: 'admin.users.detail',
      params: { subjectId: created.user.subject_id },
    })
  }
}

async function onCancel(): Promise<void> {
  await navigateTo({ name: 'admin.users' })
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
    :is-submitting="action.isSubmitting.value"
    :is-invalid="isInvalid"
    @submit="onSubmit"
    @cancel="onCancel"
  >
    <UiStatusView
      v-if="showFailure"
      :tone="failureTone"
      :eyebrow="t('menu.users')"
      :title="failureTitle"
      :description="failureDescription"
      :request-id="action.requestId.value ?? undefined"
      :standalone="false"
    >
      <template v-if="action.stepUpUrl.value" #actions>
        <a class="users-new__step-up" :href="action.stepUpUrl.value" data-testid="step-up-link">
          {{ t('users.btn_step_up') }}
        </a>
      </template>
    </UiStatusView>

    <FormSection :title="t('common.identity')">
      <UiFormField id="create_email" :label="t('users.label_email')" :error="emailError" required>
        <UiInput
          id="create_email"
          v-model="email"
          type="email"
          autocomplete="off"
          :invalid="Boolean(emailError)"
        />
      </UiFormField>

      <div class="users-new__row">
        <UiFormField id="create_given_name" :label="t('users.label_given_name')">
          <UiInput id="create_given_name" v-model="givenName" autocomplete="off" />
        </UiFormField>
        <UiFormField id="create_family_name" :label="t('users.label_family_name')">
          <UiInput id="create_family_name" v-model="familyName" autocomplete="off" />
        </UiFormField>
      </div>

      <UiFormField
        id="create_display_name"
        :label="t('users.label_display_name')"
        :hint="t('users.label_display_name_preview') + ': ' + displayNamePreview"
        :error="displayNameError"
        required
      >
        <UiInput
          id="create_display_name"
          v-model="displayName"
          autocomplete="off"
          :invalid="Boolean(displayNameError)"
          @input="isDisplayNameManual = true"
        />
      </UiFormField>
    </FormSection>

    <FormSection :title="t('common.access')">
      <UiFormField id="create_role" :label="t('users.label_role')" required>
        <UiSelect id="create_role" v-model="role" :options="roleOptions" />
      </UiFormField>
    </FormSection>

    <FormSection
      :title="t('users.section_credentials_title')"
      :description="t('users.section_credentials_desc')"
    >
      <UiSwitch v-model="isLocalAccountEnabled" :label="t('users.label_local_account')" />

      <template v-if="isLocalAccountEnabled">
        <UiFormField
          id="create_password"
          :label="t('users.label_password')"
          :hint="t('users.label_password_helper')"
          :error="passwordError"
        >
          <UiInput
            id="create_password"
            v-model="password"
            type="password"
            autocomplete="new-password"
            :invalid="Boolean(passwordError)"
          />
        </UiFormField>

        <ul v-if="password" data-password-checklist aria-live="polite" class="users-new__checklist">
          <li
            v-for="requirement in passwordRequirements"
            :key="requirement.id"
            :data-met="requirement.met ? 'true' : 'false'"
            class="users-new__requirement"
          >
            <Check v-if="requirement.met" :size="14" aria-hidden="true" />
            <X v-else :size="14" aria-hidden="true" />
            {{ requirementLabel(requirement.id) }}
          </li>
        </ul>
      </template>
    </FormSection>

    <FormSection
      :title="t('users.section_identifiers_title')"
      :description="t('users.section_identifiers_desc')"
    >
      <div class="users-new__row">
        <UiFormField id="create_nik" :label="t('users.label_nik')" :error="nikError">
          <UiInput
            id="create_nik"
            v-model="nik"
            inputmode="numeric"
            autocomplete="off"
            :invalid="Boolean(nikError)"
          />
        </UiFormField>
        <UiFormField id="create_nip" :label="t('users.label_nip')" :error="nipError">
          <UiInput
            id="create_nip"
            v-model="nip"
            inputmode="numeric"
            autocomplete="off"
            :invalid="Boolean(nipError)"
          />
        </UiFormField>
      </div>
      <div class="users-new__row">
        <UiFormField id="create_nisn" :label="t('users.label_nisn')" :error="nisnError">
          <UiInput
            id="create_nisn"
            v-model="nisn"
            inputmode="numeric"
            autocomplete="off"
            :invalid="Boolean(nisnError)"
          />
        </UiFormField>
        <UiFormField
          id="create_birth_date"
          :label="t('users.label_birth_date')"
          :error="birthDateError"
        >
          <UiInput
            id="create_birth_date"
            v-model="birthDate"
            type="date"
            autocomplete="off"
            :invalid="Boolean(birthDateError)"
          />
        </UiFormField>
      </div>
    </FormSection>
  </FormPageShell>
</template>

<style scoped>
.users-new__row {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}
.users-new__checklist {
  display: grid;
  gap: 6px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}
.users-new__requirement {
  display: flex;
  align-items: center;
  gap: 8px;
  font: 500 0.75rem/1.4 var(--font-sans);
  color: var(--fg-3);
}
.users-new__requirement[data-met='true'] {
  color: var(--success);
}
.users-new__step-up {
  font: 600 0.8125rem/1 var(--font-sans);
  color: var(--accent);
  text-decoration: underline;
}
</style>
