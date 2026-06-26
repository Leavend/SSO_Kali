<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from '@/composables/useI18n'
import { useDateFormat } from '@/composables/useDateFormat'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import EvidenceContextPanel from '@/components/EvidenceContextPanel.vue'
import UiDataList, { type UiDataListRow } from '@/components/ui/UiDataList.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiTextarea from '@/components/ui/UiTextarea.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiDetailDrawer from '@/components/ui/UiDetailDrawer.vue'
import { useSessionStore } from '@/stores/session.store'
import { usePolicyStore } from '../stores/policy.store'
import type { SecurityPolicy } from '../types'
import { formatTechnicalPreview } from '@/lib/display-identifiers'

const store = usePolicyStore()
const session = useSessionStore()
const { t } = useI18n()
const dateFormat = useDateFormat()
const canWriteSecurityPolicy = computed(() => session.hasPermission('admin.security-policy.write'))
const canActivateSecurityPolicy = computed(() =>
  session.hasPermission('admin.security-policy.activate'),
)
const canWriteRoles = computed(() => session.hasPermission('admin.roles.write'))
const canDeleteRoles = computed(
  () => canWriteRoles.value && session.hasPermission('admin.sessions.terminate'),
)
const category = ref(store.selectedCategory)
const reason = ref('Security governance update')
const draftPayload = ref('{"min_length":14}')
const showCreateRoleForm = ref(false)

// Policy-version detail drawer (master-detail). Row click selects a version;
// payload + activate/rollback live inside the drawer.
const selectedPolicy = ref<SecurityPolicy | null>(null)
const isPolicyDrawerOpen = computed<boolean>(() => selectedPolicy.value !== null)
function selectPolicy(policy: SecurityPolicy): void {
  selectedPolicy.value = policy
}
function closePolicyDrawer(): void {
  selectedPolicy.value = null
}

const createRoleName = ref('')
const createRoleSlug = ref('')
const createRoleDescription = ref('')

const editingRoleSlug = ref<string | null>(null)
const editRoleName = ref('')
const editRoleDescription = ref('')
type DestructiveAction =
  | { readonly type: 'activate_policy'; readonly version: number }
  | { readonly type: 'rollback_policy'; readonly version: number }
  | { readonly type: 'delete_role'; readonly roleSlug: string }
const pendingAction = ref<DestructiveAction | null>(null)

const hasPolicyEvidence = computed(
  () => store.policies.length > 0 || store.roles.length > 0 || store.permissions.length > 0,
)
const categoryOptions = [
  { value: 'password', label: 'password' },
  { value: 'mfa', label: 'mfa' },
  { value: 'session', label: 'session' },
  { value: 'lockout', label: 'lockout' },
  { value: 'legal_hold', label: 'legal_hold' },
] as const
const permissionColumns = [
  { key: 'slug', label: 'Permission' },
  { key: 'category', label: 'Category' },
] as const
const permissionRows = computed<readonly UiDataListRow[]>(() =>
  store.permissions.map((permission) => ({
    id: permission.slug,
    slug: permission.slug,
    category: permission.category ?? 'uncategorized',
  })),
)

onMounted(() => {
  if (store.status === 'idle') void store.load()
})

async function changeCategory(): Promise<void> {
  await store.selectCategory(category.value)
}

async function proposeDraft(): Promise<void> {
  const parsed = JSON.parse(draftPayload.value) as Record<string, unknown>
  await store.proposePolicy(parsed, reason.value)
}

function resetCreateRoleForm(): void {
  createRoleName.value = ''
  createRoleSlug.value = ''
  createRoleDescription.value = ''
}

async function submitCreateRole(): Promise<void> {
  await store.createRole({
    slug: createRoleSlug.value.trim() || undefined,
    name: createRoleName.value.trim(),
    description: createRoleDescription.value.trim() || null,
  })
  if (store.actionStatus === 'success') {
    resetCreateRoleForm()
    showCreateRoleForm.value = false
  }
}

function startEditRole(role: {
  readonly slug: string
  readonly name: string
  readonly description?: string | null
}): void {
  editingRoleSlug.value = role.slug
  editRoleName.value = role.name
  editRoleDescription.value = role.description ?? ''
}

