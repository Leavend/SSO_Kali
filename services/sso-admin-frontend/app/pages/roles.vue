<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { AlertTriangle } from 'lucide-vue-next'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { useRolesList } from '@/composables/useRolesList'
import { usePermissionCatalog } from '@/composables/usePermissionCatalog'
import {
  buildRoleGrantMap,
  describePermissionImpact,
  diffRoleGrants,
  togglePendingGrant,
  type RoleGrantMap,
} from '@/lib/roles/roles-matrix'
import { resolveBootstrapFailure } from '@/lib/auth/admin-guard-resolver'
import { usePrivilegedAction } from '@/composables/usePrivilegedAction'
import { rolesApi } from '@/services/roles.api'
import type {
  AdminPermission,
  AdminRole,
  CreateRolePayload,
  RoleMutationResponse,
  UpdateRolePayload,
} from '@/types/users.types'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import RolesTable from '@/components/roles/RolesTable.vue'
import RoleMatrix from '@/components/roles/RoleMatrix.vue'
import RoleFormDialog from '@/components/roles/RoleFormDialog.vue'
import PrivilegedActionDialog from '@/components/users/PrivilegedActionDialog.vue'

definePageMeta({
  name: 'admin.roles',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.roles.read'],
})

const { t } = useI18n()

// SAFE HYDRATION: resolve the masked principal server-side (display name, role,
// capability flags only). OIDC tokens stay in Nitro event.context and are never
// written to useState / __NUXT__. The roles + permission DTOs carry only slugs,
// names, descriptions and counts — no token/secret/PII.
const store = useSessionStore()
await useAsyncData('admin-roles-principal', () => store.ensureSession())

const {
  roles,
  paged,
  viewState,
  requestId,
  total,
  filteredTotal,
  page,
  pageCount,
  query,
  isStale,
  refresh,
} = useRolesList()

const { permissions } = usePermissionCatalog()

const canWrite = computed<boolean>(() => store.hasPermission('admin.roles.write'))
// Delete is the high-privilege exception: the backend route requires ROLES_WRITE
// AND SESSIONS_TERMINATE (+ admin-session-management role + :step_up freshness),
// so the affordance is double-gated; the backend re-checks regardless.
const canDelete = computed<boolean>(
  () => store.hasPermission('admin.roles.write') && store.hasPermission('admin.sessions.terminate'),
)

const roleList = computed<readonly AdminRole[]>(() => roles.value ?? [])
const permissionList = computed<readonly AdminPermission[]>(() => permissions.value ?? [])

// Page-owned pending grant state. originalGrants is the server snapshot; pending
// is the in-flight edit map; dirtyRoleSlugs drives which column's Save is enabled.
const originalGrants = computed<RoleGrantMap>(() => buildRoleGrantMap(roleList.value))
const pendingGrants = ref<RoleGrantMap>(buildRoleGrantMap(roleList.value))
watch(
  originalGrants,
  (next) => {
    pendingGrants.value = next
  },
  { immediate: true },
)

const dirtyRoleSlugs = computed<readonly string[]>(() =>
  roleList.value
    .filter(
      (role) =>
        diffRoleGrants(
          originalGrants.value.get(role.slug) ?? new Set<string>(),
          pendingGrants.value.get(role.slug) ?? new Set<string>(),
        ).changed,
    )
    .map((role) => role.slug),
)

// Page-level success feedback (no toast component exists in this app). 7.8/7.9/7.10
// each set `successMessage.value = t('roles.<x>_success')` and REUSE the single
// aria-live region below — they do not add their own success markup.
const successMessage = ref<string | null>(null)

// --- Create + edit-metadata write flow (Task 7.8) ---------------------------
// Both writes are privileged (ROLES_WRITE · :write freshness). Create and update
// own SEPARATE usePrivilegedAction instances; `formAction` bridges whichever is
// active to the single shared RoleFormDialog (its error/fieldErrors/stepUpUrl/
// submitting), so the full failure matrix routes through one surface for both.
const dialogOpen = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const editingRole = ref<AdminRole | null>(null)

const createAction = usePrivilegedAction<RoleMutationResponse>()
const updateAction = usePrivilegedAction<RoleMutationResponse>()
const formAction = computed(() => (dialogMode.value === 'create' ? createAction : updateAction))

// Map the privileged-action field errors (Record<string,string[]>) → the dialog's
// RoleFormFieldErrors (first message per field).
const dialogFieldErrors = computed(() => {
  const fe = formAction.value.fieldErrors.value
  return {
    slug: fe.slug?.[0],
    name: fe.name?.[0],
    description: fe.description?.[0],
  }
})

