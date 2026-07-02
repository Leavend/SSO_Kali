<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AdminUserDetail, ReasonPayload, SyncProfilePayload } from '@/types/users.types'
import { USER_ACTIONS, type UserActionId } from '@/lib/users/user-actions'
import { usePrivilegedAction } from '@/composables/usePrivilegedAction'
import PrivilegedActionDialog from '@/components/users/PrivilegedActionDialog.vue'
import { usersApi } from '@/services/users.api'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { formatSupportReference } from '@/lib/display-identifiers'
import {
  isValidBirthDate,
  isValidEmail,
  isValidNik,
  isValidNip,
  isValidNisn,
  normalizeEmail,
} from '@/lib/users/user-identifiers'
import UiButton from '@/components/ui/UiButton.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'

const props = defineProps<{ user: AdminUserDetail }>()
const emit = defineEmits<{ done: [] }>()

const session = useSessionStore()
const { t } = useI18n()
const action = usePrivilegedAction<unknown>()
const profile = usePrivilegedAction<unknown>()

const activeAction = ref<UserActionId | null>(null)
const reason = ref('')
const passwordResetEvidence = ref<string | null>(null)

// The DIRECT (no-confirm) actions never open the dialog, so their failures need
// their own inline surface; the sync-profile form runs through `profile`. Both
// render only the redacted REF, never the raw correlation id.
const showDirectFailure = computed(
  () => action.failure.value !== null && activeAction.value === null,
)
const directFailureRef = computed(() => formatSupportReference(action.requestId.value))
const profileFailureRef = computed(() => formatSupportReference(profile.requestId.value))

// i18n key maps (reuse existing users.* keys; require/unrequire-MFA are new in this task).
const BTN_KEY: Record<UserActionId, string> = {
  lock: 'btn_lock',
  unlock: 'btn_unlock',
  deactivate: 'btn_deactivate',
  reactivate: 'btn_reactivate',
  reset_mfa: 'btn_reset_mfa',
  password_reset: 'btn_issue_reset',
  require_mfa: 'btn_require_mfa',
  unrequire_mfa: 'btn_unrequire_mfa',
}
const CONFIRM_KEY: Partial<Record<UserActionId, string>> = {
  lock: 'lock',
  deactivate: 'deactivate',
  reset_mfa: 'reset_mfa',
  password_reset: 'password_reset',
  require_mfa: 'require_mfa',
  unrequire_mfa: 'unrequire_mfa',
}

const visibleActions = computed(() =>
  (Object.keys(USER_ACTIONS) as UserActionId[]).filter((id) =>
    session.hasPermission(USER_ACTIONS[id].permission),
  ),
)
const hasAnyAction = computed(() => visibleActions.value.length > 0)

function isApplicable(id: UserActionId): boolean {
  const u = props.user
  switch (id) {
    case 'lock':
      return u.effective_status !== 'locked'
    case 'unlock':
      return u.effective_status === 'locked'
    case 'deactivate':
      return u.effective_status !== 'deactivated' && u.effective_status !== 'disabled'
    case 'reactivate':
      return u.effective_status === 'deactivated' || u.effective_status === 'disabled'
    case 'reset_mfa':
      return u.mfa_enrolled
    case 'password_reset':
      return u.local_account_enabled
    case 'require_mfa':
      return !u.mfa_mandatory
    case 'unrequire_mfa':
      return u.mfa_mandatory
  }
}

const activeDescriptor = computed(() =>
  activeAction.value ? USER_ACTIONS[activeAction.value] : null,
)
const dialogTitle = computed(() =>
  activeAction.value && CONFIRM_KEY[activeAction.value]
    ? t(`users.confirm_${CONFIRM_KEY[activeAction.value]}_title`)
    : '',
)
const dialogDescription = computed(() =>
  activeAction.value && CONFIRM_KEY[activeAction.value]
    ? t(`users.confirm_${CONFIRM_KEY[activeAction.value]}_desc`)
    : '',
)

function callApi(id: UserActionId): Promise<unknown> {
  const sub = props.user.subject_id
  const payload: ReasonPayload = { reason: reason.value.trim() }
  switch (id) {
    case 'lock':
      return usersApi.lock(sub, payload)
    case 'unlock':
      return usersApi.unlock(sub, payload)
    case 'deactivate':
      return usersApi.deactivate(sub, payload)
    case 'reactivate':
      return usersApi.reactivate(sub)
    case 'reset_mfa':
      return usersApi.resetMfa(sub, payload)
    case 'password_reset':
      return usersApi.issuePasswordReset(sub)
    case 'require_mfa':
      return usersApi.requireMfa(sub, payload)
    case 'unrequire_mfa':
      return usersApi.unrequireMfa(sub, payload)
  }
}