function cancelEditRole(): void {
  editingRoleSlug.value = null
  editRoleName.value = ''
  editRoleDescription.value = ''
}

async function submitEditRole(): Promise<void> {
  if (!editingRoleSlug.value) return
  const target = store.roles.find((r) => r.slug === editingRoleSlug.value)
  const slug = target?.is_system ? undefined : editingRoleSlug.value

  await store.updateRole(editingRoleSlug.value, {
    name: editRoleName.value.trim(),
    description: editRoleDescription.value.trim() || null,
  })
  if (store.actionStatus === 'success') cancelEditRole()
}

function requestActivatePolicy(version: number): void {
  pendingAction.value = { type: 'activate_policy', version }
}

function requestRollbackPolicy(version: number): void {
  pendingAction.value = { type: 'rollback_policy', version }
}

function requestDeleteRole(roleSlug: string): void {
  pendingAction.value = { type: 'delete_role', roleSlug }
}

function cancelDestructiveAction(): void {
  pendingAction.value = null
}

async function confirmDestructiveAction(): Promise<void> {
  const action = pendingAction.value
  pendingAction.value = null
  if (action?.type === 'activate_policy') await store.activatePolicy(action.version, reason.value)
  if (action?.type === 'rollback_policy') await store.rollbackPolicy(action.version, reason.value)
  if (action?.type === 'delete_role') await store.deleteRole(action.roleSlug)
}

const confirmTitle = computed<string>(() => {
  if (pendingAction.value?.type === 'activate_policy') return 'Activate policy version?'
  if (pendingAction.value?.type === 'rollback_policy') return 'Rollback policy version?'
  if (pendingAction.value?.type === 'delete_role') return 'Delete admin role?'
  return 'Confirm admin action?'
})

const confirmDescription = computed<string>(() => {
  if (pendingAction.value?.type === 'activate_policy') {
    return `This will activate ${category.value} policy version ${pendingAction.value.version}.`
  }
  if (pendingAction.value?.type === 'rollback_policy') {
    return `This will roll back ${category.value} policy to version ${pendingAction.value.version}.`
  }
  if (pendingAction.value?.type === 'delete_role') {
    return `This will delete role ${pendingAction.value.roleSlug}. Existing assignments may change.`
  }
  return 'Review the impact before continuing.'
})
</script>

