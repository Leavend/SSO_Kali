<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { usePolicyStore } from '../stores/policy.store'

const store = usePolicyStore()
const category = ref(store.selectedCategory)
const reason = ref('Security governance update')
const draftPayload = ref('{"min_length":14}')

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

        <label class="reason-field">
          Draft payload JSON
          <textarea v-model="draftPayload" rows="4" />
        </label>
        <button class="primary-action" type="button" @click="proposeDraft">Create draft</button>

        <div v-for="policy in store.policies" :key="policy.id" class="state-card">
          <strong>{{ policy.category }} version {{ policy.version }}</strong>
          <p>{{ policy.status }} · effective {{ policy.effective_at ?? 'not active' }}</p>
          <p>Actor: {{ policy.actor_subject_id ?? 'unknown' }}</p>
          <pre class="policy-json">{{ JSON.stringify(policy.payload, null, 2) }}</pre>
          <div class="action-row compact-actions">
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
        <div v-for="role in store.roles" :key="role.slug" class="state-card">
          <strong>{{ role.name }}</strong>
          <p>{{ role.slug }} · {{ role.users_count ?? 0 }} users</p>
          <ul>
            <li v-for="permission in role.permissions" :key="permission.slug">
              {{ permission.slug }}
            </li>
          </ul>
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

    <p v-if="store.requestId" class="request-evidence">Request ID: {{ store.requestId }}</p>
  </section>
</template>
