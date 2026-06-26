<script setup lang="ts">
/**
 * RolesPage — FR-053 / UC-51, UC-56–UC-57, UC-73.
 * Lists, creates, edits, and deletes roles & synchronizes permission matrices.
 * Permission: admin.roles.read, admin.roles.write
 */

import { computed, onMounted, ref } from 'vue'
import { useI18n } from '@/composables/useI18n'
import { useSessionStore } from '@/stores/session.store'
import { useToast } from '@/components/ui/useToast'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiTextarea from '@/components/ui/UiTextarea.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiDetailDrawer from '@/components/ui/UiDetailDrawer.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useRolesStore } from '../stores/roles.store'
import type { AdminRole } from '../types'
import { Shield, Key, Plus, Edit, Trash2, X, Settings } from 'lucide-vue-next'

const store = useRolesStore()
const session = useSessionStore()
const toast = useToast()
const { t } = useI18n()

const canWriteRoles = computed<boolean>(() => session.hasPermission('admin.roles.write'))

const permissionsByGroup = computed<ReadonlyMap<string, readonly string[]>>(() => {
  const map = new Map<string, string[]>()
  for (const perm of store.permissions) {
    const group = perm.group ?? 'General'
    const existing = map.get(group) ?? []
    map.set(group, [...existing, perm.key])
  }
  return map
})

const hasData = computed<boolean>(() => store.roles.length > 0 || store.permissions.length > 0)

// Modal states
const showCreateForm = ref(false)
const showEditForm = ref(false)
const showPermissionsForm = ref(false)

// Confirmation alert state
const showConfirmDelete = ref(false)
const showConfirmPermissions = ref(false)

const activeRole = ref<AdminRole | null>(null)

// Master-detail drawer state. `selectedRole` drives the detail drawer; the
// create/edit/permissions forms keep their own `activeRole` modal context.
const selectedRole = ref<AdminRole | null>(null)
const isDrawerOpen = computed<boolean>(() => selectedRole.value !== null)

function selectRole(role: AdminRole): void {
  selectedRole.value = role
}

function closeDrawer(): void {
  selectedRole.value = null
}

// Form fields
const createForm = ref({
  slug: '',
  name: '',
  description: '',
})
const editForm = ref({
  name: '',
  description: '',
})
const selectedPermissions = ref<string[]>([])

function getPermissionLabel(key: string): string {
  const perm = store.permissions.find((p) => p.key === key)
  return perm?.label || key
}

function openCreateForm(): void {
  createForm.value = { slug: '', name: '', description: '' }
  store.actionError = null
  store.actionStatus = 'idle'
  showCreateForm.value = true
}

function closeCreateForm(): void {
  showCreateForm.value = false
}

async function submitCreateRole(): Promise<void> {
  const slug = createForm.value.slug.trim()
  const name = createForm.value.name.trim()
  if (!slug || !name) {
    store.actionStatus = 'error'
    store.actionError = 'Slug dan Nama wajib diisi.'
    return
  }

  const slugRegex = /^[a-z0-9_-]+$/
  if (!slugRegex.test(slug)) {
    store.actionStatus = 'error'
    store.actionError =
      'Slug hanya boleh berisi huruf kecil, angka, tanda hubung (-), dan garis bawah (_).'
    return
  }

  await store.createRole({
    slug,
    name,
    description: createForm.value.description.trim() || null,
  })

  if (store.actionStatus === 'success') {
    toast.pushToast({ tone: 'success', title: t('roles.roles_create_success') })
    closeCreateForm()
  }
}

function openEditForm(role: AdminRole): void {
  activeRole.value = role
  editForm.value = {
    name: role.name || role.label || '',
    description: role.description || '',
  }
  store.actionError = null
  store.actionStatus = 'idle'
  showEditForm.value = true
}

function closeEditForm(): void {
  showEditForm.value = false
  activeRole.value = null
}