async function execute(id: UserActionId): Promise<void> {
  passwordResetEvidence.value = null
  const result = await action.run(() => callApi(id))
  // Failure is surfaced safely: the dialog (confirm actions) or the inline banner
  // (direct actions — activeAction stays null) shows safe copy + REF + step-up link.
  if (result === null) return
  activeAction.value = null
  reason.value = ''
  if (id === 'password_reset') passwordResetEvidence.value = t('users.password_reset_evidence')
  emit('done')
}

function onTrigger(id: UserActionId): void {
  action.reset()
  reason.value = ''
  if (USER_ACTIONS[id].confirmRequired) {
    activeAction.value = id
    return
  }
  void execute(id)
}

function onConfirm(): void {
  if (activeAction.value) void execute(activeAction.value)
}

function onCancel(): void {
  activeAction.value = null
  reason.value = ''
  action.reset()
}

// ── sync-profile (update) ──────────────────────────────────────────────────
const canWrite = computed(() => session.hasPermission('admin.users.write'))
const form = ref({
  email: '',
  display_name: '',
  given_name: '',
  family_name: '',
  nik: '',
  nip: '',
  nisn: '',
  birth_date: '',
})

const fieldErrors = computed(() => {
  const f = form.value
  return {
    email: f.email !== '' && !isValidEmail(f.email),
    nik: f.nik !== '' && !isValidNik(f.nik),
    nip: f.nip !== '' && !isValidNip(f.nip),
    nisn: f.nisn !== '' && !isValidNisn(f.nisn),
    birth_date: f.birth_date !== '' && !isValidBirthDate(f.birth_date),
  }
})
const isProfileDirty = computed(() => Object.values(form.value).some((v) => v.trim() !== ''))
const isProfileInvalid = computed(() => Object.values(fieldErrors.value).some(Boolean))

function buildProfilePayload(): SyncProfilePayload {
  const f = form.value
  return {
    ...(f.email && { email: normalizeEmail(f.email) }),
    ...(f.display_name && { display_name: f.display_name.trim() }),
    ...(f.given_name && { given_name: f.given_name.trim() }),
    ...(f.family_name && { family_name: f.family_name.trim() }),
    ...(f.nik && { nik: f.nik.trim() }),
    ...(f.nip && { nip: f.nip.trim() }),
    ...(f.nisn && { nisn: f.nisn.trim() }),
    ...(f.birth_date && { birth_date: f.birth_date.trim() }),
  }
}

async function submitProfile(): Promise<void> {
  if (!isProfileDirty.value || isProfileInvalid.value) return
  const result = await profile.run(() =>
    usersApi.syncProfile(props.user.subject_id, buildProfilePayload()),
  )
  if (result === null) return
  form.value = {
    email: '',
    display_name: '',
    given_name: '',
    family_name: '',
    nik: '',
    nip: '',
    nisn: '',
    birth_date: '',
  }
  emit('done')
}
</script>

