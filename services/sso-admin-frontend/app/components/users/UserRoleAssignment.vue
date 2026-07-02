<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from '@/composables/useI18n'
import { usePrivilegedAction } from '@/composables/usePrivilegedAction'
import { rolesApi } from '@/services/roles.api'
import { usersApi } from '@/services/users.api'
import { useSessionStore } from '@/stores/session.store'
import { resolveBootstrapFailure } from '@/lib/auth/admin-guard-resolver'
import { formatSupportReference } from '@/lib/display-identifiers'
import UiAlertDialog from '@/components/ui/UiAlertDialog.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import type { AdminUserDetail, RolesResponse, UserRoleResponse } from '@/types/users.types'

const props = defineProps<{ readonly user: AdminUserDetail }>()
const emit = defineEmits<{ (e: 'done'): void }>()

const { t } = useI18n()
const session = useSessionStore()
const action = usePrivilegedAction<UserRoleResponse>()

// Reading the role catalog (GET /admin/api/roles) is gated by admin.roles.read
// (extract-backend #14) — distinct from admin.roles.write, which only gates the
// submit. Both are UX minimization; the proxy + AdminGuard remain the boundary.
const canReadRoles = computed<boolean>(() => session.hasPermission('admin.roles.read'))
const canAssign = computed<boolean>(() => session.hasPermission('admin.roles.write'))
// A role change on the admin's OWN subject can invalidate the current session,
// so we re-verify it after a successful self-assignment.
const isSelf = computed<boolean>(() => props.user.subject_id === session.principal?.subject_id)

// Roles resolve server-side and hydrate (governance DTO — no token/secret/PII).
// Fail closed: only fetch when permitted, and treat any fetch error as an empty
// catalog behind a safe notice rather than an unhandled useAsyncData rejection.
const { data: rolesData, error: rolesError } = useAsyncData<RolesResponse>(
  'admin-roles-list',
  () => (canReadRoles.value ? rolesApi.list() : Promise.resolve({ roles: [] })),
)
const rolesUnavailable = computed<boolean>(() => !canReadRoles.value || rolesError.value != null)
const roles = computed(() => (rolesUnavailable.value ? [] : (rolesData.value?.roles ?? [])))

// The backend enforces `role_slugs` array size:1 — a radio group is the natural
// single-primary-role control; we always submit exactly one slug.
const selected = ref<string>(props.user.roles[0]?.slug ?? '')

// Confirmation gate: assigning a role rewrites the user's entire role/permission
// set (and, for self-assignment, the admin's own access), so it is confirmed like
// every other privileged action (design §8) before the mutation fires.
const confirmOpen = ref<boolean>(false)
const confirmDescription = computed<string>(() =>
  isSelf.value ? t('users.assign_confirm_self_desc') : t('users.assign_confirm_desc'),
)

const supportRef = computed<string | null>(() => formatSupportReference(action.requestId.value))
// Step-up (428) gets its own copy (mirrors the create page); every other failure
// falls back to the generic role-assignment failure copy.
const failureMessage = computed<string | undefined>(() => {
  if (action.failure.value === null) return undefined
  return action.status.value === 'step_up_required'
    ? t('users.role_step_up_desc')
    : t('users.role_assign_failed')
})

function openConfirm(): void {
  if (!canAssign.value || selected.value === '') return
  action.reset()
  confirmOpen.value = true
}

function onCancel(): void {
  confirmOpen.value = false
}

async function onConfirm(): Promise<void> {
  confirmOpen.value = false
  if (!canAssign.value || selected.value === '') return

  const result = await action.run(() =>
    usersApi.assignRoles(props.user.subject_id, { role_slugs: [selected.value] as const }),
  )
  if (result === null) return // failure mapped + surfaced inline (copy + REF + step-up link); no stale state

  if (isSelf.value) {
    const ensure = await session.ensureSession(true)
    if (ensure !== 'authenticated') {
      const origin = useRequestURL().origin
      const basePath = useRuntimeConfig().public.basePath
      const resolution = resolveBootstrapFailure(ensure, useRoute().fullPath, origin, basePath)
      if (resolution.kind === 'login') {
        await navigateTo(resolution.url, { external: true })
        return
      }
      if (resolution.kind === 'route') {
        await navigateTo(resolution.to)
        return
      }
    }
  }

  emit('done')
}
</script>

<template>
  <section class="role-assignment" data-section="role-assignment">
    <h2 class="role-assignment__title">{{ t('users.assign_roles_title') }}</h2>

    <p v-if="isSelf" class="role-assignment__warn" role="note">
      {{ t('users.roles_self_warn') }}
    </p>

    <p
      v-if="rolesUnavailable"
      data-testid="roles-unavailable"
      class="role-assignment__warn"
      role="note"
    >
      {{ t('users.roles_unavailable') }}
    </p>

    <UiFormField
      v-else
      id="role-assignment"
      :label="t('users.label_role')"
      :hint="selected === '' ? t('users.roles_min_required') : undefined"
      :error="failureMessage"
    >
      <fieldset class="role-assignment__options">
        <legend class="sr-only">{{ t('users.label_role') }}</legend>
        <label v-for="role in roles" :key="role.slug" class="role-assignment__option">
          <input
            v-model="selected"
            type="radio"
            name="role-assignment"
            :value="role.slug"
            :disabled="!canAssign || action.isSubmitting.value"
          />
          <span>{{ role.name }}</span>
        </label>
      </fieldset>
    </UiFormField>

    <a
      v-if="action.stepUpUrl.value"
      :href="action.stepUpUrl.value"
      data-testid="step-up-link"
      class="role-assignment__step-up"
    >
      {{ t('users.btn_step_up') }}
    </a>

    <p v-if="action.failure.value && supportRef" class="role-assignment__ref">{{ supportRef }}</p>

    <UiButton
      v-if="canAssign && !rolesUnavailable"
      data-testid="role-assign-submit"
      variant="primary"
      size="sm"
      :disabled="selected === '' || action.isSubmitting.value"
      @click="openConfirm"
    >
      {{ t('users.btn_save_roles') }}
    </UiButton>

    <UiAlertDialog
      :open="confirmOpen"
      :title="t('users.assign_confirm_title')"
      :description="confirmDescription"
      :confirm-label="t('common.btn_confirm')"
      :cancel-label="t('common.btn_cancel')"
      :danger="false"
      @confirm="onConfirm"
      @cancel="onCancel"
    />
  </section>
</template>

<style scoped>
.role-assignment {
  display: grid;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}
.role-assignment__title {
  margin: 0;
  font: 600 1rem/1.3 var(--font-sans);
  letter-spacing: -0.01em;
  color: var(--fg);
}
.role-assignment__warn {
  margin: 0;
  padding: 10px 14px;
  font: 500 0.8125rem/1.5 var(--font-sans);
  color: var(--warning-soft-fg);
  background: var(--warning-soft);
  border: 1px solid var(--warning-soft-border);
  border-radius: var(--r-md);
}
.role-assignment__options {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  border: 0;
}
.role-assignment__option {
  display: flex;
  align-items: center;
  gap: 8px;
  font: 400 0.875rem/1.4 var(--font-sans);
  color: var(--fg);
}
.role-assignment__ref {
  margin: 0;
  font: 400 0.75rem/1.4 var(--font-mono);
  color: var(--fg-3);
}
.role-assignment__step-up {
  font: 600 0.8125rem/1 var(--font-sans);
  color: var(--accent);
  text-decoration: underline;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