async function submitUpdateRole(): Promise<void> {
  if (!activeRole.value) return
  const name = editForm.value.name.trim()
  if (!name) {
    store.actionStatus = 'error'
    store.actionError = 'Nama wajib diisi.'
    return
  }

  await store.updateRole(activeRole.value.slug, {
    name,
    description: editForm.value.description.trim() || null,
  })

  if (store.actionStatus === 'success') {
    toast.pushToast({ tone: 'success', title: t('roles.roles_update_success') })
    closeEditForm()
  }
}

function openPermissionsForm(role: AdminRole): void {
  activeRole.value = role
  selectedPermissions.value = (role.permissions || []).map((p: any) =>
    p && typeof p === 'object' ? p.slug : p,
  )
  store.actionError = null
  store.actionStatus = 'idle'
  showPermissionsForm.value = true
}

function closePermissionsForm(): void {
  showPermissionsForm.value = false
  activeRole.value = null
}

function promptSyncPermissions(): void {
  showConfirmPermissions.value = true
}

async function submitSyncPermissions(): Promise<void> {
  if (!activeRole.value) return
  showConfirmPermissions.value = false

  await store.syncRolePermissions(activeRole.value.slug, selectedPermissions.value)

  if (store.actionStatus === 'success') {
    toast.pushToast({ tone: 'success', title: t('roles.roles_permissions_success') })
    closePermissionsForm()
  }
}

function promptDeleteRole(role: AdminRole): void {
  activeRole.value = role
  store.actionError = null
  store.actionStatus = 'idle'
  showConfirmDelete.value = true
}

async function submitDeleteRole(): Promise<void> {
  if (!activeRole.value) return
  showConfirmDelete.value = false

  await store.deleteRole(activeRole.value.slug)

  if (store.actionStatus === 'success') {
    toast.pushToast({ tone: 'success', title: t('roles.roles_delete_success') })
    activeRole.value = null
    selectedRole.value = null
  }
}

onMounted(() => {
  if (store.status === 'idle') void store.load()
})
</script>

