<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import EvidenceContextPanel from '@/components/EvidenceContextPanel.vue'
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

const hasPolicyEvidence = computed(
  () => store.policies.length > 0 || store.roles.length > 0 || store.permissions.length > 0,
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

async function handleDeleteRole(roleSlug: string): Promise<void> {
  await store.deleteRole(roleSlug)
}
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

    <div v-if="store.status === 'loading'" class="state-card" role="status">Memuat policy...</div>

    <div
      v-else-if="store.status === 'forbidden'"
      class="state-card state-card--danger"
      role="alert"
    >
      <h2>Akses policy ditolak</h2>
      <p>{{ store.errorMessage }}</p>
    </div>

    <div
      v-else-if="store.status === 'unauthenticated'"
      class="state-card state-card--danger"
      role="alert"
    >
      <h2>Sesi admin berakhir</h2>
      <p>{{ store.errorMessage }}</p>
    </div>

    <div v-else-if="store.status === 'error'" class="state-card state-card--danger" role="alert">
      <h2>Policy/RBAC admin belum bisa dimuat</h2>
      <p>{{ store.errorMessage }}</p>
    </div>

    <div v-else-if="!hasPolicyEvidence" class="state-card" role="status">
      <h2>Policy/RBAC evidence belum tersedia</h2>
      <p>Belum ada policy atau RBAC evidence untuk ditampilkan.</p>
    </div>

    <div v-else class="policy-layout">
      <section class="detail-section" aria-labelledby="policy-versions-title">
        <h2 id="policy-versions-title">Security policy versions</h2>
        <div class="action-row compact-actions">
          <label class="reason-field">
            Category
            <select v-model="category" @change="changeCategory">
              <option value="password">password</option>
              <option value="mfa">mfa</option>
              <option value="session">session</option>
              <option value="lockout">lockout</option>
              <option value="legal_hold">legal_hold</option>
            </select>
          </label>
          <label class="reason-field">
            Reason
            <input v-model="reason" autocomplete="off" />
          </label>
        </div>

        <label v-if="canWriteSecurityPolicy" class="reason-field">
          Draft payload JSON
          <textarea v-model="draftPayload" rows="4" />
        </label>
        <button v-if="canWriteSecurityPolicy" class="primary-action" type="button" @click="proposeDraft">Create draft</button>

        <div v-for="policy in store.policies" :key="policy.id" class="state-card">
          <strong>{{ policy.category }} version {{ policy.version }}</strong>
          <p>{{ policy.status }} · effective {{ policy.effective_at ?? 'not active' }}</p>
          <p>Actor: {{ policy.actor_subject_id ?? 'unknown' }}</p>
          <pre class="policy-json">{{ JSON.stringify(policy.payload, null, 2) }}</pre>
          <div v-if="canActivateSecurityPolicy" class="action-row compact-actions">
            <button
              class="primary-action"
              type="button"
              @click="store.activatePolicy(policy.version, reason)"
            >
              Activate
            </button>
            <button
              class="danger-action"
              type="button"
              @click="store.rollbackPolicy(policy.version, reason)"
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
          <label class="reason-field">
            Name
            <input v-model="createRoleName" name="create-role-name" autocomplete="off" />
          </label>
          <label class="reason-field">
            Slug
            <input v-model="createRoleSlug" name="create-role-slug" autocomplete="off" />
          </label>
          <label class="reason-field">
            Description
            <textarea v-model="createRoleDescription" name="create-role-description" rows="2" />
          </label>
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
            <label class="reason-field">
              Name
              <input v-model="editRoleName" autocomplete="off" />
            </label>
            <label class="reason-field">
              Description
              <textarea v-model="editRoleDescription" rows="2" />
            </label>
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
              <button v-if="canWriteRoles" class="primary-action" type="button" @click="startEditRole(role)">
                Edit
              </button>
              <button
                v-if="canDeleteRoles && !role.is_system"
                class="danger-action"
                type="button"
                :aria-label="`Delete role ${role.slug}`"
                @click="handleDeleteRole(role.slug)"
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
        <ul>
          <li v-for="permission in store.permissions" :key="permission.slug">
            {{ permission.slug }} — {{ permission.category ?? 'uncategorized' }}
          </li>
        </ul>
        <p v-if="store.permissions.length === 0" class="muted">Belum ada permission evidence.</p>
      </section>

      <p v-if="store.errorMessage" class="action-message">{{ store.errorMessage }}</p>
    </div>

    <EvidenceContextPanel title="Policy evidence" :request-id="store.requestId" />
  </section>
</template>