<template>
  <section class="policy-page max-w-page mx-auto px-4 md:px-6 py-8" aria-labelledby="policy-title">
    <div class="page-heading">
      <p class="eyebrow">{{ t('policy.eyebrow') }}</p>
      <h1 id="policy-title">{{ t('policy.title') }}</h1>
      <p class="page-summary">{{ t('policy.summary') }}</p>
    </div>

    <UiSkeleton v-if="store.status === 'loading'" :label="t('policy.loading')" />

    <UiStatusView
      v-else-if="store.status === 'forbidden'"
      tone="forbidden"
      :eyebrow="t('policy.eyebrow')"
      :title="t('policy.forbidden_title')"
      :description="store.errorMessage ?? t('common.forbidden_desc')"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="store.status === 'unauthenticated'"
      tone="error"
      eyebrow="Session"
      :title="t('common.session_expired_title')"
      :description="store.errorMessage ?? t('common.session_expired_desc')"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="store.status === 'error'"
      tone="api"
      eyebrow="Admin API"
      :title="t('policy.error_title')"
      :description="store.errorMessage ?? t('common.error_loading_desc')"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <UiEmptyState
      v-else-if="!hasPolicyEvidence"
      :title="t('policy.empty_title')"
      :description="t('policy.empty_desc')"
    />

    <div v-else class="policy-layout">
      <section class="detail-section" aria-labelledby="policy-versions-title">
        <h2 id="policy-versions-title">{{ t('policy.versions_title') }}</h2>
        <div class="action-row compact-actions">
          <UiFormField id="policy-category" label="Category">
            <UiSelect
              id="policy-category"
              v-model="category"
              :options="categoryOptions"
              @change="changeCategory"
            />
          </UiFormField>
          <UiFormField id="policy-reason" label="Reason">
            <UiInput id="policy-reason" v-model="reason" autocomplete="off" />
          </UiFormField>
        </div>

        <UiFormField
          v-if="canWriteSecurityPolicy"
          id="policy-draft-payload"
          label="Draft payload JSON"
        >
          <UiTextarea id="policy-draft-payload" v-model="draftPayload" :rows="4" />
        </UiFormField>
        <button
          v-if="canWriteSecurityPolicy"
          class="ui-action ui-action--primary"
          type="button"
          @click="proposeDraft"
        >
          Create draft
        </button>

        <div class="tbl-shell">
          <div class="tbl-scroll">
            <table class="tbl tbl--clickable policy-versions-table">
              <thead>
                <tr>
                  <th scope="col">{{ t('policy.col_version') }}</th>
                  <th scope="col">{{ t('policy.col_effective') }}</th>
                  <th scope="col" class="tbl__cell--right">{{ t('policy.col_status') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="policy in store.policies"
                  :key="policy.id"
                  class="policy-row"
                  :class="{ 'policy-row--active': selectedPolicy?.id === policy.id }"
                  role="button"
                  tabindex="0"
                  :aria-label="`${policy.category} version ${policy.version}`"
                  @click="selectPolicy(policy)"
                  @keydown.enter="selectPolicy(policy)"
                  @keydown.space.prevent="selectPolicy(policy)"
                >
                  <td :data-label="t('policy.col_version')">
                    <span class="tbl__rowname">
                      <span class="tbl__rowmeta">
                        <span class="tbl__primary"
                          >{{ policy.category }} version {{ policy.version }}</span
                        >
                        <span class="tbl__secondary"
                          >Kode admin: {{ formatTechnicalPreview(policy.actor_subject_id) }}</span
                        >
                      </span>
                    </span>
                  </td>
                  <td :data-label="t('policy.col_effective')">
                    {{ dateFormat.smart(policy.effective_at) }}
                  </td>
                  <td :data-label="t('policy.col_status')" class="tbl__cell--right">
                    <UiStatusBadge :status="policy.status" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <p v-if="store.policies.length === 0" class="muted">{{ t('policy.no_policy') }}</p>
      </section>

      <section class="detail-section" aria-labelledby="roles-title">
        <h2 id="roles-title">Roles</h2>
        <button
          v-if="canWriteRoles"
          class="ui-action ui-action--primary create-role-toggle"
          type="button"
          @click="showCreateRoleForm = !showCreateRoleForm"
        >
          {{ showCreateRoleForm ? 'Cancel' : 'Create Role' }}
        </button>

        <div v-if="canWriteRoles && showCreateRoleForm" class="create-role-form">
          <h3>Create Role</h3>
          <UiFormField id="create-role-name" label="Name" required>
            <UiInput
              id="create-role-name"
              v-model="createRoleName"
              name="create-role-name"
              autocomplete="off"
            />
          </UiFormField>
          <UiFormField id="create-role-slug" label="Slug">
            <UiInput
              id="create-role-slug"
              v-model="createRoleSlug"
              name="create-role-slug"
              autocomplete="off"
            />
          </UiFormField>
          <UiFormField id="create-role-description" label="Description">
            <UiTextarea
              id="create-role-description"
              v-model="createRoleDescription"
              name="create-role-description"
              :rows="2"
            />
          </UiFormField>
          <button
            class="ui-action ui-action--primary"
            type="button"
            :disabled="store.actionStatus === 'loading'"
            @click="submitCreateRole"
          >
            {{ store.actionStatus === 'loading' ? 'Creating...' : 'Create' }}
          </button>
          <p v-if="store.actionStatus === 'step_up_required'" class="ui-action-message">
            {{ store.errorMessage }}
          </p>
          <p v-if="store.actionStatus === 'error'" class="ui-action-message">
            {{ store.errorMessage }}
          </p>
        </div>

        <div v-for="role in store.roles" :key="role.slug" class="ui-card">
          <template v-if="editingRoleSlug === role.slug">
            <UiFormField :id="`edit-role-name-${role.slug}`" label="Name" required>
              <UiInput
                :id="`edit-role-name-${role.slug}`"
                v-model="editRoleName"
                autocomplete="off"
              />
            </UiFormField>
            <UiFormField :id="`edit-role-description-${role.slug}`" label="Description">
              <UiTextarea
                :id="`edit-role-description-${role.slug}`"
                v-model="editRoleDescription"
                :rows="2"
              />
            </UiFormField>
            <div class="action-row compact-actions">
              <button class="ui-action ui-action--primary" type="button" @click="submitEditRole">
                Save
              </button>
              <button class="ui-action ui-action--secondary" type="button" @click="cancelEditRole">
                Cancel
              </button>
            </div>
          </template>
          <template v-else>
            <strong>{{ role.name }}</strong>
            <p>{{ role.slug }} · {{ role.users_count ?? 0 }} users</p>
            <p v-if="role.description" class="muted">{{ role.description }}</p>
            <ul>
              <li v-for="permission in role.permissions" :key="permission.slug">
                {{ permission.slug }}
              </li>
            </ul>
            <div class="action-row compact-actions">
              <button
                v-if="canWriteRoles"
                class="ui-action ui-action--primary"
                type="button"
                @click="startEditRole(role)"
              >
                Edit
              </button>
              <button
                v-if="canDeleteRoles && !role.is_system"
                class="ui-action ui-action--danger"
                type="button"
                :aria-label="`Delete role ${role.slug}`"
                @click="requestDeleteRole(role.slug)"
              >
                Delete
              </button>
            </div>
          </template>
        </div>
        <p v-if="store.roles.length === 0" class="muted">Belum ada role.</p>
      </section>

      <section class="detail-section" aria-labelledby="permissions-title">
        <h2 id="permissions-title">Permission catalog</h2>
        <UiDataList
          v-if="store.permissions.length > 0"
          caption="Permission catalog"
          :columns="permissionColumns"
          :rows="permissionRows"
        />
        <p v-if="store.permissions.length === 0" class="muted">Belum ada permission evidence.</p>
      </section>

      <p v-if="store.errorMessage" class="ui-action-message">{{ store.errorMessage }}</p>
    </div>

    <EvidenceContextPanel title="Policy evidence" :request-id="store.requestId" />

    <UiDetailDrawer
      v-if="selectedPolicy"
      :open="isPolicyDrawerOpen"
      title-id="policy-detail-drawer"
      :title="`${selectedPolicy.category} version ${selectedPolicy.version}`"
      :description="t('policy.detail_desc')"
      :close-label="t('policy.close_detail')"
      wide
      @close="closePolicyDrawer"
    >
      <div class="policy-detail">
        <div class="policy-detail__head">
          <UiStatusBadge :status="selectedPolicy.status" />
          <span class="policy-detail__effective"
            >effective {{ dateFormat.smart(selectedPolicy.effective_at) }}</span
          >
        </div>
        <p class="policy-detail__admin">
          Kode admin: {{ formatTechnicalPreview(selectedPolicy.actor_subject_id) }}
        </p>
        <pre class="policy-json">{{ JSON.stringify(selectedPolicy.payload, null, 2) }}</pre>
        <div v-if="canActivateSecurityPolicy" class="policy-detail__actions">
          <button
            class="policy-activate-button ui-action ui-action--primary"
            type="button"
            @click="requestActivatePolicy(selectedPolicy.version)"
          >
            {{ t('policy.btn_activate') }}
          </button>
          <button
            class="policy-rollback-button ui-action ui-action--danger"
            type="button"
            @click="requestRollbackPolicy(selectedPolicy.version)"
          >
            {{ t('policy.btn_rollback') }}
          </button>
        </div>
      </div>
    </UiDetailDrawer>

    <ConfirmDialog
      :open="pendingAction !== null"
      :title="confirmTitle"
      :description="confirmDescription"
      confirm-label="Continue"
      cancel-label="Cancel"
      @confirm="confirmDestructiveAction"
      @cancel="cancelDestructiveAction"
    />
  </section>
</template>

<style scoped>
.policy-versions-table {
  width: 100%;
}

.policy-row {
  cursor: pointer;
}

.policy-row:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--primary-ring);
}

.policy-row--active {
  background: var(--primary-soft);
}

.policy-detail {
  display: grid;
  gap: 16px;
}

.policy-detail__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.policy-detail__effective,
.policy-detail__admin {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--fg-2);
}

.policy-detail__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
</style>