<template>
  <section class="roles-page max-w-page mx-auto px-4 md:px-6 py-8" aria-labelledby="roles-title">
    <div class="page-heading page-heading--with-action">
      <div>
        <p class="eyebrow">{{ t('roles.eyebrow') }}</p>
        <h1 id="roles-title">{{ t('roles.title') }}</h1>
        <p class="page-summary">{{ t('roles.summary') }}</p>
      </div>
      <UiButton v-if="canWriteRoles" class="create-role-btn" @click="openCreateForm">
        <Plus :size="16" />
        <span>{{ t('roles.btn_create_role') }}</span>
      </UiButton>
    </div>

    <UiSkeleton v-if="store.status === 'loading'" :label="t('roles.loading')" />

    <UiStatusView
      v-else-if="store.status === 'forbidden'"
      tone="forbidden"
      eyebrow="RBAC"
      :title="t('roles.forbidden_title')"
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
      :title="t('roles.error_title')"
      :description="store.errorMessage ?? t('common.error_loading_desc')"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <UiEmptyState
      v-else-if="!hasData"
      :title="t('roles.empty_title')"
      :description="t('roles.empty_desc')"
    />

    <div v-else class="roles-layout">
      <section class="detail-section" aria-labelledby="roles-list-title">
        <h2 id="roles-list-title">
          <Shield :size="20" />
          <span>{{ t('roles.list_title') }}</span>
        </h2>
        <p class="page-summary">{{ t('roles.matrix_desc') }}</p>
        <div class="tbl-shell">
          <div class="tbl-scroll">
            <table class="tbl tbl--clickable roles-table">
              <thead>
                <tr>
                  <th scope="col">{{ t('roles.col_role') }}</th>
                  <th scope="col">{{ t('roles.col_users') }}</th>
                  <th scope="col" class="tbl__cell--right">{{ t('roles.col_status') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="role in store.roles"
                  :key="role.slug"
                  class="roles-row"
                  :class="{ 'roles-row--active': selectedRole?.slug === role.slug }"
                  role="button"
                  tabindex="0"
                  :aria-label="`Role: ${role.label}`"
                  @click="selectRole(role)"
                  @keydown.enter="selectRole(role)"
                  @keydown.space.prevent="selectRole(role)"
                >
                  <td :data-label="t('roles.col_role')">
                    <span class="tbl__rowname">
                      <span class="tbl__rowmeta">
                        <span class="tbl__primary">{{ role.label }}</span>
                        <code class="tbl__secondary">{{ role.slug }}</code>
                      </span>
                    </span>
                  </td>
                  <td :data-label="t('roles.col_users')">
                    <span v-if="role.user_count != null"
                      >{{ role.user_count }} {{ role.user_count === 1 ? 'user' : 'users' }}</span
                    >
                    <span v-else>—</span>
                  </td>
                  <td :data-label="t('roles.col_status')" class="tbl__cell--right">
                    <UiStatusBadge
                      :tone="role.is_system ? 'info' : 'neutral'"
                      :label="role.is_system ? t('roles.system_role') : t('roles.custom_role')"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section class="detail-section" aria-labelledby="permissions-matrix-title">
        <h2 id="permissions-matrix-title">
          <Key :size="20" />
          <span>{{ t('roles.matrix_title') }}</span>
        </h2>
        <p class="page-summary">{{ t('roles.matrix_desc') }}</p>
        <div v-for="[group, perms] in permissionsByGroup" :key="group" class="roles-perm-group">
          <h3 class="perm-group__label">{{ group }}</h3>
          <ul class="roles-perm-list" :aria-label="`Permissions group ${group}`">
            <li v-for="perm in perms" :key="perm" class="roles-perm-item">
              <code>{{ perm }}</code>
            </li>
          </ul>
        </div>
      </section>
    </div>

    <!-- Create role dialog -->
    <div
      v-if="canWriteRoles && showCreateForm"
      class="user-modal-overlay"
      @click.self="closeCreateForm"
    >
      <div
        class="user-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-role-title"
        tabindex="-1"
        @keydown.esc="closeCreateForm"
      >
        <div class="user-modal-header">
          <h3 id="create-role-title">{{ t('roles.create_role_title') }}</h3>
          <button
            class="user-modal-close"
            type="button"
            :aria-label="t('roles.btn_cancel')"
            @click="closeCreateForm"
          >
            <X :size="18" />
          </button>
        </div>

        <form @submit.prevent="submitCreateRole">
          <p
            v-if="store.actionStatus === 'error' && store.actionError"
            class="ui-action-message"
            role="alert"
          >
            {{ store.actionError }}
          </p>

          <div class="user-form-grid">
            <UiFormField id="create-slug" :label="t('roles.label_slug')" required>
              <UiInput
                id="create-slug"
                v-model="createForm.slug"
                name="create-slug"
                autocomplete="off"
                placeholder="e.g. support-agent"
              />
            </UiFormField>
            <UiFormField id="create-name" :label="t('roles.label_name')" required>
              <UiInput
                id="create-name"
                v-model="createForm.name"
                name="create-name"
                autocomplete="off"
                placeholder="e.g. Support Agent"
              />
            </UiFormField>
            <UiFormField id="create-description" :label="t('roles.label_description')">
              <UiTextarea
                id="create-description"
                v-model="createForm.description"
                name="create-description"
                :rows="3"
                placeholder="Optional description of this role"
              />
            </UiFormField>
          </div>

          <div class="user-modal-footer">
            <UiButton variant="secondary" type="button" @click="closeCreateForm">
              {{ t('roles.btn_cancel') }}
            </UiButton>
            <UiButton type="submit" :disabled="store.actionStatus === 'loading'">
              {{
                store.actionStatus === 'loading' ? t('common.creating') : t('roles.btn_create_role')
              }}
            </UiButton>
          </div>
        </form>
      </div>
    </div>

    <!-- Edit role dialog -->
    <div
      v-if="canWriteRoles && showEditForm && activeRole"
      class="user-modal-overlay"
      @click.self="closeEditForm"
    >
      <div
        class="user-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-role-title"
        tabindex="-1"
        @keydown.esc="closeEditForm"
      >
        <div class="user-modal-header">
          <h3 id="edit-role-title">{{ t('roles.edit_role_title') }}</h3>
          <button
            class="user-modal-close"
            type="button"
            :aria-label="t('roles.btn_cancel')"
            @click="closeEditForm"
          >
            <X :size="18" />
          </button>
        </div>

        <form @submit.prevent="submitUpdateRole">
          <p
            v-if="store.actionStatus === 'error' && store.actionError"
            class="ui-action-message"
            role="alert"
          >
            {{ store.actionError }}
          </p>

          <div class="user-form-grid">
            <UiFormField id="edit-slug" :label="t('roles.label_slug')">
              <UiInput id="edit-slug" :model-value="activeRole.slug" name="edit-slug" disabled />
            </UiFormField>
            <UiFormField id="edit-name" :label="t('roles.label_name')" required>
              <UiInput id="edit-name" v-model="editForm.name" name="edit-name" autocomplete="off" />
            </UiFormField>
            <UiFormField id="edit-description" :label="t('roles.label_description')">
              <UiTextarea
                id="edit-description"
                v-model="editForm.description"
                name="edit-description"
                :rows="3"
              />
            </UiFormField>
          </div>

          <div class="user-modal-footer">
            <UiButton variant="secondary" type="button" @click="closeEditForm">
              {{ t('roles.btn_cancel') }}
            </UiButton>
            <UiButton type="submit" :disabled="store.actionStatus === 'loading'">
              {{ store.actionStatus === 'loading' ? t('common.saving') : t('roles.btn_save') }}
            </UiButton>
          </div>
        </form>
      </div>
    </div>

    <!-- Manage Permissions dialog -->
    <div
      v-if="canWriteRoles && showPermissionsForm && activeRole"
      class="user-modal-overlay"
      @click.self="closePermissionsForm"
    >
      <div
        class="user-modal-card"
        style="max-width: 48rem"
        role="dialog"
        aria-modal="true"
        aria-labelledby="permissions-title"
        tabindex="-1"
        @keydown.esc="closePermissionsForm"
      >
        <div class="user-modal-header">
          <h3 id="permissions-title">
            {{ t('roles.edit_permissions_title') }}: {{ activeRole.label }}
          </h3>
          <button
            class="user-modal-close"
            type="button"
            :aria-label="t('roles.btn_cancel')"
            @click="closePermissionsForm"
          >
            <X :size="18" />
          </button>
        </div>

        <form @submit.prevent="promptSyncPermissions">
          <p
            v-if="store.actionStatus === 'error' && store.actionError"
            class="ui-action-message"
            role="alert"
          >
            {{ store.actionError }}
          </p>

          <div
            class="user-form-grid user-form-grid-1"
            style="max-height: 60vh; overflow-y: auto; padding-right: 8px"
          >
            <div v-for="[group, perms] in permissionsByGroup" :key="group" class="roles-perm-group">
              <h4 class="perm-group__label">
                {{ group }}
              </h4>
              <div class="role-selection-grid">
                <div v-for="perm in perms" :key="perm" class="role-checkbox-item">
                  <label :for="`perm-${perm}`" class="role-checkbox-label">
                    <input
                      :id="`perm-${perm}`"
                      v-model="selectedPermissions"
                      type="checkbox"
                      :value="perm"
                      class="role-checkbox-input"
                    />
                    <span class="role-checkbox-custom"></span>
                    <span class="role-checkbox-text">
                      <span class="role-checkbox-name">{{ getPermissionLabel(perm) }}</span>
                      <span class="role-checkbox-slug">{{ perm }}</span>
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div class="user-modal-footer" style="margin-top: 16px">
            <UiButton variant="secondary" type="button" @click="closePermissionsForm">
              {{ t('roles.btn_cancel') }}
            </UiButton>
            <UiButton type="submit" :disabled="store.actionStatus === 'loading'">
              {{ store.actionStatus === 'loading' ? t('common.saving') : t('roles.btn_save') }}
            </UiButton>
          </div>
        </form>
      </div>
    </div>

    <!-- Role detail drawer -->
    <UiDetailDrawer
      v-if="selectedRole"
      :open="isDrawerOpen"
      title-id="role-detail-drawer"
      :title="selectedRole.label"
      :description="t('roles.detail_desc')"
      :close-label="t('roles.close_detail')"
      wide
      @close="closeDrawer"
    >
      <div class="role-detail">
        <div class="role-detail__head">
          <code class="role-detail__slug">{{ selectedRole.slug }}</code>
          <UiStatusBadge
            :tone="selectedRole.is_system ? 'info' : 'neutral'"
            :label="selectedRole.is_system ? t('roles.system_role') : t('roles.custom_role')"
          />
          <span v-if="selectedRole.user_count != null" class="role-detail__count"
            >{{ selectedRole.user_count }}
            {{ selectedRole.user_count === 1 ? 'user' : 'users' }}</span
          >
        </div>

        <p v-if="selectedRole.description" class="role-detail__desc">
          {{ selectedRole.description }}
        </p>

        <section class="role-detail__perms" aria-labelledby="role-detail-perms-title">
          <h3 id="role-detail-perms-title">{{ t('roles.permissions_label') }}</h3>
          <ul
            v-if="selectedRole.permissions.length"
            class="roles-perm-list"
            aria-label="Permissions"
          >
            <li v-for="perm in selectedRole.permissions" :key="perm" class="roles-perm-item">
              <code>{{ perm }}</code>
            </li>
          </ul>
          <p v-else class="muted">{{ t('roles.no_permissions') }}</p>
        </section>

        <div v-if="canWriteRoles" class="role-detail__actions">
          <UiButton
            v-if="!selectedRole.is_system"
            variant="secondary"
            size="sm"
            @click="openEditForm(selectedRole)"
          >
            <Edit :size="14" />
            <span>{{ t('roles.btn_edit') }}</span>
          </UiButton>
          <UiButton variant="secondary" size="sm" @click="openPermissionsForm(selectedRole)">
            <Settings :size="14" />
            <span>{{ t('roles.btn_manage_permissions') }}</span>
          </UiButton>
          <UiButton
            v-if="!selectedRole.is_system"
            variant="danger"
            size="sm"
            @click="promptDeleteRole(selectedRole)"
          >
            <Trash2 :size="14" />
            <span>{{ t('roles.btn_delete') }}</span>
          </UiButton>
        </div>
      </div>
    </UiDetailDrawer>

    <!-- Confirm Delete dialog -->
    <ConfirmDialog
      :open="showConfirmDelete"
      :title="t('roles.confirm_delete_title')"
      :description="t('roles.confirm_delete_desc', { target: activeRole?.label || '' })"
      :confirm-label="t('roles.btn_delete')"
      :cancel-label="t('roles.btn_cancel')"
      :danger="true"
      @confirm="submitDeleteRole"
      @cancel="showConfirmDelete = false"
    />

    <!-- Confirm Sync Permissions dialog -->
    <ConfirmDialog
      :open="showConfirmPermissions"
      :title="t('roles.confirm_sync_permissions_title')"
      :description="t('roles.confirm_sync_permissions_desc', { target: activeRole?.label || '' })"
      :confirm-label="t('roles.btn_save')"
      :cancel-label="t('roles.btn_cancel')"
      :danger="true"
      @confirm="submitSyncPermissions"
      @cancel="showConfirmPermissions = false"
    />
  </section>
</template>

<style scoped>
.roles-table {
  width: 100%;
}

.roles-row {
  cursor: pointer;
}

.roles-row:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--primary-ring);
}

.roles-row--active {
  background: var(--primary-soft);
}

.role-detail {
  display: grid;
  gap: 16px;
}

.role-detail__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.role-detail__slug {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  color: var(--fg-2);
}

.role-detail__count {
  font-size: 0.8125rem;
  color: var(--fg-2);
}

.role-detail__desc {
  margin: 0;
  font-size: 0.875rem;
  color: var(--fg-2);
  line-height: 1.5;
}

.role-detail__perms h3 {
  margin: 0 0 8px;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--fg-2);
}

.role-detail__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.role-detail__actions .ui-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.create-role-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
</style>