// Safe, status-keyed copy — never a raw backend exception.
const dialogError = computed<string | null>(() => {
  switch (formAction.value.status.value) {
    case 'forbidden':
      return t('common.forbidden_desc')
    case 'unauthenticated':
      return t('common.session_expired_desc')
    case 'step_up_required':
      return t('roles.error_title')
    case 'rate_limited':
    case 'error':
      return t('common.error_generic')
    default:
      return null
  }
})

function closeDialog(): void {
  dialogOpen.value = false
}

async function onDialogSubmit(payload: CreateRolePayload | UpdateRolePayload): Promise<void> {
  if (dialogMode.value === 'create') {
    const created = await createAction.run(() => rolesApi.store(payload as CreateRolePayload))
    if (created) {
      dialogOpen.value = false
      successMessage.value = t('roles.roles_create_success')
      await refresh()
    }
    return
  }
  const slug = editingRole.value?.slug
  if (!slug) return
  const updated = await updateAction.run(() => rolesApi.update(slug, payload as UpdateRolePayload))
  if (updated) {
    dialogOpen.value = false
    successMessage.value = t('roles.roles_update_success')
    await refresh()
  }
}

function onMatrixToggle(payload: {
  roleSlug: string
  permissionSlug: string
  granted: boolean
}): void {
  pendingGrants.value = togglePendingGrant(
    pendingGrants.value,
    payload.roleSlug,
    payload.permissionSlug,
    payload.granted,
  )
}

// --- Sync-permissions write flow (Task 7.9) ---------------------------------
// The highest-impact role write: editing a role's permission set changes access
// for everyone holding it, so RoleMatrix's save routes through the reused
// PrivilegedActionDialog with a blast-radius impact summary before the PUT.
const sync = usePrivilegedAction<RoleMutationResponse>()
const syncTarget = ref<AdminRole | null>(null)

// originalGrants (server snapshot) + pendingGrants + the read-only dirtyRoleSlugs
// computed all come from above — reuse, do NOT re-declare.
const syncDiff = computed(() =>
  syncTarget.value
    ? diffRoleGrants(
        originalGrants.value.get(syncTarget.value.slug) ?? new Set<string>(),
        pendingGrants.value.get(syncTarget.value.slug) ?? new Set<string>(),
      )
    : null,
)

// Self-lockout guard: is the edited role one the acting admin currently holds?
const syncIsSelf = computed<boolean>(
  () => syncTarget.value != null && (store.roles ?? []).includes(syncTarget.value.slug),
)

// Operational-write impact summary: role name + users touched, plus a distinct
// self-warning line when the acting admin holds the role.
const syncDescription = computed<string>(() => {
  const role = syncTarget.value
  const diff = syncDiff.value
  if (!role || !diff) return ''
  const impact = describePermissionImpact(role, diff)
  const base = `${t('roles.confirm_sync_permissions_desc', { target: role.name })} ${t('roles.impact_users_affected', { count: impact.affectedUsers })}`
  return syncIsSelf.value ? `${base} ${t('roles.self_affect_warn')}` : base
})

// Step-up drives its own link, never the generic error line.
const syncErrorMessage = computed<string | null>(() =>
  sync.failure.value && sync.failure.value.status !== 'step_up_required'
    ? t('common.error_generic')
    : null,
)

// Shared self-lockout re-verify. After a self-affecting mutation, re-confirm the
// principal; if it dropped, route out via the bootstrap-failure resolver
// (mirror UserRoleAssignment.vue).
async function reverifySelf(): Promise<void> {
  const ensure = await store.ensureSession(true)
  if (ensure === 'authenticated') return
  const resolution = resolveBootstrapFailure(
    ensure,
    useRoute().fullPath,
    useRequestURL().origin,
    useRuntimeConfig().public.basePath,
  )
  if (resolution.kind === 'login') await navigateTo(resolution.url, { external: true })
  else if (resolution.kind === 'route') await navigateTo(resolution.to)
}

