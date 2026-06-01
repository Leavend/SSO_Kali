<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
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
import { useSessionStore } from '@/stores/session.store'
import { usePolicyStore } from '../stores/policy.store'

const store = usePolicyStore()
const session = useSessionStore()
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
  <section class="policy-page" aria-labelledby="policy-title">
    <div class="page-heading">
      <p class="eyebrow">Security Governance</p>
      <h1 id="policy-title">Policy & RBAC</h1>
      <p class="page-summary">
        Security policy versions, activation evidence, dan role permissions.
      </p>
    </div>

    <UiSkeleton v-if="store.status === 'loading'" label="Memuat policy" />

    <UiStatusView
      v-else-if="store.status === 'forbidden'"
      tone="forbidden"
      eyebrow="Security Governance"
      title="Akses policy ditolak"
      :description="
        store.errorMessage ?? 'Kamu tidak memiliki izin untuk melihat policy/RBAC admin.'
      "
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="store.status === 'unauthenticated'"
      tone="error"
      eyebrow="Session"
      title="Sesi admin berakhir"
      :description="store.errorMessage ?? 'Login ulang dari portal untuk melanjutkan.'"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="store.status === 'error'"
      tone="api"
      eyebrow="Admin API"
      title="Policy/RBAC admin belum bisa dimuat"
      :description="
        store.errorMessage ?? 'Coba muat ulang atau gunakan correlation ID untuk investigasi.'
      "
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <UiEmptyState
      v-else-if="!hasPolicyEvidence"
      title="Policy/RBAC evidence belum tersedia"
      description="Belum ada policy atau RBAC evidence untuk ditampilkan."
    />

    <div v-else class="policy-layout">
      <section class="detail-section" aria-labelledby="policy-versions-title">
        <h2 id="policy-versions-title">Security policy versions</h2>
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
          class="primary-action"
          type="button"
          @click="proposeDraft"
        >
          Create draft
        </button>

        <div v-for="policy in store.policies" :key="policy.id" class="state-card">
          <strong>{{ policy.category }} version {{ policy.version }}</strong>
          <p>{{ policy.status }} · effective {{ policy.effective_at ?? 'not active' }}</p>
          <p>Actor: {{ policy.actor_subject_id ?? 'unknown' }}</p>
          <pre class="policy-json">{{ JSON.stringify(policy.payload, null, 2) }}</pre>
          <div v-if="canActivateSecurityPolicy" class="action-row compact-actions">
            <button
              class="policy-activate-button primary-action"
              type="button"
              @click="requestActivatePolicy(policy.version)"
            >
              Activate
            </button>
            <button
              class="policy-rollback-button danger-action"
              type="button"
              @click="requestRollbackPolicy(policy.version)"
            >
              Rollback
            </button>
          </div>
        </div>
        <p v-if="store.policies.length === 0" class="muted">Belum ada policy version.</p>
      </section>

      <section class="detail-section" aria-labelledby="roles-title">
        <h2 id="roles-title">Roles</h2>
        <button
          v-if="canWriteRoles"
          class="primary-action create-role-toggle"
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
            class="primary-action"
            type="button"
            :disabled="store.actionStatus === 'loading'"
            @click="submitCreateRole"
          >
            {{ store.actionStatus === 'loading' ? 'Creating...' : 'Create' }}
          </button>
          <p v-if="store.actionStatus === 'step_up_required'" class="action-message">
            {{ store.errorMessage }}
          </p>
          <p v-if="store.actionStatus === 'error'" class="action-message">
            {{ store.errorMessage }}
          </p>
        </div>

        <div v-for="role in store.roles" :key="role.slug" class="state-card">
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
              <button class="primary-action" type="button" @click="submitEditRole">Save</button>
              <button class="secondary-action" type="button" @click="cancelEditRole">Cancel</button>
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
                class="primary-action"
                type="button"
                @click="startEditRole(role)"
              >
                Edit
              </button>
              <button
                v-if="canDeleteRoles && !role.is_system"
                class="danger-action"
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

      <p v-if="store.errorMessage" class="action-message">{{ store.errorMessage }}</p>
    </div>

    <EvidenceContextPanel title="Policy evidence" :request-id="store.requestId" />

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