<template>
  <section class="user-actions" data-testid="user-lifecycle-actions">
    <p v-if="!hasAnyAction && !canWrite" class="user-actions__none">
      {{ t('users.actions_none') }}
    </p>

    <div v-if="hasAnyAction" class="user-actions__buttons" role="group">
      <UiButton
        v-for="id in visibleActions"
        :key="id"
        :data-action="id"
        :variant="USER_ACTIONS[id].danger ? 'danger' : 'secondary'"
        :disabled="!isApplicable(id) || action.isSubmitting.value"
        @click="onTrigger(id)"
      >
        {{ t(`users.${BTN_KEY[id]}`) }}
      </UiButton>
    </div>

    <p
      v-if="passwordResetEvidence"
      data-testid="password-reset-evidence"
      class="user-actions__evidence"
    >
      {{ passwordResetEvidence }}
    </p>

    <PrivilegedActionDialog
      :open="activeAction !== null"
      :title="dialogTitle"
      :description="dialogDescription"
      :danger="activeDescriptor?.danger ?? false"
      :reason-label="t('users.label_reason')"
      :reason-required="activeDescriptor?.reason?.required ?? false"
      :reason-min="activeDescriptor?.reason?.min"
      :reason-max="activeDescriptor?.reason?.max"
      :reason="reason"
      :submitting="action.isSubmitting.value"
      :step-up-url="action.stepUpUrl.value"
      :step-up-label="t('users.btn_step_up')"
      :error-message="action.failure.value ? t('common.error_generic') : null"
      :request-id="action.requestId.value"
      @update:reason="reason = $event"
      @confirm="onConfirm"
      @cancel="onCancel"
    />

    <div
      v-if="showDirectFailure"
      data-testid="lifecycle-direct-failure"
      class="user-actions__failure"
      role="alert"
    >
      <p>{{ t('common.error_generic') }}</p>
      <a
        v-if="action.stepUpUrl.value"
        :href="action.stepUpUrl.value"
        data-testid="lifecycle-direct-stepup-link"
        class="user-actions__stepup"
      >
        {{ t('users.btn_step_up') }}
      </a>
      <p v-if="directFailureRef" class="user-actions__ref">{{ directFailureRef }}</p>
    </div>

    <form
      v-if="canWrite"
      class="user-actions__profile"
      data-testid="sync-profile-form"
      @submit.prevent="submitProfile"
    >
      <h3>{{ t('users.update_profile_title') }}</h3>
      <p>{{ t('users.update_profile_desc') }}</p>
      <UiFormField
        id="profile-email"
        :label="t('users.field_email')"
        :error="fieldErrors.email ? t('users.validation_email') : undefined"
      >
        <UiInput
          id="profile-email"
          :model-value="form.email"
          :invalid="fieldErrors.email"
          @update:model-value="form.email = $event"
        />
      </UiFormField>
      <UiFormField id="profile-display-name" :label="t('users.field_display_name')">
        <UiInput
          id="profile-display-name"
          :model-value="form.display_name"
          @update:model-value="form.display_name = $event"
        />
      </UiFormField>
      <UiFormField
        id="profile-nik"
        :label="t('users.field_nik')"
        :error="fieldErrors.nik ? t('users.validation_nik') : undefined"
      >
        <UiInput
          id="profile-nik"
          :model-value="form.nik"
          :invalid="fieldErrors.nik"
          @update:model-value="form.nik = $event"
        />
      </UiFormField>
      <UiFormField
        id="profile-nip"
        :label="t('users.field_nip')"
        :error="fieldErrors.nip ? t('users.validation_nip') : undefined"
      >
        <UiInput
          id="profile-nip"
          :model-value="form.nip"
          :invalid="fieldErrors.nip"
          @update:model-value="form.nip = $event"
        />
      </UiFormField>
      <UiFormField
        id="profile-nisn"
        :label="t('users.field_nisn')"
        :error="fieldErrors.nisn ? t('users.validation_nisn') : undefined"
      >
        <UiInput
          id="profile-nisn"
          :model-value="form.nisn"
          :invalid="fieldErrors.nisn"
          @update:model-value="form.nisn = $event"
        />
      </UiFormField>
      <UiFormField
        id="profile-birth-date"
        :label="t('users.field_birth_date')"
        :error="fieldErrors.birth_date ? t('users.validation_birth_date') : undefined"
      >
        <UiInput
          id="profile-birth-date"
          type="date"
          :model-value="form.birth_date"
          :invalid="fieldErrors.birth_date"
          @update:model-value="form.birth_date = $event"
        />
      </UiFormField>
      <div
        v-if="profile.failure.value"
        data-testid="profile-error"
        class="user-actions__failure"
        role="alert"
      >
        <p>{{ t('common.error_generic') }}</p>
        <a
          v-if="profile.stepUpUrl.value"
          :href="profile.stepUpUrl.value"
          data-testid="profile-stepup-link"
          class="user-actions__stepup"
          >{{ t('users.btn_step_up') }}</a
        >
        <p v-if="profileFailureRef" class="user-actions__ref">{{ profileFailureRef }}</p>
      </div>
      <UiButton
        type="submit"
        :disabled="!isProfileDirty || isProfileInvalid || profile.isSubmitting.value"
      >
        {{ t('users.btn_sync_profile') }}
      </UiButton>
    </form>
  </section>
</template>

<style scoped>
.user-actions {
  display: grid;
  gap: 16px;
  padding: 16px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-sm);
}
.user-actions__none {
  margin: 0;
  font: 400 0.875rem/1.5 var(--font-sans);
  color: var(--fg-3);
}
.user-actions__buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.user-actions__evidence {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.user-actions__failure {
  display: grid;
  gap: 4px;
  padding: 12px;
  background: var(--danger-soft);
  border: 1px solid var(--danger-soft-border);
  border-radius: var(--r-md);
}
.user-actions__failure p {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--danger-soft-fg);
}
.user-actions__stepup {
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--accent);
}
.user-actions__ref {
  font-family: var(--font-mono);
  color: var(--danger-soft-fg);
}
.user-actions__profile {
  display: grid;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
.user-actions__profile h3 {
  margin: 0;
  font: 600 0.9375rem/1.2 var(--font-sans);
  color: var(--fg);
}
.user-actions__profile > p {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
</style>