// Canonical handler names — declared ONCE here. Tasks 7.8–7.10 REPLACE the body of
// the matching handler (openCreate/openEdit · onMatrixSave · onDeleteRequested ·
// onSelectRole) without renaming, so every @event binding keeps resolving.
function openCreate(): void {
  createAction.reset()
  successMessage.value = null
  dialogMode.value = 'create'
  editingRole.value = null
  dialogOpen.value = true
}
function openEdit(role: AdminRole): void {
  updateAction.reset()
  successMessage.value = null
  dialogMode.value = 'edit'
  editingRole.value = role
  dialogOpen.value = true
}
function onManagePermissions(_role: AdminRole): void {
  /* Intentional no-op anchor this phase: the role × permission matrix below is the
     always-visible edit surface (toggle a cell, then save per role). No per-role
     focus state is wired in Phase 7. */
}
function onMatrixSave(roleSlug: string): void {
  const role = (roles.value ?? []).find((r) => r.slug === roleSlug)
  if (!role || role.is_system) return // system columns never reach save
  sync.reset()
  successMessage.value = null
  syncTarget.value = role
}

async function onSyncConfirm(): Promise<void> {
  const role = syncTarget.value
  const diff = syncDiff.value
  if (!role || !diff) return
  const selfAffecting = syncIsSelf.value
  const result = await sync.run(() =>
    rolesApi.syncPermissions(role.slug, { permission_slugs: diff.permission_slugs }),
  )
  if (result === null) return // failure stays in the dialog (safe copy + REF + step-up)
  await refresh()
  pendingGrants.value = buildRoleGrantMap(roles.value ?? []) // reseed → dirtyRoleSlugs recomputes (read-only)
  syncTarget.value = null
  successMessage.value = t('roles.roles_permissions_success')
  if (selfAffecting) await reverifySelf() // self-affecting: re-verify, re-route if the session dropped
}

function onSyncCancel(): void {
  syncTarget.value = null
  sync.reset()
}
function onDeleteRequested(_role: AdminRole): void {
  /* open delete confirm (Task 7.10) */
}
function onSelectRole(_slug: string): void {
  /* open role detail drawer (deferred) */
}

function onNext(): void {
  if (page.value < pageCount.value) page.value += 1
}
function onPrevious(): void {
  if (page.value > 1) page.value -= 1
}
async function onRefresh(): Promise<void> {
  await refresh()
}
</script>

<template>
  <section class="roles" data-page="roles" data-admin-shell>
    <header class="roles__hero">
      <span class="roles__eyebrow">{{ t('roles.eyebrow') }}</span>
      <div class="roles__heading">
        <div class="roles__heading-text">
          <h1 class="roles__title">{{ t('roles.title') }}</h1>
          <p class="roles__summary">{{ t('roles.summary') }}</p>
          <p class="roles__principal" data-principal-name>
            {{ t('roles.signed_in_as', { name: store.principal?.display_name ?? '—' }) }}
          </p>
        </div>
        <UiButton
          v-if="canWrite"
          variant="primary"
          size="sm"
          data-testid="roles-create"
          @click="openCreate"
        >
          {{ t('roles.btn_create_role') }}
        </UiButton>
      </div>
      <dl v-if="total > 0" class="roles__evidence">
        <dt>{{ t('roles.title') }}</dt>
        <dd><UiFolio :index="filteredTotal" :total="total" /></dd>
      </dl>
    </header>

    <!-- Single page-level success region — reused by create/edit/sync/delete (7.8–7.10). -->
    <p
      v-if="successMessage"
      class="roles__success"
      role="status"
      aria-live="polite"
      data-testid="roles-action-success"
    >
      {{ successMessage }}
    </p>

    <UiSkeleton v-if="viewState === 'loading'" :rows="6" :label="t('roles.loading')" />

    <UiStatusView
      v-else-if="viewState === 'forbidden'"
      tone="forbidden"
      :eyebrow="t('roles.eyebrow')"
      :title="t('roles.forbidden_title')"
      :description="t('common.forbidden_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'unauthenticated'"
      tone="step_up"
      :eyebrow="t('roles.eyebrow')"
      :title="t('common.session_expired_title')"
      :description="t('common.session_expired_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'error'"
      tone="error"
      :eyebrow="t('roles.eyebrow')"
      :title="t('roles.error_title')"
      :description="t('common.error_loading_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    >
      <template #actions>
        <UiButton variant="secondary" size="sm" data-testid="roles-refresh" @click="onRefresh">
          {{ t('common.btn_refresh') }}
        </UiButton>
      </template>
    </UiStatusView>

    <UiEmptyState
      v-else-if="viewState === 'empty'"
      :title="t('roles.empty_title')"
      :description="t('roles.empty_desc')"
    >
      <template #action>
        <UiButton variant="secondary" size="sm" @click="onRefresh">
          {{ t('common.btn_refresh') }}
        </UiButton>
      </template>
    </UiEmptyState>

    <template v-else>
      <div v-if="isStale" class="roles__banner" role="status">
        <AlertTriangle :size="16" aria-hidden="true" />
        <span>{{ t('common.error_loading_desc') }}</span>
      </div>

      <div class="roles__controls">
        <UiInput
          v-model="query"
          class="roles__search"
          :placeholder="t('roles.search_placeholder')"
          :aria-label="t('roles.label_search')"
        />
      </div>

      <RolesTable
        :roles="paged"
        :caption="t('roles.list_title')"
        :role-label="t('roles.col_role')"
        :users-label="t('roles.col_users')"
        :status-label="t('roles.col_status')"
        :system-label="t('roles.system_role')"
        :custom-label="t('roles.custom_role')"
        :edit-label="t('roles.btn_edit')"
        :manage-permissions-label="t('roles.btn_manage_permissions')"
        :delete-label="t('roles.btn_delete')"
        :can-write="canWrite"
        :can-delete="canDelete"
        :total="filteredTotal"
        :page="page"
        :page-count="pageCount"
        :next-label="t('roles.page_next')"
        :previous-label="t('roles.page_previous')"
        @select="onSelectRole"
        @edit="openEdit"
        @manage-permissions="onManagePermissions"
        @delete="onDeleteRequested"
        @next="onNext"
        @previous="onPrevious"
      />

      <RoleMatrix
        :roles="roleList"
        :permissions="permissionList"
        :grants="pendingGrants"
        :dirty-role-slugs="dirtyRoleSlugs"
        :caption="t('roles.matrix_title')"
        :permission-label="t('roles.col_permission')"
        :category-label="t('roles.col_category')"
        :granted-label="t('roles.granted')"
        :denied-label="t('roles.denied')"
        :save-label="t('roles.btn_save')"
        :can-write="canWrite"
        @toggle="onMatrixToggle"
        @save="onMatrixSave"
      />

      <PrivilegedActionDialog
        v-if="syncTarget"
        :open="syncTarget !== null"
        :title="t('roles.confirm_sync_permissions_title')"
        :description="syncDescription"
        :confirm-label="t('roles.btn_save')"
        :cancel-label="t('roles.btn_cancel')"
        :danger="false"
        :submitting="sync.isSubmitting.value"
        :step-up-url="sync.stepUpUrl.value"
        :error-message="syncErrorMessage"
        :request-id="sync.requestId.value"
        @confirm="onSyncConfirm"
        @cancel="onSyncCancel"
      />
    </template>

    <RoleFormDialog
      :open="dialogOpen"
      :mode="dialogMode"
      :role="editingRole"
      :create-title="t('roles.create_role_title')"
      :edit-title="t('roles.edit_role_title')"
      :slug-label="t('roles.label_slug')"
      :name-label="t('roles.label_name')"
      :description-label="t('roles.label_description')"
      :save-label="t('roles.btn_save')"
      :cancel-label="t('roles.btn_cancel')"
      :step-up-label="t('roles.btn_step_up')"
      :submitting="formAction.isSubmitting.value"
      :field-errors="dialogFieldErrors"
      :error-message="dialogError"
      :request-id="formAction.requestId.value"
      :step-up-url="formAction.stepUpUrl.value"
      @submit="onDialogSubmit"
      @cancel="closeDialog"
    />
  </section>
</template>

<style scoped>
.roles {
  display: grid;
  gap: 24px;
  padding: 24px;
}
.roles__hero {
  display: grid;
  gap: 6px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.roles__eyebrow {
  font: 600 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.roles__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.roles__heading-text {
  display: grid;
  gap: 6px;
}
.roles__title {
  margin: 0;
  font: 600 1.5rem/1.2 var(--font-sans);
  letter-spacing: -0.02em;
  color: var(--fg);
}
.roles__summary {
  margin: 0;
  max-width: 64ch;
  font: 400 0.875rem/1.6 var(--font-sans);
  color: var(--fg-2);
}
.roles__principal {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.roles__success {
  margin: 0;
  padding: 10px 14px;
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--fg);
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
}
.roles__evidence {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 4px 0 0;
}
.roles__evidence dt {
  font: 600 0.625rem/1 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.roles__evidence dd {
  margin: 0;
}
.roles__banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--warning-soft-fg);
  background: var(--warning-soft);
  border: 1px solid var(--warning-soft-fg);
  border-radius: var(--r-sm);
}
.roles__controls {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.roles__search {
  flex: 1 1 280px;
}
</style>
